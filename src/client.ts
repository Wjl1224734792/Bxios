import type {
  HttpClientConfig,
  HttpRequestConfig,
  HttpResponse,
  HttpInterceptorManager,
} from './types';
import { HttpCache } from './cache';
import { SSEService } from './sse';

/**
 * 拦截器管理器实现
 * 管理请求和响应拦截器的注册、执行和移除
 *
 * @template V - 拦截器处理的值类型（HttpRequestConfig 或 HttpResponse）
 */
class InterceptorManager<V> implements HttpInterceptorManager<V> {
  /** 拦截器处理器数组，null 表示已移除的拦截器 */
  private handlers: Array<{
    fulfilled?: (value: V) => V | Promise<V>;
    rejected?: (error: any) => any;
  } | null> = [];

  /**
   * 注册拦截器
   * @param fulfilled - 成功处理函数
   * @param rejected - 失败处理函数
   * @returns 拦截器 ID，用于后续移除
   */
  use(fulfilled?: (value: V) => V | Promise<V>, rejected?: (error: any) => any): number {
    this.handlers.push({ fulfilled, rejected });
    return this.handlers.length - 1;
  }

  /**
   * 移除指定的拦截器
   * @param id - 拦截器 ID
   */
  eject(id: number): void {
    if (this.handlers[id]) {
      this.handlers[id] = null;
    }
  }

  /**
   * 遍历所有有效的拦截器
   * @param fn - 遍历回调函数
   */
  forEach(fn: (handler: any) => void): void {
    this.handlers.forEach((h) => {
      if (h !== null) {
        fn(h);
      }
    });
  }
}

/**
 * HTTP 客户端
 *
 * 基于 Fetch API 的轻量级 HTTP 客户端，提供：
 * - 请求/响应拦截器
 * - 自动重试和指数退避
 * - 请求缓存
 * - 并发控制
 * - 超时处理
 * - FormData/File/Blob 支持
 * - 流式传输（SSE）
 * - 请求取消
 *
 * @example
 * ```typescript
 * // 创建客户端实例
 * const client = new HttpClient({
 *   baseURL: 'https://api.example.com',
 *   timeout: 10000,
 *   retry: 3
 * });
 *
 * // 发起请求
 * const response = await client.get<User>('/users/123');
 * console.log(response.data);
 *
 * // 使用拦截器
 * client.interceptors.request.use(config => {
 *   config.headers['Authorization'] = 'Bearer token';
 *   return config;
 * });
 * ```
 */
export class HttpClient {
  /** 默认配置 */
  private defaults: HttpClientConfig;

  /** 缓存管理器 */
  private cache: HttpCache;

  /** 待处理请求映射（用于取消请求） */
  private pendingRequests: Map<string, AbortController>;

  /** 并发队列 */
  private concurrencyQueue: Array<() => void>;

  /** 当前活动请求数 */
  private activeRequests: number;

  /** 拦截器 */
  public interceptors = {
    request: new InterceptorManager<HttpRequestConfig>(),
    response: new InterceptorManager<HttpResponse>(),
  };

  /**
   * 创建 HTTP 客户端实例
   * @param config - 客户端配置
   */
  constructor(config: HttpClientConfig = {}) {
    this.defaults = config;
    this.cache = new HttpCache();
    this.pendingRequests = new Map();
    this.concurrencyQueue = [];
    this.activeRequests = 0;
  }

  /**
   * 发起 HTTP 请求
   *
   * 执行完整的请求流程：
   * 1. 合并配置
   * 2. 检查缓存
   * 3. 执行请求拦截器
   * 4. 发送请求
   * 5. 处理响应
   * 6. 执行响应拦截器
   * 7. 缓存结果（如果启用）
   *
   * @template T - 响应数据类型
   * @param config - 请求配置
   * @returns Promise<HttpResponse<T>> - HTTP 响应对象
   *
   * @example
   * ```typescript
   * // 基础请求
   * const response = await client.request<User>({
   *   method: 'GET',
   *   url: '/users/123'
   * });
   *
   * // 带缓存的请求
   * const response = await client.request({
   *   url: '/api/data',
   *   cache: true,
   *   cacheTime: 60000 // 缓存 1 分钟
   * });
   *
   * // 带重试的请求
   * const response = await client.request({
   *   url: '/api/unstable',
   *   retry: 3,
   *   retryDelay: 1000
   * });
   * ```
   */
  async request<T = any>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    // 合并配置
    const mergedConfig: HttpRequestConfig = {
      ...this.defaults,
      ...config,
      headers: { ...this.defaults.headers, ...config.headers },
    };

    // 缓存检查
    if (mergedConfig.cache) {
      const cacheKey = mergedConfig.cacheKey || this.cache.generateKey(mergedConfig);
      const cachedData = this.cache.get<T>(cacheKey);
      if (cachedData) {
        return Promise.resolve({
          data: cachedData,
          status: 200,
          statusText: 'OK (Cached)',
          headers: new Headers(),
          config: mergedConfig,
        });
      }
    }

    // 执行请求拦截器
    let chain = Promise.resolve(mergedConfig);
    this.interceptors.request.forEach((interceptor) => {
      chain = chain.then(interceptor.fulfilled || ((c) => c), interceptor.rejected);
    });

    return chain.then((c) => this.dispatchRequest<T>(c));
  }

  /**
   * 分发请求
   *
   * 处理并发控制、请求取消、重试逻辑和响应解析
   *
   * @template T - 响应数据类型
   * @param config - 请求配置
   * @returns Promise<HttpResponse<T>> - HTTP 响应对象
   * @private
   */
  private async dispatchRequest<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    // 并发控制
    if (this.defaults.concurrency && this.activeRequests >= this.defaults.concurrency) {
      await new Promise<void>((resolve) => {
        this.concurrencyQueue.push(resolve);
      });
    }

    this.activeRequests++;

    // 支持请求取消
    const controller = new AbortController();
    const requestId = this.getRequestId(config);

    if (config.signal) {
      config.signal.addEventListener('abort', () => controller.abort());
    }

    // 存储 controller 以便手动取消（简化实现，主要依赖传入的 signal 或内部逻辑）
    this.pendingRequests.set(requestId, controller);

    try {
      const response = await this.retryRequest(config, controller.signal);

      let responseData: any;
      if (config.onDownloadProgress) {
        // 支持进度处理（使用 clone 读取流）
        // 对于标准 JSON，通常只需 await .json()
        // 如果确实需要 JSON 的进度，必须手动读取流
        responseData = await response.json();
        // 注意：使用 fetch 实现下载进度比较复杂，需要手动读取 Streams API
        // 为了保持"轻量级"，除非明确需要，否则我们跳过复杂的流读取进度
      } else {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
      }

      const httpResponse: HttpResponse<T> = {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config: config,
        request: response,
      };

      // 缓存结果
      if (config.cache) {
        const cacheKey = config.cacheKey || this.cache.generateKey(config);
        this.cache.set(cacheKey, responseData, config.cacheTime);
      }

      // 执行响应拦截器
      let result = Promise.resolve(httpResponse);
      this.interceptors.response.forEach((interceptor) => {
        result = result.then(interceptor.fulfilled || ((r) => r), interceptor.rejected);
      });

      return result;
    } catch (error: any) {
      // 执行响应错误拦截器
      let chain = Promise.reject(error);
      this.interceptors.response.forEach((interceptor) => {
        chain = chain.catch(interceptor.rejected || ((e) => Promise.reject(e)));
      });
      return chain;
    } finally {
      this.activeRequests--;
      this.pendingRequests.delete(requestId);
      this.processQueue();
    }
  }

  /**
   * 带重试机制的请求执行
   *
   * 支持：
   * - 指数退避重试策略
   * - 仅对 5xx 错误重试
   * - 网络错误自动重试
   * - 超时控制
   * - FormData 自动处理
   *
   * @param config - 请求配置
   * @param signal - 中断信号
   * @returns Promise<Response> - 原生 Fetch Response 对象
   * @throws 当重试次数耗尽或请求被中断时抛出错误
   * @private
   */
  private async retryRequest(config: HttpRequestConfig, signal: AbortSignal): Promise<Response> {
    const retries = config.retry || 0;
    const retryDelay = config.retryDelay || 1000;

    let attempt = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const url = this.buildUrl(config.baseURL, config.url, config.params);

        // 处理请求体：FormData 直接传递，其他数据 JSON 序列化
        let body: any;
        if (config.data instanceof FormData) {
          body = config.data;
        } else if (config.data) {
          body = JSON.stringify(config.data);
        }

        const init: RequestInit = {
          method: config.method || 'GET',
          headers: config.headers,
          body: body,
          signal: signal,
        };

        // 超时处理
        if (config.timeout) {
          const timeoutSignal = AbortSignal.timeout(config.timeout);
          // 如果可能合并信号，或仅使用超时信号（如果没有用户信号）
          // 原生 fetch 仅支持一个信号。我们可能需要复合信号逻辑或竞态
          // 为简化处理：
          init.signal = config.signal || timeoutSignal;
        }

        const response = await fetch(url, init);

        if (!response.ok) {
          // 触发重试逻辑（如果需要），或在不重试状态码时直接返回
          // 通常我们仅对网络错误或 5xx 重试
          if (response.status >= 500 && attempt < retries) {
            throw new Error(`Request failed with status ${response.status}`);
          }
        }

        return response;
      } catch (error: any) {
        if (attempt >= retries || error.name === 'AbortError') {
          throw error;
        }
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, retryDelay * Math.pow(2, attempt - 1))); // 指数退避
      }
    }
  }

  /**
   * 处理并发队列
   * 当有请求完成且队列中有等待的请求时，允许下一个请求执行
   * @private
   */
  private processQueue() {
    if (
      this.concurrencyQueue.length > 0 &&
      (!this.defaults.concurrency || this.activeRequests < this.defaults.concurrency)
    ) {
      const next = this.concurrencyQueue.shift();
      next?.();
    }
  }

  /**
   * 构建完整的请求 URL
   *
   * 拼接 baseURL、url 和查询参数
   *
   * @param baseURL - 基础 URL
   * @param url - 请求路径
   * @param params - 查询参数对象
   * @returns 完整的 URL 字符串
   * @private
   *
   * @example
   * ```typescript
   * buildUrl('https://api.com', '/users', { id: 1, active: true })
   * // 返回: 'https://api.com/users?id=1&active=true'
   * ```
   */
  private buildUrl(baseURL?: string, url?: string, params?: Record<string, any>): string {
    let fullUrl = url || '';
    if (baseURL && !fullUrl.startsWith('http')) {
      // 简单拼接，可改进
      fullUrl = `${baseURL.replace(/\/$/, '')}/${fullUrl.replace(/^\//, '')}`;
    }

    if (params) {
      const queryString = new URLSearchParams(params).toString();
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
    }

    return fullUrl;
  }

  /**
   * 生成请求的唯一标识
   * 用于请求取消和并发控制
   *
   * @param config - 请求配置
   * @returns 请求 ID
   * @private
   */
  private getRequestId(config: HttpRequestConfig): string {
    return `${config.method}-${config.url}-${Date.now()}`;
  }

  // ==================== 便捷方法 ====================

  /**
   * 发起 GET 请求
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   *
   * @example
   * ```typescript
   * const response = await client.get<User>('/users/123');
   * console.log(response.data);
   * ```
   */
  get<T>(url: string, config?: HttpRequestConfig) {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  /**
   * 发起 POST 请求
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param data - 请求体数据
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   *
   * @example
   * ```typescript
   * const response = await client.post<User>('/users', {
   *   name: '张三',
   *   email: 'zhangsan@example.com'
   * });
   * ```
   */
  post<T>(url: string, data?: any, config?: HttpRequestConfig) {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  /**
   * 发起 PUT 请求
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param data - 请求体数据
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   */
  put<T>(url: string, data?: any, config?: HttpRequestConfig) {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  /**
   * 发起 PATCH 请求
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param data - 请求体数据
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   */
  patch<T>(url: string, data?: any, config?: HttpRequestConfig) {
    return this.request<T>({ ...config, method: 'PATCH', url, data });
  }

  /**
   * 发起 DELETE 请求
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   */
  delete<T>(url: string, config?: HttpRequestConfig) {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  /**
   * 发起 HEAD 请求
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   */
  head<T>(url: string, config?: HttpRequestConfig) {
    return this.request<T>({ ...config, method: 'HEAD', url });
  }

  /**
   * 发起 OPTIONS 请求
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   */
  options<T>(url: string, config?: HttpRequestConfig) {
    return this.request<T>({ ...config, method: 'OPTIONS', url });
  }

  // ==================== FormData 方法 ====================

  /**
   * 使用 FormData 发起 POST 请求
   *
   * 自动将对象转换为 FormData 格式，支持：
   * - 普通字段
   * - File 对象
   * - Blob 对象
   * - 数组（包括文件数组）
   * - 嵌套对象（JSON 序列化）
   *
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param data - 要转换为 FormData 的数据
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   *
   * @example
   * ```typescript
   * // 文件上传
   * const response = await client.postForm('/upload', {
   *   file: fileInput.files[0],
   *   name: '文档名称',
   *   metadata: { size: 1024, type: 'pdf' }
   * });
   *
   * // 多文件上传
   * const response = await client.postForm('/uploads', {
   *   files: [file1, file2, file3],
   *   category: '图片'
   * });
   * ```
   */
  postForm<T>(url: string, data?: any, config?: HttpRequestConfig) {
    const formData = this.toFormData(data);
    return this.request<T>({
      ...config,
      method: 'POST',
      url,
      data: formData,
      headers: {
        ...config?.headers,
        // 浏览器会自动设置正确的 Content-Type 和 boundary
      },
    });
  }

  /**
   * 使用 FormData 发起 PUT 请求
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param data - 要转换为 FormData 的数据
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   */
  putForm<T>(url: string, data?: any, config?: HttpRequestConfig) {
    const formData = this.toFormData(data);
    return this.request<T>({
      ...config,
      method: 'PUT',
      url,
      data: formData,
      headers: {
        ...config?.headers,
      },
    });
  }

  /**
   * 使用 FormData 发起 PATCH 请求
   * @template T - 响应数据类型
   * @param url - 请求 URL
   * @param data - 要转换为 FormData 的数据
   * @param config - 额外的请求配置
   * @returns Promise<HttpResponse<T>>
   */
  patchForm<T>(url: string, data?: any, config?: HttpRequestConfig) {
    const formData = this.toFormData(data);
    return this.request<T>({
      ...config,
      method: 'PATCH',
      url,
      data: formData,
      headers: {
        ...config?.headers,
      },
    });
  }

  /**
   * 将对象转换为 FormData
   *
   * 转换规则：
   * - File/Blob: 直接添加
   * - Array: 使用 key[index] 格式
   * - Object: JSON 序列化
   * - 其他: 转换为字符串
   * - undefined/null: 跳过
   *
   * @param data - 要转换的数据
   * @returns FormData 对象
   * @private
   *
   * @example
   * ```typescript
   * const formData = toFormData({
   *   name: '张三',
   *   file: fileObject,
   *   tags: ['tag1', 'tag2'],
   *   metadata: { key: 'value' }
   * });
   * // 结果:
   * // name: "张三"
   * // file: [File object]
   * // tags[0]: "tag1"
   * // tags[1]: "tag2"
   * // metadata: "{"key":"value"}"
   * ```
   */
  private toFormData(data: any): FormData {
    if (data instanceof FormData) {
      return data;
    }

    const formData = new FormData();
    if (data && typeof data === 'object') {
      Object.keys(data).forEach((key) => {
        const value = data[key];
        if (value !== undefined && value !== null) {
          if (value instanceof File || value instanceof Blob) {
            formData.append(key, value);
          } else if (Array.isArray(value)) {
            value.forEach((item, index) => {
              if (item instanceof File || item instanceof Blob) {
                formData.append(`${key}[${index}]`, item);
              } else {
                formData.append(`${key}[${index}]`, String(item));
              }
            });
          } else if (typeof value === 'object') {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }
      });
    }
    return formData;
  }

  // ==================== 流式传输方法 ====================

  /**
   * 发起 SSE（Server-Sent Events）流式请求
   *
   * 使用异步生成器处理服务器推送的事件流，支持：
   * - 标准 SSE 格式（data: {...}）
   * - 换行分隔的 JSON 流
   * - 自动 JSON 解析
   * - 请求取消
   * - [DONE] 结束标记
   *
   * @template T - 流式数据类型
   * @param url - 请求 URL
   * @param config - 额外的请求配置
   * @yields 解析后的数据对象
   *
   * @example
   * ```typescript
   * // AI 聊天流式响应
   * const stream = client.sse<ChatMessage>('/chat/stream', {
   *   params: { prompt: 'Hello' }
   * });
   *
   * for await (const message of stream) {
   *   console.log('接收到消息:', message.content);
   *   // 实时更新 UI
   * }
   *
   * // 带取消控制
   * const controller = new AbortController();
   * const stream = client.sse('/events', {
   *   signal: controller.signal
   * });
   *
   * // 5 秒后取消
   * setTimeout(() => controller.abort(), 5000);
   * ```
   */
  async *sse<T>(url: string, config?: HttpRequestConfig): AsyncGenerator<T, void, unknown> {
    const fullUrl = this.buildUrl(this.defaults.baseURL || config?.baseURL, url, config?.params);
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...this.defaults.headers,
        ...config?.headers,
      },
      signal: config?.signal,
    });

    yield* SSEService.streamJson<T>(response);
  }
}
