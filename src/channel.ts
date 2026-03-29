import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import type { ResolvedOpenApiAccount } from "./types.js";
import {
  DEFAULT_ACCOUNT_ID,
  listAccountIds,
  resolveAccount,
  resolveDefaultAccountId,
} from "./config.js";
import { startGateway, getWsServer } from "./gateway.js";

let msgCounter = 0;

export const openApiPlugin: ChannelPlugin<ResolvedOpenApiAccount> = {
  id: "openapi",
  meta: {
    id: "openapi",
    label: "Open API",
    selectionLabel: "Open API (WebSocket)",
    blurb: "Connect to OpenClaw via WebSocket API for custom clients",
    order: 90,
  },
  capabilities: {
    chatTypes: ["direct"],
    media: false,
    reactions: false,
    threads: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.openapi"] },

  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    defaultAccountId: (cfg) => resolveDefaultAccountId(cfg),
    isConfigured: (account) => {
      return account?.enabled === true;
    },
    describeAccount: (account) => ({
      accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
      name: account?.name,
      enabled: account?.enabled ?? false,
      configured: account?.enabled === true,
    }),
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 10000,
    sendText: async ({ to, text, accountId }) => {
      const messageId = `openapi-${++msgCounter}`;
      // to 格式: openapi:{clientId}:{sessionId}
      const parts = to.replace(/^openapi:/, "").split(":");
      const clientId = parts[0];

      const server = getWsServer(accountId ?? DEFAULT_ACCOUNT_ID);
      if (!server) {
        return { channel: "openapi", error: new Error("WebSocket server not running") };
      }

      const sent = server.send(clientId, {
        type: "reply",
        replyTo: "",
        messageId,
        text,
      });

      return {
        channel: "openapi",
        messageId: sent ? messageId : undefined,
        error: sent ? undefined : new Error("Client not connected"),
      };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      const messageId = `openapi-${++msgCounter}`;
      const parts = to.replace(/^openapi:/, "").split(":");
      const clientId = parts[0];

      const server = getWsServer(accountId ?? DEFAULT_ACCOUNT_ID);
      if (!server) {
        return { channel: "openapi", error: new Error("WebSocket server not running") };
      }

      const sent = server.send(clientId, {
        type: "reply",
        replyTo: "",
        messageId,
        text: text ?? "",
        mediaUrl: mediaUrl ?? undefined,
      });

      return {
        channel: "openapi",
        messageId: sent ? messageId : undefined,
        error: sent ? undefined : new Error("Client not connected"),
      };
    },
  },

  gateway: {
    startAccount: async (ctx) => {
      const { account, log } = ctx;
      log?.info(`[openapi:${account.accountId}] Starting gateway — port=${account.port}, host=${account.host}`);
      await startGateway(ctx);
    },
    logoutAccount: async ({ accountId }) => {
      const server = getWsServer(accountId);
      if (server) {
        server.close();
      }
      return { ok: true, cleared: true };
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastError: null,
    },
    buildAccountSnapshot: ({ account, runtime }: { account?: ResolvedOpenApiAccount; runtime?: Record<string, unknown> }) => ({
      accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
      name: account?.name,
      enabled: account?.enabled ?? false,
      configured: account?.enabled === true,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },
};
