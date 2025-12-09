# Bxios - 轻量级 HTTP 客户端

[English Documentation](./README_EN.md) | [中文文档](./README.md)

## 📖 概述

Bxios 是一个基于原生 `fetch` API 封装的轻量级 HTTP 请求库，专为现代前端应用和 Bun/Node.js 环境设计。它提供了类似 Axios 的 API 体验，但体积更小，且原生支持 TypeScript。

## ✨ 核心特性

- 🔄 **请求中断** - 支持 `AbortController` 取消请求
- 💾 **内置缓存** - 内存缓存机制，支持自定义 TTL
- 🔁 **自动重试** - 支持指数退避算法的自动重试机制
- 🚦 **并发控制** - 内置并发请求数量限制
- 📊 **SSE 支持** - 原生支持服务器发送事件（Server-Sent Events）流式处理
- 📦 **TypeScript** - 完全使用 TypeScript 编写，提供完整的类型定义
- 🚀 **轻量高效** - 基于 Fetch API，零第三方运行时依赖

## 📦 安装

```bash
bun add bxios
# 或者
npm install bxios
```

## 🚀 快速开始

### 基础用法

```typescript
import { HttpClient } from 'bxios';

// 创建实例
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

// GET 请求
const response = await client.get('/users');
console.log(response.data);

// POST 请求
const newUser = await client.post('/users', {
  name: 'John',
  email: 'john@example.com'
});
```

## 📚 API 方法列表

### 标准 RESTful 方法

- `get<T>(url, config?)`
- `post<T>(url, data?, config?)`
- `put<T>(url, data?, config?)`
- `patch<T>(url, data?, config?)`
- `delete<T>(url, config?)`
- `head<T>(url, config?)`
- `options<T>(url, config?)`

### 表单与文件上传

- `postForm<T>(url, data?, config?)`
- `putForm<T>(url, data?, config?)`
- `patchForm<T>(url, data?, config?)`

### 高级功能

- `sse<T>(url, config?)` - SSE 流式数据接收

## 🔧 详细配置

### 请求缓存

Bxios 内置了简单的内存缓存功能。

```typescript
// 启用缓存，默认 5 分钟
await client.get('/config', {
  cache: true,
  cacheTime: 300000, // 5 分钟
});

// 自定义缓存键
await client.get('/user-settings', {
  cache: true,
  cacheKey: 'user-settings-v1'
});
```

### 自动重试

网络不稳定时自动重试，支持指数退避策略。

```typescript
// 失败自动重试 3 次
await client.get('/api/data', {
  retry: 3,
  retryDelay: 1000 // 初始延迟 1 秒
});
```

### 并发控制

在初始化时设置最大并发数。

```typescript
const client = new HttpClient({
  baseURL: '/api',
  concurrency: 5 // 最多同时 5 个请求
});
```

### 拦截器

支持请求和响应拦截器。

```typescript
// 请求拦截器
client.interceptors.request.use(config => {
  config.headers['Authorization'] = 'Bearer token';
  return config;
});

// 响应拦截器
client.interceptors.response.use(
  response => response,
  error => {
    if (error.status === 401) {
      // 处理未授权
    }
    throw error;
  }
);
```

### 🧩 CLI 模板生成器

Bxios 提供了一个 CLI 工具，用于快速生成符合规范的 Service 层代码。

```bash
# 生成产品模块代码
bunx bxios generate product
# 或者简写
bunx bxios g product
```

该命令将在 `src/modules/product/services/` 目录下生成 `product.service.ts` 文件，包含基础的 CRUD 方法和类型定义。

生成的代码示例：

```typescript
import { HttpClient } from 'bxios';

// TODO: 建议替换为全局配置的实例
const http = new HttpClient({ baseURL: '/api' });

export interface Product {
  id: string;
  // ...
}

export class ProductService {
  private baseUrl = '/product';

  async list(params?: any) {
    const response = await http.get<Product[]>(this.baseUrl, { params });
    return response.data;
  }
  // ... 其他 CRUD 方法
}
```

### SSE 流式处理

方便地处理 Server-Sent Events，特别适合 AI 对话等场景。

```typescript
// AI 聊天流式响应
const stream = client.sse<ChatMessage>('/chat/stream', {
  params: { prompt: 'Hello' }
});

for await (const message of stream) {
  console.log('接收到消息:', message.content);
}
```

## 📝 许可证

MIT License
