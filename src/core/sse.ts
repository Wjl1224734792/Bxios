/**
 * 服务器发送事件（SSE）和流式响应处理服务
 *
 * 提供流式数据解析和部分 JSON 处理功能，支持：
 * - 标准 SSE 格式（data: {...}）
 * - 换行分隔的 JSON 流
 * - 不完整 JSON 块的缓冲处理
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/stream');
 * for await (const data of SSEService.streamJson(response)) {
 *   console.log('接收到数据:', data);
 * }
 * ```
 */
export class SSEService {
  /**
   * 解析响应流并提取 JSON 对象
   *
   * 使用异步生成器处理流式数据，自动处理：
   * - 标准 SSE 格式（`data: {...}\n\n`）
   * - 换行分隔的原始 JSON
   * - 不完整 JSON 块的缓冲和重组
   * - `[DONE]` 结束标记
   *
   * @template T - 数据类型
   * @param response - Fetch API 的响应对象
   * @yields 解析后的 JSON 对象
   * @throws 如果响应体为空
   *
   * @example
   * ```typescript
   * // 标准 SSE 格式
   * const response = await fetch('/chat/stream');
   * for await (const message of SSEService.streamJson<ChatMessage>(response)) {
   *   console.log('消息:', message.content);
   * }
   *
   * // 自动处理结束标记
   * // 当接收到 "data: [DONE]" 时自动停止
   * ```
   */
  static async *streamJson<T>(response: Response): AsyncGenerator<T, void, unknown> {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // 解码数据块
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // 按行分割缓冲区内容
        // 支持 \n 和 \r\n 两种换行符
        const lines = buffer.split(/\r?\n/);

        // 保留最后一行在缓冲区中，因为它可能不完整
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // 处理标准 SSE 格式 "data: ..."
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);

            // 检查结束标记
            if (jsonStr === '[DONE]') return;

            try {
              yield JSON.parse(jsonStr);
            } catch (e) {
              // 忽略中间块的解析错误，继续处理后续数据
            }
          } else {
            // 处理原始 JSON 流（不使用 SSE 封装）
            try {
              yield JSON.parse(trimmed);
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 处理缓冲区中的剩余数据
      if (buffer.trim()) {
        try {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ')) {
            yield JSON.parse(trimmed.slice(6));
          } else {
            yield JSON.parse(trimmed);
          }
        } catch (e) {
          // 忽略最后的解析错误
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 尝试解析部分 JSON 字符串（尽力而为）
   *
   * 当需要在数据完整到达前显示部分内容时使用。
   * 注意：此方法为基础实现，对于复杂的部分 JSON 解析，
   * 建议使用专门的部分解析器库。
   *
   * @param jsonStr - 可能不完整的 JSON 字符串
   * @returns 解析后的对象，失败时返回 null
   *
   * @example
   * ```typescript
   * const partial = '{"name": "John", "age"';
   * const result = SSEService.parsePartialJson(partial);
   * // result = null (因为 JSON 不完整)
   *
   * const complete = '{"name": "John"}';
   * const result2 = SSEService.parsePartialJson(complete);
   * // result2 = { name: "John" }
   * ```
   */
  static parsePartialJson(jsonStr: string): any {
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // 对字符串值进行非常基本的恢复
      // 在真实应用中，可能需要更健壮的部分解析器库
      return null;
    }
  }
}
