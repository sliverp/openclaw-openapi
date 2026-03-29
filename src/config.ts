import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { ResolvedOpenApiAccount, OpenApiChannelConfig } from "./types.js";

export const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_PORT = 3210;
const DEFAULT_HOST = "0.0.0.0";

/** 从配置中获取 openapi 段 */
function getOpenApiSection(cfg: OpenClawConfig): OpenApiChannelConfig | undefined {
  return cfg.channels?.openapi as OpenApiChannelConfig | undefined;
}

/** 列出所有已配置的账户 ID */
export function listAccountIds(cfg: OpenClawConfig): string[] {
  const section = getOpenApiSection(cfg);
  if (!section) return [];

  const ids: string[] = [];
  // 如果存在顶层配置，视为 default 账户
  if (section.port !== undefined || section.enabled !== undefined) {
    ids.push(DEFAULT_ACCOUNT_ID);
  }
  // 遍历 accounts 子段
  if (section.accounts) {
    for (const id of Object.keys(section.accounts)) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (ids.length === 0) ids.push(DEFAULT_ACCOUNT_ID);
  return ids;
}

/** 解析指定账户的完整配置 */
export function resolveAccount(cfg: OpenClawConfig, accountId?: string | null): ResolvedOpenApiAccount {
  const id = accountId || DEFAULT_ACCOUNT_ID;
  const section = getOpenApiSection(cfg);

  // 从 accounts 子段获取特定账户配置
  const accountEntry = section?.accounts?.[id];

  // 合并：accounts 子段覆盖顶层
  const port = accountEntry?.port ?? section?.port ?? DEFAULT_PORT;
  const host = accountEntry?.host ?? section?.host ?? DEFAULT_HOST;
  const token = accountEntry?.token ?? section?.token;
  const enabled = accountEntry?.enabled ?? section?.enabled ?? false;
  const name = accountEntry?.name ?? section?.name;

  return { accountId: id, name, enabled, port, host, token };
}

/** 获取默认账户 ID */
export function resolveDefaultAccountId(_cfg: OpenClawConfig): string {
  return DEFAULT_ACCOUNT_ID;
}
