/**
 * 缓存条目接口
 * @template T - 缓存数据的类型
 */
interface CacheEntry<T> {
  /** 缓存的数据 */
  data: T;

  /** 过期时间戳 */
  expiry: number;
}

/**
 * HTTP 响应缓存管理器
 * 提供基于内存的缓存功能，支持自动过期和清理
 *
 * @example
 * ```typescript
 * const cache = new HttpCache();
 * cache.set('user-123', userData, 5 * 60 * 1000); // 缓存 5 分钟
 * const data = cache.get('user-123'); // 获取缓存
 * ```
 */
export class HttpCache {
  /** 内存缓存存储 */
  private cache = new Map<string, CacheEntry<any>>();

  /**
   * 设置缓存
   * @template T - 数据类型
   * @param key - 缓存键
   * @param data - 要缓存的数据
   * @param ttl - 缓存有效时间（毫秒），默认 5 分钟
   *
   * @example
   * ```typescript
   * cache.set('api-result', { id: 1 }, 10000); // 缓存 10 秒
   * ```
   */
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { data, expiry });
  }

  /**
   * 获取缓存
   * @template T - 数据类型
   * @param key - 缓存键
   * @returns 缓存的数据，如果不存在或已过期则返回 null
   *
   * @example
   * ```typescript
   * const data = cache.get<User>('user-123');
   * if (data) {
   *   console.log('从缓存获取:', data);
   * }
   * ```
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * 删除指定缓存
   * @param key - 缓存键
   *
   * @example
   * ```typescript
   * cache.delete('user-123');
   * ```
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   *
   * @example
   * ```typescript
   * cache.clear(); // 清空所有缓存
   * ```
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 根据请求配置生成缓存键
   * 使用 URL、方法、参数和数据的组合生成唯一标识
   *
   * @param config - 请求配置对象
   * @returns 缓存键字符串
   *
   * @example
   * ```typescript
   * const key = cache.generateKey({
   *   url: '/api/users',
   *   method: 'GET',
   *   params: { id: 1 }
   * });
   * ```
   */
  generateKey(config: any): string {
    const { url, method, params, data } = config;
    return JSON.stringify({ url, method, params, data });
  }
}
