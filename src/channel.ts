import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import type { ResolvedOpenApiAccount, OpenApiChannelConfig } from "./types.js";
import {
  DEFAULT_ACCOUNT_ID,
  listAccountIds,
  resolveAccount,
  resolveDefaultAccountId,
} from "./config.js";
import { startGateway, getWsServer } from "./gateway.js";

const DEFAULT_PORT = 3210;
const DEFAULT_HOST = "0.0.0.0";

let msgCounter = 0;

/** 确保 cfg.channels.openapi 段存在并返回 */
function ensureOpenApiSection(cfg: OpenClawConfig): OpenApiChannelConfig {
  cfg.channels = cfg.channels || {};
  if (!cfg.channels.openapi) {
    cfg.channels.openapi = {};
  }
  return cfg.channels.openapi as OpenApiChannelConfig;
}

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

  setup: {
    resolveAccountId: ({ accountId }) => {
      return accountId?.trim() || DEFAULT_ACCOUNT_ID;
    },

    applyAccountName: ({ cfg, accountId, name }) => {
      const section = ensureOpenApiSection(cfg);
      if (accountId === DEFAULT_ACCOUNT_ID) {
        section.name = name;
      } else {
        section.accounts = section.accounts || {};
        section.accounts[accountId] = section.accounts[accountId] || {};
        section.accounts[accountId].name = name;
      }
      return cfg;
    },

    validateInput: () => {
      return null;
    },

    applyAccountConfig: ({ cfg, accountId, input }) => {
      const section = ensureOpenApiSection(cfg);

      // 解析 --token 参数中可能包含的 port:host:token 格式
      // 支持格式: "token", "port", "port:token", "host:port:token"
      let port = DEFAULT_PORT;
      let host = DEFAULT_HOST;
      let token: string | undefined;

      if (input.token) {
        const parts = input.token.split(":");
        if (parts.length === 1) {
          // 纯数字视为端口，否则视为 token
          if (/^\d+$/.test(parts[0])) {
            port = parseInt(parts[0], 10);
          } else {
            token = parts[0];
          }
        } else if (parts.length === 2) {
          // port:token
          port = parseInt(parts[0], 10) || DEFAULT_PORT;
          token = parts[1] || undefined;
        } else if (parts.length >= 3) {
          // host:port:token
          host = parts[0] || DEFAULT_HOST;
          port = parseInt(parts[1], 10) || DEFAULT_PORT;
          token = parts.slice(2).join(":") || undefined;
        }
      }

      // 从额外参数中读取（优先级更高）
      if (input["port"]) port = parseInt(String(input["port"]), 10) || port;
      if (input["host"]) host = String(input["host"]) || host;
      if (input["api-token"]) token = String(input["api-token"]) || token;

      if (input.useEnv) {
        token = token || process.env.OPENAPI_TOKEN;
        if (process.env.OPENAPI_PORT) port = parseInt(process.env.OPENAPI_PORT, 10) || port;
        if (process.env.OPENAPI_HOST) host = process.env.OPENAPI_HOST || host;
      }

      if (accountId === DEFAULT_ACCOUNT_ID) {
        section.enabled = true;
        section.port = port;
        section.host = host;
        if (token) section.token = token;
      } else {
        section.accounts = section.accounts || {};
        section.accounts[accountId] = {
          ...section.accounts[accountId],
          enabled: true,
          port,
          host,
          ...(token ? { token } : {}),
        };
      }

      return cfg;
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
