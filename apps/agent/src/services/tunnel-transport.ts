import { FastifyInstance } from "fastify";
import WebSocket from "ws";
import {
  TunnelMessageType,
  TunnelHttpRequestPayload,
  TunnelHttpResponsePayload,
  UserRole,
  Permission,
  hasPermission,
  ErrorCode,
  requiredRequestPermission,
  routeSegments,
} from "@remote-ide/shared";
import { terminalService } from "./terminal.service.js";

export interface ITunnelTransport {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

export interface TunnelTransportOptions {
  gatewayWsUrl: string;
  hostId: string;
  token?: string;
  app: FastifyInstance;
  heartbeatIntervalMs?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

/**
 * Local & Cloud Relay Transport.
 * Establishes an outbound authenticated persistent connection from the Host Agent
 * to the Remote Gateway without requiring inbound router port forwarding.
 */
export class RelayTunnelTransport implements ITunnelTransport {
  public readonly name = "relay";
  private ws: WebSocket | null = null;
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private backoffMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly heartbeatIntervalMs: number;
  private terminalUnsubscribers = new Map<string, () => void>();

  constructor(private readonly opts: TunnelTransportOptions) {
    this.initialBackoffMs = opts.initialBackoffMs ?? 1000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 30000;
    this.backoffMs = this.initialBackoffMs;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 10000;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public async connect(): Promise<void> {
    this.isShuttingDown = false;
    return new Promise((resolve) => {
      this.doConnect(resolve);
    });
  }

  private doConnect(firstConnectResolve?: () => void): void {
    if (this.isShuttingDown) return;

    try {
      const url = `${this.opts.gatewayWsUrl}?hostId=${encodeURIComponent(this.opts.hostId)}`;
      this.ws = new WebSocket(url, {
        headers: this.opts.token ? { Authorization: `Bearer ${this.opts.token}` } : {},
      });

      this.ws.on("open", () => {
        this.backoffMs = this.initialBackoffMs; // Reset backoff on success
        this.startHeartbeat();

        // Register host with gateway
        this.ws?.send(
          JSON.stringify({
            type: TunnelMessageType.AGENT_REGISTER,
            payload: {
              hostId: this.opts.hostId,
              capabilities: {
                reverseTunnel: true,
                platform: process.platform,
                nodeVersion: process.version,
              },
            },
          })
        );

        if (firstConnectResolve) {
          firstConnectResolve();
          firstConnectResolve = undefined;
        }
      });

      this.ws.on("message", async (data: Buffer | string) => {
        try {
          const text = data.toString();
          const msg = JSON.parse(text);

          if (msg.type === TunnelMessageType.TUNNEL_REQUEST) {
            const reqPayload = msg.payload as TunnelHttpRequestPayload;
            const resPayload = await this.handleProxiedRequest(reqPayload);
            this.ws?.send(
              JSON.stringify({
                type: TunnelMessageType.TUNNEL_RESPONSE,
                payload: resPayload,
              })
            );
          } else if (msg.type === TunnelMessageType.TERMINAL_ATTACH) {
            const { sessionId, authContext } = msg.payload || {};
            if (authContext?.role !== UserRole.OWNER) {
              this.ws?.send(
                JSON.stringify({
                  type: TunnelMessageType.TERMINAL_DATA,
                  payload: {
                    sessionId,
                    error: "Host agent rejected: Terminal execution is restricted to owner.",
                  },
                })
              );
              return;
            }

            try {
              const { replayBuffer, unsubscribe } = terminalService.attach(
                sessionId,
                (terminalChunk) => {
                  this.ws?.send(
                    JSON.stringify({
                      type: TunnelMessageType.TERMINAL_DATA,
                      payload: { sessionId, data: terminalChunk },
                    })
                  );
                }
              );

              this.terminalUnsubscribers.get(sessionId)?.();
              this.terminalUnsubscribers.set(sessionId, unsubscribe);
              this.ws?.send(
                JSON.stringify({
                  type: TunnelMessageType.TERMINAL_ATTACHED,
                  payload: { sessionId, buffer: replayBuffer },
                })
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : "Failed to attach to terminal";
              this.ws?.send(
                JSON.stringify({
                  type: TunnelMessageType.TERMINAL_DATA,
                  payload: { sessionId, error: message },
                })
              );
            }
          } else if (msg.type === TunnelMessageType.TERMINAL_DATA) {
            const { sessionId, data: inputData } = msg.payload || {};
            if (sessionId && typeof inputData === "string") {
              try {
                terminalService.writeTerminal(sessionId, inputData);
              } catch {
                // Ignore error on closed terminal
              }
            }
          } else if (msg.type === TunnelMessageType.TERMINAL_RESIZE) {
            const { sessionId, cols, rows } = msg.payload || {};
            if (sessionId && typeof cols === "number" && typeof rows === "number") {
              try {
                terminalService.resizeTerminal(sessionId, cols, rows);
              } catch {
                // Ignore error on closed terminal
              }
            }
          } else if (msg.type === TunnelMessageType.TERMINAL_CLOSE) {
            const { sessionId } = msg.payload || {};
            if (sessionId) {
              const unsub = this.terminalUnsubscribers.get(sessionId);
              if (unsub) {
                unsub();
                this.terminalUnsubscribers.delete(sessionId);
              }
            }
          }
        } catch (err) {
          // Bad frame
        }
      });

      this.ws.on("close", () => {
        this.stopHeartbeat();
        for (const unsubscribe of this.terminalUnsubscribers.values()) unsubscribe();
        this.terminalUnsubscribers.clear();
        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
        if (firstConnectResolve) {
          firstConnectResolve();
          firstConnectResolve = undefined;
        }
      });

      this.ws.on("error", () => {
        this.ws?.close();
      });
    } catch {
      this.scheduleReconnect();
      if (firstConnectResolve) {
        firstConnectResolve();
        firstConnectResolve = undefined;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isShuttingDown) return;

    // Exponential backoff with random jitter
    const jitter = Math.floor(Math.random() * 500);
    const delay = Math.min(this.maxBackoffMs, this.backoffMs + jitter);
    this.backoffMs = Math.min(this.maxBackoffMs, Math.floor(this.backoffMs * 1.5));

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.ws?.send(
          JSON.stringify({
            type: TunnelMessageType.TUNNEL_HEARTBEAT,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Dual-layer capability and boundary enforcement on the host agent before execution.
   */
  private async handleProxiedRequest(
    req: TunnelHttpRequestPayload
  ): Promise<TunnelHttpResponsePayload> {
    try {
      const auth = req.authContext;

      if (!auth) {
        return { correlationId: req.correlationId, statusCode: 401, body: { success: false, error: { code: ErrorCode.UNAUTHORIZED, message: "Tunnel authorization context required" } } };
      }
      const segments = routeSegments(req.path);
      if (segments[2] === "workspaces" && (segments[3] === "register" || (segments.length === 4 && req.method === "DELETE")) && auth.role !== UserRole.OWNER) {
        return { correlationId: req.correlationId, statusCode: 403, body: { success: false, error: { code: ErrorCode.FORBIDDEN, message: "Only the owner can manage host workspaces" } } };
      }
      // 1. Dual-layer Capability Enforcement on Host Agent
      if (auth) {
        const required = requiredRequestPermission(req.method, req.path, req.body);
        if (required === Permission.TERMINAL_ACCESS && auth.role !== UserRole.OWNER) {
          return { correlationId: req.correlationId, statusCode: 403, body: { success: false, error: { code: ErrorCode.FORBIDDEN, message: "Terminal access is restricted to owner" } } };
        }
        if (!hasPermission(required, auth.capabilities)) {
          return {
            correlationId: req.correlationId,
            statusCode: 403,
            body: {
              success: false,
              error: {
                code: ErrorCode.FORBIDDEN,
                message: `Host agent enforcement rejected: Role "${auth.role}" lacks capability "${required}".`,
              },
            },
          };
        }

        // 2. Dual-layer Workspace Restriction on Host Agent
        if (auth.allowedWorkspaceIds && auth.allowedWorkspaceIds.length > 0) {
          // Host-wide tools accept absolute paths or execute arbitrary commands;
          // they cannot safely honor a workspace-only grant.
          if (segments[2] !== "workspaces") {
            return { correlationId: req.correlationId, statusCode: 403, body: { success: false, error: { code: ErrorCode.FORBIDDEN, message: "Host-wide tools require an unrestricted session" } } };
          }
          const match = segments[3] ? ["", segments[3]] : null;
          if (match && match[1] && match[1] !== "register" && match[1] !== "active") {
            const targetWsId = match[1];
            if (!auth.allowedWorkspaceIds.includes(targetWsId)) {
              return {
                correlationId: req.correlationId,
                statusCode: 403,
                body: {
                  success: false,
                  error: {
                    code: ErrorCode.FORBIDDEN,
                    message: `Host agent boundary violation: Access to workspace "${targetWsId}" is not authorized.`,
                  },
                },
              };
            }
          }
        }
      }

      // 3. Dispatch locally through the Fastify app
      const response = await this.opts.app.inject({
        method: req.method as any,
        url: req.path,
        query: req.query,
        headers: req.headers,
        payload: req.body as any,
      });

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(response.payload);
      } catch {
        parsedBody = response.payload;
      }

      if (auth.allowedWorkspaceIds.length > 0 && segments[2] === "workspaces" && parsedBody && typeof parsedBody === "object") {
        const envelope = parsedBody as { data?: unknown };
        if (Array.isArray(envelope.data)) {
          envelope.data = envelope.data.filter((ws) => auth.allowedWorkspaceIds.includes(ws.id));
        } else if (segments[3] === "active" && envelope.data && !auth.allowedWorkspaceIds.includes((envelope.data as { id: string }).id)) {
          envelope.data = null;
        }
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers)) {
        if (v !== undefined && !["content-length", "transfer-encoding", "connection"].includes(k)) {
          headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
        }
      }

      return {
        correlationId: req.correlationId,
        statusCode: response.statusCode,
        headers,
        body: segments[2] === "preview" ? response.rawPayload.toString("base64") : parsedBody,
        ...(segments[2] === "preview" ? { bodyEncoding: "base64" as const } : {}),
      };
    } catch (err: unknown) {
      return {
        correlationId: req.correlationId,
        statusCode: 500,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: (err as Error).message || "Host agent dispatch error",
        },
      };
    }
  }

  public async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    this.stopHeartbeat();
    for (const unsubscribe of this.terminalUnsubscribers.values()) unsubscribe();
    this.terminalUnsubscribers.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, "Agent disconnecting cleanly");
      } catch {
        // Socket already closed
      }
      this.ws = null;
    }
  }
}

/**
 * Cloudflare Tunnel Transport configuration reference.
 * In a cloud deployment, cloudflared can be run alongside the host agent:
 * `cloudflared tunnel run --url http://localhost:4001`
 * The gateway routes through the Cloudflare reverse tunnel hostname.
 */
export class CloudflareTunnelTransport implements ITunnelTransport {
  public readonly name = "cloudflare-tunnel";

  constructor(private readonly tunnelUrl?: string) {}

  public isConnected(): boolean {
    return !!this.tunnelUrl;
  }

  public async connect(): Promise<void> {
    // Cloudflare daemon manages the outbound tunnel
  }

  public async disconnect(): Promise<void> {
    // Cleanup
  }
}
