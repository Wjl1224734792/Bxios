# Bunxios - Lightweight HTTP Client

[English](./README_EN.md) | [简体中文](./README.md)

## 📖 Overview

Bunxios is a lightweight HTTP client library based on the native `fetch` API, designed for modern frontend applications and Bun/Node.js environments. It offers an Axios-like API experience but with a smaller footprint and native TypeScript support.

## ✨ Key Features

- 🔄 **Request Cancellation** - Abort requests via `AbortController`
- 💾 **Built-in Caching** - Memory caching mechanism with custom TTL
- 🔁 **Auto Retry** - Automatic retry with exponential backoff strategy
- 🚦 **Concurrency Control** - Built-in request concurrency limiting
- 📊 **SSE Support** - Native support for Server-Sent Events streaming
- 📦 **TypeScript** - Written in TypeScript with complete type definitions
- 🚀 **Lightweight** - Zero third-party runtime dependencies

## 📦 Installation

```bash
bun add bunxios
# or
npm install bunxios
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { HttpClient } from 'bunxios';

// Create instance
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

// GET Request
const response = await client.get('/users');
console.log(response.data);

// POST Request
const newUser = await client.post('/users', {
  name: 'John',
  email: 'john@example.com'
});
```

## 📚 API Methods

### Standard RESTful Methods

- `get<T>(url, config?)`
- `post<T>(url, data?, config?)`
- `put<T>(url, data?, config?)`
- `patch<T>(url, data?, config?)`
- `delete<T>(url, config?)`
- `head<T>(url, config?)`
- `options<T>(url, config?)`

### Forms & File Uploads

- `postForm<T>(url, data?, config?)`
- `putForm<T>(url, data?, config?)`
- `patchForm<T>(url, data?, config?)`

### Advanced

- `sse<T>(url, config?)` - Consume SSE streams via async generator

## 🔧 Configuration & Features

### Request Caching

Bunxios includes a simple in-memory caching feature.

```typescript
// Enable cache, default 5 minutes
await client.get('/config', {
  cache: true,
  cacheTime: 300000, // 5 minutes
});

// Custom cache key
await client.get('/user-settings', {
  cache: true,
  cacheKey: 'user-settings-v1'
});
```

### Auto Retry

Automatically retry requests when network fails, with exponential backoff.

```typescript
// Retry 3 times on failure
await client.get('/api/data', {
  retry: 3,
  retryDelay: 1000 // Initial delay 1 second
});
```

### Concurrency Control

Set maximum concurrent requests during initialization.

```typescript
const client = new HttpClient({
  baseURL: '/api',
  concurrency: 5 // Max 5 concurrent requests
});
```

### Interceptors

Support for request and response interceptors.

```typescript
// Request Interceptor
client.interceptors.request.use(config => {
  config.headers['Authorization'] = 'Bearer token';
  return config;
});

// Response Interceptor
client.interceptors.response.use(
  response => response,
  error => {
    if (error.status === 401) {
      // Handle unauthorized
    }
    throw error;
  }
);
```

### 🧩 CLI Template Generator

Bunxios provides a CLI tool to quickly generate standardized Service layer code.

```bash
# Generate product module code
bunx bunxios generate product
# Or using the alias
bunx bunxios g product
```

This command will generate a `product.service.ts` file in the `src/modules/product/services/` directory, including basic CRUD methods and type definitions.

Generated code example:

```typescript
import { HttpClient } from 'bunxios';

// TODO: Replace with your globally configured instance
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
  // ... other CRUD methods
}
```

### SSE Streaming

Easily handle Server-Sent Events, perfect for AI chat scenarios.

```typescript
// Stream AI chat response
const stream = client.sse<ChatMessage>('/chat/stream', {
  params: { prompt: 'Hello' }
});

for await (const message of stream) {
  console.log('Received:', message.content);
}
```

## 📝 License

MIT License
