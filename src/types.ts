/**
 * HTTP 请求方法类型
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * HTTP 请求配置接口
 */
export interface HttpRequestConfig {
  /** 请求的 URL 路径 */
  url?: string;

  /** HTTP 请求方法 */
  method?: HttpMethod;

  /** 基础 URL，会与 url 拼接 */
  baseURL?: string;

  /** URL 查询参数 */
  params?: Record<string, any>;

  /** 请求体数据，支持 JSON、FormData、File、Blob 等 */
  data?: any;

  /** 请求头 */
  headers?: Record<string, string>;

  /** 请求超时时间（毫秒） */
  timeout?: number;

  /** 请求失败时的重试次数 */
  retry?: number;

  /** 重试间隔时间（毫秒），支持指数退避 */
  retryDelay?: number;

  /** 是否启用响应缓存 */
  cache?: boolean;

  /** 缓存有效时长（毫秒），默认 5 分钟 */
  cacheTime?: number;

  /** 自定义缓存键，用于精确控制缓存策略 */
  cacheKey?: string;

  /** 中断信号，用于取消请求 */
  signal?: AbortSignal;

  /**
   * 下载进度回调
   * @param progressEvent - 进度事件对象
   */
  onDownloadProgress?: (progressEvent: ProgressEvent) => void;

  /**
   * 上传进度回调
   * @param progressEvent - 进度事件对象
   */
  onUploadProgress?: (progressEvent: ProgressEvent) => void;
}

/**
 * HTTP 响应接口
 * @template T - 响应数据的类型
 */
export interface HttpResponse<T = any> {
  /** 响应数据 */
  data: T;

  /** HTTP 状态码 */
  status: number;

  /** HTTP 状态文本 */
  statusText: string;

  /** 响应头 */
  headers: Headers;

  /** 请求配置 */
  config: HttpRequestConfig;

  /** 原始请求对象 */
  request?: any;
}

/**
 * HTTP 拦截器管理器接口
 * @template V - 拦截器处理的值类型
 */
export interface HttpInterceptorManager<V> {
  /**
   * 注册拦截器
   * @param onFulfilled - 成功回调
   * @param onRejected - 失败回调
   * @returns 拦截器 ID，用于后续移除
   */
  use(onFulfilled?: (value: V) => V | Promise<V>, onRejected?: (error: any) => any): number;

  /**
   * 移除拦截器
   * @param id - 拦截器 ID
   */
  eject(id: number): void;
}

/**
 * HTTP 客户端配置接口
 * 继承自 HttpRequestConfig，增加了全局配置选项
 */
export interface HttpClientConfig extends HttpRequestConfig {
  /** 最大并发请求数，超出后会进入队列等待 */
  concurrency?: number;
}

/**
 * HTTP 错误接口
 * 扩展自标准 Error，包含请求和响应信息
 */
export interface HttpError extends Error {
  /** 请求配置 */
  config: HttpRequestConfig;

  /** 错误代码 */
  code?: string;

  /** 原始请求对象 */
  request?: any;

  /** 响应对象（如果请求已发出） */
  response?: HttpResponse;
}
