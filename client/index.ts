/**
 * OpenClaw Open API 客户端 SDK
 *
 * 纯 TypeScript 实现，可在 Node.js 或浏览器环境中使用。
 * Node.js 需安装 ws 包；浏览器使用原生 WebSocket。
 *
 * 用法:
 *   import { OpenClawClient } from "@openclaw/openapi/client";
 *   const client = new OpenClawClient({ url: "ws://localhost:3210", token: "your-token" });
 *   await client.connect();
 *   const reply = await client.send("你好");
 *   console.log(reply.text);
 */

/** 服务器下发的回复 */
export interface Reply {
  messageId: string;
  text: string;
  mediaUrl?: string;
}

/** 客户端配置 */
export interface OpenClawClientOptions {
  /** WebSocket 服务器地址，例如 ws://localhost:3210 */
  url: string;
  /** 认证 token（需与服务端配置一致） */
  token?: string;
  /** 客户端标识（可选，服务端会自动分配） */
  clientId?: string;
  /** 连接超时(ms)，默认 10000 */
  connectTimeout?: number;
  /** 自动重连，默认 true */
  autoReconnect?: boolean;
  /** 重连间隔(ms)，默认 3000 */
  reconnectInterval?: number;
  /** 最大重连次数，默认 10，0 表示无限 */
  maxReconnects?: number;
}

type ServerMessage =
  | { type: "auth_result"; ok: boolean; error?: string }
  | { type: "reply"; replyTo: string; messageId: string; text: string; mediaUrl?: string }
  | { type: "error"; message: string; replyTo?: string }
  | { type: "pong" };

type EventHandler = (...args: unknown[]) => void;

export class OpenClawClient {
  private ws: WebSocket | null = null;
  private opts: Required<OpenClawClientOptions>;
  private authenticated = false;
  private reconnectCount = 0;
  private closed = false;

  /** 等待认证完成的 Promise */
  private authResolve?: (ok: boolean) => void;

  /** 等待回复的 pending 请求: msgId -> resolve/reject */
  private pending = new Map<string, {
    resolve: (reply: Reply) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  /** 消息 ID 计数器 */
  private msgSeq = 0;

  /** 事件监听器 */
  private listeners = new Map<string, Set<EventHandler>>();

  /** 心跳定时器 */
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: OpenClawClientOptions) {
    this.opts = {
      url: options.url,
      token: options.token ?? "",
      clientId: options.clientId ?? "",
      connectTimeout: options.connectTimeout ?? 10_000,
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 3_000,
      maxReconnects: options.maxReconnects ?? 10,
    };
  }

  /** 连接并认证 */
  async connect(): Promise<void> {
    this.closed = false;
    return this._doConnect();
  }

  /** 发送消息并等待回复 */
  async send(text: string, options?: { sessionId?: string; timeout?: number; attachments?: string[] }): Promise<Reply> {
    if (!this.authenticated || !this.ws) {
      throw new Error("Not connected");
    }

    const id = `msg-${++this.msgSeq}-${Date.now()}`;
    const sessionId = options?.sessionId ?? "default";
    const timeout = options?.timeout ?? 120_000;

    const msg = {
      type: "message" as const,
      id,
      sessionId,
      text,
      attachments: options?.attachments,
    };

    this.ws.send(JSON.stringify(msg));

    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Reply timeout after ${timeout}ms`));
      }, timeout);

      this.pending.set(id, { resolve, reject, timer });
    });
  }

  /** 断开连接 */
  disconnect(): void {
    this.closed = true;
    this._cleanup();
  }

  /** 监听事件: "reply" | "error" | "connected" | "disconnected" */
  on(event: string, handler: EventHandler): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  get isConnected(): boolean {
    return this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  // ========== 内部实现 ==========

  private _emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => {
      try { fn(...args); } catch { /* ignore listener errors */ }
    });
  }

  private _doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Connection timeout"));
        this.ws?.close();
      }, this.opts.connectTimeout);

      // 构建带 clientId query param 的 URL
      let wsUrl = this.opts.url;
      if (this.opts.clientId) {
        const sep = wsUrl.includes("?") ? "&" : "?";
        wsUrl += `${sep}clientId=${encodeURIComponent(this.opts.clientId)}`;
      }

      try {
        // Node.js ws 库: new WebSocket(url, options) — 第二个参数直接传 options 对象
        // 浏览器原生 WebSocket: 不支持自定义 header，走 query string fallback
        const isNode = typeof globalThis.process !== "undefined" && typeof globalThis.process.versions?.node === "string";
        if (isNode && this.opts.token) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.ws = new WebSocket(wsUrl, {
            headers: { Authorization: `Bearer ${this.opts.token}` },
          } as any);
        } else {
          this.ws = new WebSocket(wsUrl);
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        // Header 认证模式下不需要发 auth 消息，等服务端返回 auth_result 即可
      };

      this.ws.onmessage = (evt: MessageEvent) => {
        let data: ServerMessage;
        try {
          data = JSON.parse(typeof evt.data === "string" ? evt.data : evt.data.toString());
        } catch {
          return;
        }

        // 认证结果
        if (data.type === "auth_result") {
          clearTimeout(timer);
          if (data.ok) {
            this.authenticated = true;
            this.reconnectCount = 0;
            this._startPing();
            this._emit("connected");
            resolve();
          } else {
            reject(new Error(data.error || "Authentication failed"));
            this.ws?.close();
          }
          return;
        }

        // 回复消息
        if (data.type === "reply") {
          const p = this.pending.get(data.replyTo);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(data.replyTo);
            p.resolve({ messageId: data.messageId, text: data.text, mediaUrl: data.mediaUrl });
          }
          this._emit("reply", data);
          return;
        }

        // 错误消息
        if (data.type === "error") {
          if (data.replyTo) {
            const p = this.pending.get(data.replyTo);
            if (p) {
              clearTimeout(p.timer);
              this.pending.delete(data.replyTo);
              p.reject(new Error(data.message));
            }
          }
          this._emit("error", data);
          return;
        }

        // pong 不需要处理
      };

      this.ws.onclose = () => {
        this.authenticated = false;
        this._stopPing();
        this._emit("disconnected");

        // 如果不是主动关闭且开启了自动重连
        if (!this.closed && this.opts.autoReconnect) {
          if (this.opts.maxReconnects === 0 || this.reconnectCount < this.opts.maxReconnects) {
            this.reconnectCount++;
            setTimeout(() => {
              if (!this.closed) {
                this._doConnect().catch(() => {});
              }
            }, this.opts.reconnectInterval);
          }
        }
      };

      this.ws.onerror = () => {
        // onclose 会处理重连逻辑
      };
    });
  }

  private _startPing(): void {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30_000);
  }

  private _stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private _cleanup(): void {
    this._stopPing();
    this.authenticated = false;
    // reject 所有 pending 请求
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Client disconnected"));
    }
    this.pending.clear();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
