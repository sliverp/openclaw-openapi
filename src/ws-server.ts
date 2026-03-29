import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { ResolvedOpenApiAccount, ClientMessage, ServerMessage } from "./types.js";

/** 已认证的客户端连接 */
interface AuthenticatedClient {
  ws: WebSocket;
  clientId: string;
  authenticatedAt: number;
}

/** WebSocket 服务器实例 */
export interface OpenApiWsServer {
  /** 关闭服务器 */
  close(): void;
  /** 向指定 clientId 发送消息；如果 clientId 为空则广播 */
  send(clientId: string | undefined, msg: ServerMessage): boolean;
  /** 当前已认证客户端数 */
  clientCount(): number;
}

export interface WsServerOptions {
  account: ResolvedOpenApiAccount;
  abortSignal: AbortSignal;
  onMessage: (clientId: string, msg: ClientMessage) => void;
  onClientConnected?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
  log?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

/**
 * 创建 WebSocket 服务器
 * 处理客户端认证、消息路由、心跳
 */
export function createWsServer(opts: WsServerOptions): OpenApiWsServer {
  const { account, abortSignal, onMessage, onClientConnected, onClientDisconnected, log } = opts;
  const clients = new Map<string, AuthenticatedClient>();

  const wss = new WebSocketServer({ port: account.port, host: account.host });

  log?.info(`[openapi] WebSocket server listening on ws://${account.host}:${account.port}`);

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const remoteAddr = req.socket.remoteAddress ?? "unknown";
    log?.info(`[openapi] New connection from ${remoteAddr}`);

    let authenticated = false;
    let clientId = "";

    // 尝试通过 Header 认证: Authorization: Bearer <token>
    const authHeader = req.headers["authorization"];
    if (authHeader) {
      const headerToken = authHeader.replace(/^Bearer\s+/i, "");
      if (!account.token || headerToken === account.token) {
        authenticated = true;
        // 从 query string 或 header 获取 clientId
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        clientId = url.searchParams.get("clientId") || `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const existing = clients.get(clientId);
        if (existing) {
          sendToWs(existing.ws, { type: "error", message: "Replaced by new connection" });
          existing.ws.close(4000, "Replaced");
        }

        clients.set(clientId, { ws, clientId, authenticatedAt: Date.now() });
        sendToWs(ws, { type: "auth_result", ok: true });
        log?.info(`[openapi] Client "${clientId}" authenticated via header`);
        onClientConnected?.(clientId);
      } else {
        sendToWs(ws, { type: "auth_result", ok: false, error: "Invalid token" });
        ws.close(4003, "Invalid token");
        return;
      }
    }

    // 30 秒内未认证则断开
    const authTimeout = authenticated ? undefined : setTimeout(() => {
      if (!authenticated) {
        sendToWs(ws, { type: "error", message: "Authentication timeout" });
        ws.close(4001, "Authentication timeout");
      }
    }, 30_000);

    ws.on("message", (data: Buffer | string) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(typeof data === "string" ? data : data.toString("utf-8"));
      } catch {
        sendToWs(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      // 未认证时只接受 auth 消息
      if (!authenticated) {
        if (msg.type !== "auth") {
          sendToWs(ws, { type: "error", message: "Not authenticated" });
          return;
        }
        // 验证 token
        if (account.token && msg.token !== account.token) {
          sendToWs(ws, { type: "auth_result", ok: false, error: "Invalid token" });
          ws.close(4003, "Invalid token");
          return;
        }

        if (authTimeout) clearTimeout(authTimeout);
        authenticated = true;
        clientId = msg.clientId || `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // 如果已有同 ID 的客户端，踢掉旧连接
        const existing = clients.get(clientId);
        if (existing) {
          sendToWs(existing.ws, { type: "error", message: "Replaced by new connection" });
          existing.ws.close(4000, "Replaced");
        }

        clients.set(clientId, { ws, clientId, authenticatedAt: Date.now() });
        sendToWs(ws, { type: "auth_result", ok: true });
        log?.info(`[openapi] Client "${clientId}" authenticated`);
        onClientConnected?.(clientId);
        return;
      }

      // 已认证：分发消息
      if (msg.type === "ping") {
        sendToWs(ws, { type: "pong" });
        return;
      }

      onMessage(clientId, msg);
    });

    ws.on("close", () => {
      if (authTimeout) clearTimeout(authTimeout);
      if (clientId && clients.has(clientId)) {
        clients.delete(clientId);
        log?.info(`[openapi] Client "${clientId}" disconnected`);
        onClientDisconnected?.(clientId);
      }
    });

    ws.on("error", (err) => {
      log?.error(`[openapi] WebSocket error for "${clientId}": ${err.message}`);
    });
  });

  // abort 时关闭服务器
  abortSignal.addEventListener("abort", () => {
    log?.info("[openapi] Shutting down WebSocket server");
    for (const c of clients.values()) {
      c.ws.close(1001, "Server shutting down");
    }
    clients.clear();
    wss.close();
  });

  return {
    close() {
      for (const c of clients.values()) {
        c.ws.close(1001, "Server shutting down");
      }
      clients.clear();
      wss.close();
    },
    send(clientId, msg) {
      if (clientId) {
        const client = clients.get(clientId);
        if (!client) return false;
        return sendToWs(client.ws, msg);
      }
      // 广播
      let sent = false;
      for (const c of clients.values()) {
        if (sendToWs(c.ws, msg)) sent = true;
      }
      return sent;
    },
    clientCount() {
      return clients.size;
    },
  };
}

function sendToWs(ws: WebSocket, msg: ServerMessage): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}
