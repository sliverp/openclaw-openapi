/**
 * OpenClaw Plugin SDK 类型声明
 * 仅包含本项目实际使用的类型
 */

declare module "openclaw/plugin-sdk" {
  export interface OpenClawConfig {
    channels?: {
      openapi?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  export interface PluginRuntime {
    getConfig(): OpenClawConfig;
    setConfig(config: OpenClawConfig): void;
    getDataDir(): string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel?: any;
    log: {
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
      debug: (message: string, ...args: unknown[]) => void;
    };
    [key: string]: unknown;
  }

  export interface OpenClawPluginApi {
    runtime: PluginRuntime;
    config: OpenClawConfig;
    registerChannel<TAccount = unknown>(options: { plugin: ChannelPlugin<TAccount> }): void;
    registerHttpRoute(params: {
      method: string;
      path: string;
      handler: (req: unknown, res: unknown) => void | Promise<void>;
    }): void;
    [key: string]: unknown;
  }

  export function emptyPluginConfigSchema(): unknown;

  export interface ChannelPluginMeta {
    id: string;
    label: string;
    selectionLabel?: string;
    docsPath?: string;
    blurb?: string;
    order?: number;
  }

  export interface ChannelPluginCapabilities {
    chatTypes?: ("direct" | "group")[];
    media?: boolean;
    reactions?: boolean;
    threads?: boolean;
    blockStreaming?: boolean;
  }

  export interface AccountDescription {
    accountId: string;
    name?: string;
    enabled: boolean;
    configured: boolean;
  }

  export interface ChannelPluginConfig<TAccount> {
    listAccountIds: (cfg: OpenClawConfig) => string[];
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) => TAccount;
    defaultAccountId: (cfg: OpenClawConfig) => string;
    isConfigured?: (account: TAccount | undefined) => boolean;
    describeAccount?: (account: TAccount | undefined) => AccountDescription;
    [key: string]: unknown;
  }

  export interface SendTextContext {
    to: string;
    text: string;
    accountId?: string;
    replyToId?: string;
    cfg: OpenClawConfig;
  }

  export interface SendMediaContext {
    to: string;
    text?: string;
    mediaUrl?: string;
    accountId?: string;
    replyToId?: string;
    cfg: OpenClawConfig;
  }

  export interface SendTextResult {
    channel: string;
    messageId?: string;
    error?: Error;
  }

  export interface ChannelPluginOutbound {
    deliveryMode?: "direct" | "queued";
    textChunkLimit?: number;
    sendText?: (ctx: SendTextContext) => Promise<SendTextResult>;
    sendMedia?: (ctx: SendMediaContext) => Promise<SendTextResult>;
    [key: string]: unknown;
  }

  export interface AccountStatus {
    running?: boolean;
    connected?: boolean;
    lastConnectedAt?: number;
    lastError?: string;
    [key: string]: unknown;
  }

  export interface GatewayStartContext<TAccount = unknown> {
    account: TAccount;
    accountId: string;
    abortSignal: AbortSignal;
    cfg: OpenClawConfig;
    log?: {
      info: (msg: string) => void;
      warn: (msg: string) => void;
      error: (msg: string) => void;
      debug: (msg: string) => void;
    };
    getStatus: () => AccountStatus;
    setStatus: (status: AccountStatus) => void;
    [key: string]: unknown;
  }

  export interface GatewayLogoutContext {
    accountId: string;
    cfg: OpenClawConfig;
  }

  export interface GatewayLogoutResult {
    ok: boolean;
    cleared: boolean;
  }

  export interface ChannelPluginGateway<TAccount = unknown> {
    startAccount?: (ctx: GatewayStartContext<TAccount>) => Promise<void>;
    logoutAccount?: (ctx: GatewayLogoutContext) => Promise<GatewayLogoutResult>;
  }

  export interface SetupInput {
    name?: string;
    token?: string;
    privateKey?: string;
    tokenFile?: string;
    botToken?: string;
    appToken?: string;
    signalNumber?: string;
    cliPath?: string;
    dbPath?: string;
    service?: string;
    region?: string;
    authDir?: string;
    httpUrl?: string;
    httpHost?: string;
    httpPort?: string;
    webhookPath?: string;
    webhookUrl?: string;
    audienceType?: string;
    audience?: string;
    useEnv?: boolean;
    homeserver?: string;
    userId?: string;
    accessToken?: string;
    password?: string;
    deviceName?: string;
    initialSyncLimit?: number;
    ship?: string;
    url?: string;
    relayUrls?: string;
    code?: string;
    groupChannels?: string[];
    dmAllowlist?: string[];
    autoDiscoverChannels?: boolean;
    [key: string]: unknown;
  }

  export interface ChannelPluginSetup {
    resolveAccountId?: (params: {
      cfg: OpenClawConfig;
      accountId?: string;
      input?: SetupInput;
    }) => string;
    resolveBindingAccountId?: (params: {
      cfg: OpenClawConfig;
      agentId: string;
      accountId?: string;
    }) => string | undefined;
    applyAccountName?: (params: {
      cfg: OpenClawConfig;
      accountId: string;
      name?: string;
    }) => OpenClawConfig;
    applyAccountConfig: (params: {
      cfg: OpenClawConfig;
      accountId: string;
      input: SetupInput;
    }) => OpenClawConfig;
    afterAccountConfigWritten?: (params: {
      previousCfg: OpenClawConfig;
      cfg: OpenClawConfig;
      accountId: string;
      input: SetupInput;
      runtime: unknown;
    }) => Promise<void> | void;
    validateInput?: (params: {
      cfg: OpenClawConfig;
      accountId: string;
      input: SetupInput;
    }) => string | null;
  }

  export interface ChannelPlugin<TAccount = unknown> {
    id: string;
    meta?: ChannelPluginMeta;
    capabilities?: ChannelPluginCapabilities;
    reload?: { configPrefixes?: string[] };
    config?: ChannelPluginConfig<TAccount>;
    outbound?: ChannelPluginOutbound;
    gateway?: ChannelPluginGateway<TAccount>;
    setup?: ChannelPluginSetup;
    status?: unknown;
    [key: string]: unknown;
  }
}
