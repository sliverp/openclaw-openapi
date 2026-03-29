<div align="center">

<img width="120" src="https://img.shields.io/badge/🔌-Open_API-blueviolet?style=for-the-badge" alt="Open API" />

# Open API Channel Plugin for OpenClaw

**Connect any custom client to OpenClaw over WebSocket — lightweight, real-time, and protocol-first.**

### 🚀 Current Version: `v1.0.0`

[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-OpenClaw-orange)](https://github.com/nicepkg/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js->=18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<br/>

**[简体中文](README.zh.md) | English**

</div>

---

## ✨ What is this?

Unlike platform-specific channel plugins (QQ Bot, Telegram, Discord…), **Open API** exposes a **generic WebSocket endpoint** from your OpenClaw server. Any program — a CLI tool, a mobile app, a web frontend, an IoT device — can connect to it and talk to your AI assistant in real time.

```
┌──────────────┐         WebSocket          ┌──────────────────┐
│  Your Client  │ ◄──────────────────────► │  OpenClaw Server  │
│  (anywhere)   │    JSON messages           │  + Open API Plugin│
└──────────────┘                            └──────────────────┘
```

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔌 **WebSocket API** | Standard WebSocket protocol — connect from any language or platform |
| 🔒 **Token Auth** | Optional token-based authentication for secure connections |
| 💬 **Session Management** | Multiple independent conversation sessions per client |
| 🔄 **Auto Reconnect** | Client SDK handles reconnection with configurable backoff |
| ❤️ **Heartbeat** | Built-in ping/pong to detect stale connections |
| 🪶 **Minimal Footprint** | ~7 source files, zero external deps beyond `ws` |
| 📦 **Client SDK Included** | Ready-to-use TypeScript client for Node.js & browsers |

---

## 🚀 Getting Started

### Step 1 — Install the Plugin

```bash
# Install from npm (when published)
openclaw plugins install @openclaw/openapi

# Or install from local source
cd openclaw-openapi
npm install && npm run build
openclaw plugins install ./
```

### Step 2 — Configure

Edit `~/.openclaw/openclaw.json`:

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

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `false` | Enable the Open API channel |
| `port` | `3210` | WebSocket server listening port |
| `host` | `0.0.0.0` | Bind address (`0.0.0.0` = all interfaces) |
| `token` | *(empty)* | Auth token clients must present (leave empty to skip auth check) |

### Step 3 — Start OpenClaw

```bash
openclaw gateway restart
```

You should see in logs:

```
[openapi] WebSocket server listening on ws://0.0.0.0:3210
```

### Step 4 — Connect a Client

```typescript
import { OpenClawClient } from "@openclaw/openapi/client";

const client = new OpenClawClient({
  url: "ws://your-server:3210",
  token: "your-secret-token",
});

await client.connect();

const reply = await client.send("Hello! What can you do?");
console.log(reply.text);

client.disconnect();
```

---

## 📦 Client SDK

The client SDK is shipped under `client/` and works in both **Node.js** and **browsers**.

### Installation

```bash
npm install @openclaw/openapi
```

### Constructor Options

```typescript
const client = new OpenClawClient({
  url: "ws://localhost:3210",  // Required: server address
  token: "my-token",           // Optional: auth token
  clientId: "my-app",          // Optional: persistent client identity
  connectTimeout: 10000,       // Optional: connection timeout in ms (default: 10s)
  autoReconnect: true,         // Optional: auto-reconnect on disconnect (default: true)
  reconnectInterval: 3000,     // Optional: delay between reconnect attempts (default: 3s)
  maxReconnects: 10,           // Optional: max reconnect attempts, 0 = unlimited (default: 10)
});
```

### Sending Messages

```typescript
// Simple send — waits for AI reply
const reply = await client.send("Translate 'hello' to French");
console.log(reply.text); // "Bonjour"

// With options
const reply2 = await client.send("Continue the story", {
  sessionId: "story-session",  // Isolate conversation context
  timeout: 60000,              // Custom reply timeout (default: 120s)
  attachments: [               // Optional attachment URLs
    "https://example.com/image.png"
  ],
});
```

### Event Listeners

```typescript
client.on("connected", () => {
  console.log("Connected to OpenClaw!");
});

client.on("disconnected", () => {
  console.log("Connection lost, will auto-reconnect...");
});

client.on("reply", (msg) => {
  console.log("Got reply:", msg);
});

client.on("error", (err) => {
  console.error("Server error:", err);
});
```

### Connection State

```typescript
if (client.isConnected) {
  await client.send("ping");
}
```

---

## 🔧 WebSocket Protocol

All messages are JSON-encoded strings over a standard WebSocket connection.

### Client → Server

#### `auth` — Authenticate (must be sent first)

```json
{
  "type": "auth",
  "token": "your-secret-token",
  "clientId": "my-app"
}
```

#### `message` — Send a message to the AI

```json
{
  "type": "message",
  "id": "msg-1-1711612800000",
  "sessionId": "default",
  "text": "What is the meaning of life?",
  "attachments": ["https://example.com/doc.pdf"]
}
```

#### `ping` — Heartbeat

```json
{ "type": "ping" }
```

### Server → Client

#### `auth_result` — Authentication response

```json
{ "type": "auth_result", "ok": true }
```

```json
{ "type": "auth_result", "ok": false, "error": "Invalid token" }
```

#### `reply` — AI reply to a message

```json
{
  "type": "reply",
  "replyTo": "msg-1-1711612800000",
  "messageId": "openapi-42",
  "text": "The meaning of life is...",
  "mediaUrl": null
}
```

#### `error` — Error notification

```json
{
  "type": "error",
  "message": "Internal error",
  "replyTo": "msg-1-1711612800000"
}
```

#### `pong` — Heartbeat response

```json
{ "type": "pong" }
```

---

## ⚙️ Advanced Configuration

### Multi-Account Setup

Run multiple Open API endpoints with different ports/tokens:

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

### Security Recommendations

| Recommendation | Description |
|----------------|-------------|
| **Always set a token** | Without a token, anyone who can reach the port can talk to your AI |
| **Bind to `127.0.0.1`** | If clients are local-only, avoid exposing to `0.0.0.0` |
| **Use a reverse proxy** | Put Nginx/Caddy in front for TLS (`wss://`) in production |
| **Firewall rules** | Restrict port access at the OS / cloud security group level |

---

## 🏗️ Project Structure

```
openclaw-openapi/
├── openclaw.plugin.json      # Plugin manifest
├── package.json
├── tsconfig.json
├── index.ts                  # Plugin entry point
│
├── src/                      # Server-side plugin
│   ├── openclaw-plugin-sdk.d.ts  # SDK type declarations
│   ├── types.ts              # Types & WebSocket protocol
│   ├── runtime.ts            # Runtime singleton
│   ├── config.ts             # Configuration parsing
│   ├── channel.ts            # ChannelPlugin implementation
│   ├── gateway.ts            # Gateway startup & message routing
│   └── ws-server.ts          # WebSocket server
│
└── client/                   # Client SDK
    └── index.ts              # OpenClawClient class
```

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## 📄 License

[MIT](./LICENSE)
