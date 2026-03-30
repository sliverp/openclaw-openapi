# OpenClaw Open API 客户端 SDK

纯 TypeScript 实现，可在 Node.js 或浏览器环境中使用。

## 安装依赖

Node.js 环境需要安装 `ws` 包：

```bash
npm install ws
```

浏览器环境使用原生 WebSocket，无需额外依赖。

## 快速开始

```typescript
import { OpenClawClient } from "@openclaw/openapi/client";

const client = new OpenClawClient({
  url: "ws://your-server:3210/openapi/ws",
  token: "your-token",
});

await client.connect();
const reply = await client.send("你好");
console.log(reply.text);
client.disconnect();
```

## 配置项 (`OpenClawClientOptions`)

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | `string` | 是 | - | WebSocket 服务器地址，如 `ws://host:3210/openapi/ws` |
| `token` | `string` | 否 | `""` | 认证 token，需与服务端配置一致 |
| `clientId` | `string` | 否 | 自动生成 | 客户端标识，用于服务端区分不同客户端 |
| `connectTimeout` | `number` | 否 | `10000` | 连接超时时间（ms） |
| `autoReconnect` | `boolean` | 否 | `true` | 断线后是否自动重连 |
| `reconnectInterval` | `number` | 否 | `3000` | 重连间隔（ms） |
| `maxReconnects` | `number` | 否 | `10` | 最大重连次数，`0` 表示无限重连 |

## API

### `connect(): Promise<void>`

连接服务器并完成认证。Node.js 下通过 HTTP Header (`Authorization: Bearer <token>`) 自动认证，连接后直接可用，无需额外发送认证消息。

```typescript
await client.connect();
```

### `send(text, options?): Promise<Reply>`

发送消息并等待 AI 回复。返回 `Reply` 对象。

```typescript
const reply = await client.send("帮我写一首诗", {
  sessionId: "session-1",  // 会话 ID，默认 "default"
  timeout: 60000,           // 等待回复超时（ms），默认 120000
  attachments: ["url1"],    // 附件 URL 列表
});

console.log(reply.messageId); // 消息 ID
console.log(reply.text);      // AI 回复文本
console.log(reply.mediaUrl);  // 媒体附件 URL（如有）
```

### `disconnect(): void`

主动断开连接，不会触发自动重连。

### `on(event, handler)` / `off(event, handler)`

事件监听。支持的事件：

| 事件 | 回调参数 | 说明 |
|------|----------|------|
| `connected` | 无 | 连接并认证成功 |
| `disconnected` | 无 | 连接断开 |
| `reply` | `ServerMessage` | 收到回复 |
| `error` | `ServerMessage` | 收到服务端错误消息 |

### `isConnected: boolean`

只读属性，当前是否已连接并认证。

## 完整示例

```typescript
import { OpenClawClient } from "@openclaw/openapi/client";

const client = new OpenClawClient({
  url: "ws://your-server:3210/openapi/ws",
  token: "your-token",
  clientId: "my-app",
  autoReconnect: true,
  maxReconnects: 5,
});

client.on("connected", () => console.log("已连接"));
client.on("disconnected", () => console.log("已断开，等待重连..."));
client.on("error", (err) => console.error("服务端错误:", err));

async function main() {
  await client.connect();

  // 单轮对话
  const reply = await client.send("hello");
  console.log("AI 回复:", reply.text);

  // 多轮对话（同一个 sessionId 保持上下文）
  const r1 = await client.send("我叫小明", { sessionId: "chat-1" });
  const r2 = await client.send("我叫什么？", { sessionId: "chat-1" });
  console.log(r2.text); // AI 会记住你叫小明

  client.disconnect();
}

main().catch(console.error);
```

## 认证方式

- **Node.js**：通过 HTTP Header `Authorization: Bearer <token>` 自动认证，连接建立后服务端直接返回 `auth_result`，无需额外发送认证消息
- **浏览器**：浏览器原生 WebSocket 不支持自定义 Header，需在连接后发送 `{ type: "auth", token: "...", clientId: "..." }` JSON 消息进行认证

## 注意事项

- `send()` 是异步的，会等待服务端回复后才 resolve，默认超时 120 秒
- 同一个 `clientId` 只允许一个连接，新连接会踢掉旧连接
- 开启 `autoReconnect` 后，非主动断开会自动重连
- 心跳间隔 30 秒，SDK 内部自动维护
- 如果 30 秒内未完成认证，服务端会主动断开连接
