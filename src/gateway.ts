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
      handleClientMessage(account, clientId, msg, ctx, log);
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

/** 处理从客户端收到的消息，按照 OpenClaw plugin runtime API 转发到核心 */
function handleClientMessage(
  account: ResolvedOpenApiAccount,
  clientId: string,
  msg: ClientMessage,
  ctx: GatewayStartContext<ResolvedOpenApiAccount>,
  log?: { info: (s: string) => void; warn: (s: string) => void; error: (s: string) => void },
) {
  if (msg.type !== "message") return;

  const runtime = getOpenApiRuntime();
  const channel = runtime.channel;

  if (!channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
    log?.error(`[openapi] channel.reply.dispatchReplyWithBufferedBlockDispatcher not available`);
    const server = servers.get(account.accountId);
    server?.send(clientId, {
      type: "error",
      message: "Server not ready",
      replyTo: msg.id,
    });
    return;
  }

  // 记录入站活动
  channel.activity?.record?.({
    channel: "openapi",
    accountId: account.accountId,
    direction: "inbound",
  });

  const cfg = ctx.cfg;

  // 解析路由
  const peerId = clientId;
  const sessionId = msg.sessionId || "default";
  const to = `openapi:${clientId}:${sessionId}`;

  const route = channel.routing.resolveAgentRoute({
    cfg,
    channel: "openapi",
    accountId: account.accountId,
    peer: {
      kind: "direct",
      id: peerId,
    },
  });

  // 格式化入站信封（Web UI 用）
  const envelopeOptions = channel.reply.resolveEnvelopeFormatOptions(cfg);
  const body = channel.reply.formatInboundEnvelope({
    channel: "openapi",
    from: clientId,
    timestamp: Date.now(),
    body: msg.text,
    chatType: "direct",
    sender: { id: clientId, name: clientId },
    envelope: envelopeOptions,
  });

  // 构建并最终化入站上下文
  const ctxPayload = channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: msg.text,
    RawBody: msg.text,
    CommandBody: msg.text,
    From: to,
    To: to,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    SenderId: clientId,
    SenderName: clientId,
    Provider: "openapi",
    Surface: "openapi",
    MessageSid: msg.id,
    Timestamp: Date.now(),
    OriginatingChannel: "openapi",
    OriginatingTo: to,
    CommandAuthorized: true,
    ...(msg.attachments?.length
      ? { MediaUrls: msg.attachments, MediaUrl: msg.attachments[0] }
      : {}),
  });

  // 获取消息配置
  const messagesConfig = channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId);

  const server = servers.get(account.accountId);

  // 使用 dispatchReplyWithBufferedBlockDispatcher 提交到 AI 核心
  channel.reply
    .dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        responsePrefix: messagesConfig.responsePrefix,
        deliver: async (
          payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string },
          info: { kind: string },
        ) => {
          if (info.kind === "tool") {
            // tool 类型的中间回调，可以忽略或做进度提示
            return;
          }

          // block 类型 = 最终文本回复
          const text = payload.text ?? "";
          const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];

          server?.send(clientId, {
            type: "reply",
            replyTo: msg.id,
            messageId: `openapi-${Date.now()}`,
            text,
            ...(mediaUrl ? { mediaUrl } : {}),
          });
        },
        onError: (err: unknown) => {
          log?.error(`[openapi] dispatch error: ${err}`);
          server?.send(clientId, {
            type: "error",
            message: "Internal error",
            replyTo: msg.id,
          });
        },
      },
      replyOptions: {
        disableBlockStreaming: true,
      },
    })
    .catch((err: Error) => {
      log?.error(`[openapi] dispatchReply failed: ${err.message}`);
      server?.send(clientId, {
        type: "error",
        message: "Internal error",
        replyTo: msg.id,
      });
    });
}
