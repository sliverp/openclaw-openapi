import type { GatewayStartContext } from "openclaw/plugin-sdk";
import type { ResolvedOpenApiAccount, ClientMessage } from "./types.js";
import { createWsServer, type OpenApiWsServer } from "./ws-server.js";
import { getOpenApiRuntime } from "./runtime.js";

/** 每个账户对应一个 WebSocket 服务器实例 */
const servers = new Map<string, OpenApiWsServer>();

/** 获取指定账户的 WS 服务器（用于 outbound 发送消息） */
export function getWsServer(accountId: string): OpenApiWsServer | undefined {
  return servers.get(accountId);
}

/** 启动 Gateway：创建 WebSocket 服务器并将客户端消息转发到 OpenClaw */
export async function startGateway(ctx: GatewayStartContext<ResolvedOpenApiAccount>): Promise<void> {
  const { account, abortSignal, log } = ctx;
  const runtime = getOpenApiRuntime();

  // 关闭旧实例
  const existing = servers.get(account.accountId);
  if (existing) {
    existing.close();
    servers.delete(account.accountId);
  }

  const server = createWsServer({
    account,
    abortSignal,
    log,
    onMessage: (clientId, msg) => {
      handleClientMessage(account.accountId, clientId, msg, log);
    },
    onClientConnected: (clientId) => {
      log?.info(`[openapi:${account.accountId}] Client connected: ${clientId}`);
      ctx.setStatus({
        ...ctx.getStatus(),
        connected: true,
        lastConnectedAt: Date.now(),
      });
    },
    onClientDisconnected: (clientId) => {
      log?.info(`[openapi:${account.accountId}] Client disconnected: ${clientId}`);
      if (server.clientCount() === 0) {
        ctx.setStatus({
          ...ctx.getStatus(),
          connected: false,
        });
      }
    },
  });

  servers.set(account.accountId, server);

  ctx.setStatus({
    ...ctx.getStatus(),
    running: true,
    connected: false,
    lastConnectedAt: Date.now(),
  });

  log?.info(`[openapi:${account.accountId}] Gateway started on port ${account.port}`);

  // 等待 abort 信号
  await new Promise<void>((resolve) => {
    abortSignal.addEventListener("abort", () => {
      servers.delete(account.accountId);
      resolve();
    });
  });
}

/** 处理从客户端收到的消息 */
function handleClientMessage(
  accountId: string,
  clientId: string,
  msg: ClientMessage,
  log?: { info: (s: string) => void; warn: (s: string) => void; error: (s: string) => void },
) {
  if (msg.type !== "message") return;

  const runtime = getOpenApiRuntime();
  const channel = runtime.channel;

  if (!channel?.reply?.handleIncomingMessage) {
    log?.error(`[openapi] runtime.channel.reply.handleIncomingMessage not available`);
    const server = servers.get(accountId);
    server?.send(clientId, {
      type: "error",
      message: "Server not ready",
      replyTo: msg.id,
    });
    return;
  }

  // 构造 inbound 信封并交给 OpenClaw 核心处理
  const to = `openapi:${clientId}:${msg.sessionId}`;

  channel.reply.handleIncomingMessage({
    channel: "openapi",
    accountId,
    from: clientId,
    to,
    text: msg.text,
    messageId: msg.id,
    replyToId: undefined,
    attachments: msg.attachments?.map((url: string) => ({ type: "url", url })),
    chatType: "direct",
    timestamp: Date.now(),
  }).catch((err: Error) => {
    log?.error(`[openapi] handleIncomingMessage failed: ${err.message}`);
    const server = servers.get(accountId);
    server?.send(clientId, {
      type: "error",
      message: "Internal error",
      replyTo: msg.id,
    });
  });
}
