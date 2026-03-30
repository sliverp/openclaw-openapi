<div align="center">

**简体中文 | [English](README.md)**

<img width="120" src="https://img.shields.io/badge/🔌-Open_API-blueviolet?style=for-the-badge" alt="Open API" />

# Open API — OpenClaw 开放接口插件

**通过 WebSocket 将任意客户端接入 OpenClaw — 轻量、实时、协议优先。**

### 🚀 当前版本：`v1.0.0`

[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-OpenClaw-orange)](https://github.com/nicepkg/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js->=18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

## ✨ 这是什么？

与绑定特定平台的渠道插件（QQ Bot、Telegram、Discord…）不同，**Open API** 在你的 OpenClaw 服务器上暴露一个 **通用 WebSocket 端点**。任何程序 —— CLI 工具、移动应用、Web 前端、IoT 设备 —— 都能连上来，与你的 AI 助手实时对话。

```
┌──────────────┐         WebSocket          ┌──────────────────┐
│   你的客户端   │ ◄──────────────────────► │  OpenClaw 服务器   │
│  （任何地方）  │      JSON 消息            │  + Open API 插件   │
└──────────────┘                            └──────────────────┘
```

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔌 **WebSocket 接口** | 标准 WebSocket 协议，任何语言、任何平台都能接入 |
| 🔒 **Token 认证** | 支持 HTTP Header 或 JSON 消息两种认证方式 |
| 💬 **会话管理** | 每个客户端支持多个独立对话会话 |
| 🔄 **自动重连** | 客户端 SDK 内置可配置的断线重连 |
| ❤️ **心跳检测** | 内置 ping/pong 机制检测失效连接 |
| 🪶 **极简设计** | 仅 ~7 个源文件，除 `ws` 外零外部依赖 |
| 📦 **自带客户端 SDK** | 开箱即用的 TypeScript 客户端，支持 Node.js 和浏览器 |

---

## 🚀 快速开始

### 第一步 — 安装插件

```bash
# 从本地源码安装
cd openclaw-openapi
npm install && npm run build
openclaw plugins install .
```

### 第二步 — 配置

#### 方式 A：OpenClaw 通道命令（推荐）

```bash
openclaw channels add --channel openapi --token "3210:my-secret"
```

`--token` 参数支持以下复合格式：

| 格式 | 示例 | 含义 |
|------|------|------|
| `端口` | `"3210"` | 只指定端口，无认证 |
| `token` | `"my-secret"` | 默认端口 3210，使用 token 认证 |
| `端口:token` | `"3210:my-secret"` | 指定端口 + token |
| `主机:端口:token` | `"0.0.0.0:3210:secret"` | 指定 host + 端口 + token |

#### 方式 B：手动编辑 JSON

<details>
<summary>点击展开</summary>

编辑 `~/.openclaw/openclaw.json`：

```json
{
  "channels": {
    "openapi": {
      "enabled": true,
      "port": 3210,
      "host": "0.0.0.0",
      "token": "your-secret-token"
    }
  }
}
```

</details>

#### 配置项说明

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `false` | 是否启用 Open API 通道 |
| `port` | `3210` | WebSocket 服务监听端口 |
| `host` | `0.0.0.0` | 绑定地址（`0.0.0.0` = 所有网卡） |
| `token` | *(空)* | 客户端连接时需要提供的认证 Token（留空则跳过认证检查） |

### 第三步 — 重启 OpenClaw

```bash
openclaw restart
```

日志中将出现：

```
[openapi] WebSocket server listening on ws://0.0.0.0:3210
```

### 第四步 — 客户端连接

```typescript
import { OpenClawClient } from "@openclaw/openapi/client";

const client = new OpenClawClient({
  url: "ws://your-server:3210/openapi/ws",
  token: "your-secret-token",
});

await client.connect();

const reply = await client.send("你好！你能做什么？");
console.log(reply.text);

client.disconnect();
```

---

## 📦 客户端 SDK

客户端 SDK 位于 `client/` 目录，同时支持 **Node.js** 和**浏览器**环境。

### 安装依赖

Node.js 环境需要安装 `ws` 包：

```bash
npm install ws
```

浏览器环境使用原生 WebSocket，无需额外依赖。

### 构造参数

```typescript
const client = new OpenClawClient({
  url: "ws://localhost:3210/openapi/ws",  // 必填：服务器 WebSocket 端点
  token: "my-token",           // 可选：认证 Token
  clientId: "my-app",          // 可选：客户端持久标识
  connectTimeout: 10000,       // 可选：连接超时，毫秒（默认 10s）
  autoReconnect: true,         // 可选：断线自动重连（默认 true）
  reconnectInterval: 3000,     // 可选：重连间隔，毫秒（默认 3s）
  maxReconnects: 10,           // 可选：最大重连次数，0 = 无限（默认 10）
});
```

### 发送消息

```typescript
// 简单发送 — 等待 AI 回复
const reply = await client.send("把 'hello' 翻译成法语");
console.log(reply.text); // "Bonjour"

// 带选项
const reply2 = await client.send("继续讲故事", {
  sessionId: "story-session",  // 隔离对话上下文
  timeout: 60000,              // 自定义回复超时（默认 120s）
  attachments: [               // 可选的附件 URL
    "https://example.com/image.png"
  ],
});
```

### 事件监听

```typescript
client.on("connected", () => {
  console.log("已连接到 OpenClaw！");
});

client.on("disconnected", () => {
  console.log("连接断开，即将自动重连...");
});

client.on("reply", (msg) => {
  console.log("收到回复:", msg);
});

client.on("error", (err) => {
  console.error("服务端错误:", err);
});
```

### 连接状态

```typescript
if (client.isConnected) {
  await client.send("ping");
}
```

---

## 🔧 WebSocket 协议

所有消息均为标准 WebSocket 连接上的 JSON 字符串。

### 认证方式

支持两种认证方式：

**方式一：HTTP Header 认证（Node.js 推荐）**

客户端 SDK 在 WebSocket 握手时自动通过 `Authorization: Bearer <token>` HTTP Header 发送 Token，连接建立后无需额外发送认证消息。

**方式二：JSON 认证消息（浏览器降级方案）**

浏览器原生 WebSocket 不支持自定义 Header，需在连接后第一条消息发送认证：

```json
{
  "type": "auth",
  "token": "your-secret-token",
  "clientId": "my-app"
}
```

服务端响应：

```json
{ "type": "auth_result", "ok": true }
```

或认证失败：

```json
{ "type": "auth_result", "ok": false, "error": "Invalid token" }
```

> 如果 30 秒内未完成认证，连接将被关闭。

### 客户端 → 服务器

#### `message` — 向 AI 发送消息

```json
{
  "type": "message",
  "id": "msg-1-1711612800000",
  "sessionId": "default",
  "text": "生命的意义是什么？",
  "attachments": ["https://example.com/doc.pdf"]
}
```

#### `ping` — 心跳

```json
{ "type": "ping" }
```

### 服务器 → 客户端

#### `reply` — AI 回复

```json
{
  "type": "reply",
  "replyTo": "msg-1-1711612800000",
  "messageId": "openapi-42",
  "text": "生命的意义是...",
  "mediaUrl": null
}
```

#### `error` — 错误通知

```json
{
  "type": "error",
  "message": "Internal error",
  "replyTo": "msg-1-1711612800000"
}
```

#### `pong` — 心跳响应

```json
{ "type": "pong" }
```

---

## ⚙️ 进阶配置

### 多账户配置

支持在不同端口/Token 下运行多个 Open API 端点：

```json
{
  "channels": {
    "openapi": {
      "enabled": true,
      "port": 3210,
      "token": "token-for-default",

      "accounts": {
        "internal": {
          "enabled": true,
          "port": 3211,
          "host": "127.0.0.1",
          "token": "internal-only-token"
        },
        "public": {
          "enabled": true,
          "port": 3212,
          "host": "0.0.0.0",
          "token": "public-access-token"
        }
      }
    }
  }
}
```

### 安全建议

| 建议 | 说明 |
|------|------|
| **务必设置 Token** | 不设 Token 的话，任何能访问端口的人都能跟你的 AI 对话 |
| **绑定 `127.0.0.1`** | 如果客户端只在本地，避免暴露到 `0.0.0.0` |
| **使用反向代理** | 生产环境建议在前面放 Nginx/Caddy，启用 TLS（`wss://`） |
| **防火墙规则** | 在操作系统 / 云安全组层面限制端口访问 |

---

## 🛠️ CLI 辅助工具

插件提供了一个辅助命令行工具：

```bash
# 查看当前安装和配置状态
openclaw-openapi status

# 生成随机安全 Token
openclaw-openapi generate-token

# 查看帮助
openclaw-openapi --help
```

> 注意：安装/卸载/配置操作请直接使用 `openclaw` 命令（见第一步和第二步）。

---

## 🏗️ 项目结构

```
openclaw-openapi/
├── openclaw.plugin.json      # 插件清单
├── package.json
├── tsconfig.json
├── index.ts                  # 插件入口
│
├── bin/                       # CLI 辅助工具
│   └── openapi-cli.js         # `openclaw-openapi` 命令
│
├── src/                      # 服务端插件代码
│   ├── types.ts              # 类型定义 & WebSocket 协议
│   ├── runtime.ts            # 运行时单例
│   ├── config.ts             # 配置解析
│   ├── channel.ts            # ChannelPlugin 实现
│   ├── gateway.ts            # Gateway 启动 & 消息路由
│   └── ws-server.ts          # WebSocket 服务器
│
└── client/                   # 客户端 SDK
    └── index.ts              # OpenClawClient 类
```

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

## 📄 开源协议

[MIT](./LICENSE)
