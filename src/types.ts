/**
 * OpenAPI 插件类型定义
 */

/** 已解析的 OpenAPI 账户 */
export interface ResolvedOpenApiAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  /** WebSocket 服务监听端口 */
  port: number;
  /** WebSocket 服务监听地址 */
  host: string;
  /** 认证 token（客户端连接时需要提供） */
  token?: string;
}

/** 配置中的 OpenAPI 段 */
export interface OpenApiChannelConfig {
  enabled?: boolean;
  name?: string;
  port?: number;
  host?: string;
  token?: string;
  accounts?: Record<string, {
    enabled?: boolean;
    name?: string;
    port?: number;
    host?: string;
    token?: string;
  }>;
}

// ==================== WebSocket 协议消息类型 ====================

/** 客户端 -> 服务器 消息 */
export type ClientMessage =
  | ClientAuthMessage
  | ClientSendMessage
  | ClientPingMessage;

export interface ClientAuthMessage {
  type: "auth";
  token?: string;
  clientId?: string;
}

export interface ClientSendMessage {
  type: "message";
  id: string;
  /** 会话标识：用于区分不同对话 */
  sessionId: string;
  /** 消息文本 */
  text: string;
  /** 附件 URL 列表 */
  attachments?: string[];
}

export interface ClientPingMessage {
  type: "ping";
}

/** 服务器 -> 客户端 消息 */
export type ServerMessage =
  | ServerAuthResultMessage
  | ServerReplyMessage
  | ServerErrorMessage
  | ServerPongMessage;

export interface ServerAuthResultMessage {
  type: "auth_result";
  ok: boolean;
  error?: string;
}

export interface ServerReplyMessage {
  type: "reply";
  /** 关联的客户端消息 ID */
  replyTo: string;
  /** 服务器分配的消息 ID */
  messageId: string;
  /** 回复文本 */
  text: string;
  /** 媒体 URL（如果有） */
  mediaUrl?: string;
}

export interface ServerErrorMessage {
  type: "error";
  message: string;
  replyTo?: string;
}

export interface ServerPongMessage {
  type: "pong";
}
