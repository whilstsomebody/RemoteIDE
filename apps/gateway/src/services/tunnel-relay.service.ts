import { WebSocket } from "ws";
import {
  TunnelMessageType,
  TunnelHttpRequestPayload,
  TunnelHttpResponsePayload,
  AuditEventType,
  AppError,
  ErrorCode,
  createId,
  CircuitBreaker,
} from "@remote-ide/shared";
import { auditService } from "./audit.service.js";

export interface ConnectedHostAgent {
  hostId: string;
  socket: WebSocket;
  connectedAt: string;
  lastHeartbeatAt: string;
  capabilities?: Record<string, unknown>;
}

export interface PendingRpc {
  socket: WebSocket;
  correlationId: string;
  resolve: (response: TunnelHttpResponsePayload) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class TunnelRelayService {
  private connectedAgents = new Map<string, ConnectedHostAgent>(); // hostId -> ConnectedHostAgent
  private pendingRpcs = new Map<string, PendingRpc>(); // correlationId -> PendingRpc
  private clientSessionSockets = new Map<string, Set<WebSocket>>(); // sessionId -> Set<WebSocket>
  private clientSessions = new Map<string, { allowedWorkspaceIds: string[]; role: string; expiresAt?: string }>();
  private broadcastIds = new Set<string>();
  private terminalSessionListeners = new Map<string, Set<(msg: unknown) => void>>();
  private circuitBreakers = new Map<string, CircuitBreaker>();

  private getCircuitBreaker(hostId: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(hostId);
    if (!cb) {
      cb = new CircuitBreaker({
        name: `HostAgent-${hostId}`,
        failureThreshold: 5,
        recoveryTimeoutMs: 10000,
        halfOpenSuccessThreshold: 2,
      });
      this.circuitBreakers.set(hostId, cb);
    }
    return cb;
  }

  public registerAgentSocket(
    hostId: string,
    socket: WebSocket,
    capabilities?: Record<string, unknown>
  ): void {
    const existing = this.connectedAgents.get(hostId);
    if (existing && existing.socket !== socket) {
      existing.socket.close(1000, "Replaced by newer connection");
    }

    const agent: ConnectedHostAgent = {
      hostId,
      socket,
      connectedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      capabilities,
    };

    this.connectedAgents.set(hostId, agent);
    auditService.record(AuditEventType.HOST_CONNECTED, hostId, {
      metadata: { capabilities },
    });

    socket.on("message", (data: Buffer | string) => {
      try {
        const text = data.toString();
        const msg = JSON.parse(text);

        if (msg.type === TunnelMessageType.TUNNEL_HEARTBEAT) {
          agent.lastHeartbeatAt = new Date().toISOString();
          socket.send(
            JSON.stringify({
              type: TunnelMessageType.TUNNEL_HEARTBEAT_ACK,
              timestamp: new Date().toISOString(),
            })
          );
        } else if (msg.type === TunnelMessageType.TUNNEL_RESPONSE) {
          const payload = msg.payload as TunnelHttpResponsePayload;
          const pending = this.pendingRpcs.get(payload.correlationId);
          if (pending && pending.socket === socket) {
            clearTimeout(pending.timer);
            this.pendingRpcs.delete(payload.correlationId);
            pending.resolve(payload);
          }
        } else if (
          msg.type === TunnelMessageType.TERMINAL_DATA ||
          msg.type === TunnelMessageType.TERMINAL_ATTACHED
        ) {
          const sessionId = msg.payload?.sessionId;
          if (sessionId) {
            const listeners = this.terminalSessionListeners.get(sessionId);
            if (listeners) {
              for (const listener of listeners) {
                try {
                  listener(msg);
                } catch {
                  // Ignore listener error
                }
              }
            }
          }
        }
      } catch (err) {
        // Malformed frame
      }
    });

    socket.on("close", () => {
      for (const [id, pending] of this.pendingRpcs) {
        if (pending.socket === socket) {
          clearTimeout(pending.timer);
          this.pendingRpcs.delete(id);
          pending.reject(new AppError(ErrorCode.SERVICE_UNAVAILABLE, "Host disconnected during request", { statusCode: 503 }));
        }
      }
      if (this.connectedAgents.get(hostId)?.socket === socket) {
        this.connectedAgents.delete(hostId);
        auditService.record(AuditEventType.HOST_DISCONNECTED, hostId);
      }
    });

    socket.on("error", () => {
      socket.close();
    });
  }

  /**
   * Helper to resolve a connected agent by hostId or single-agent fallback
   */
  public getConnectedAgent(hostId = "local-host-agent"): ConnectedHostAgent | undefined {
    if (this.connectedAgents.has(hostId)) {
      return this.connectedAgents.get(hostId);
    }
    // Fallback if local-host-agent is requested or only one agent is connected
    if ((!hostId || hostId === "local-host-agent") && this.connectedAgents.size === 1) {
      return this.connectedAgents.values().next().value;
    }
    return undefined;
  }

  public isHostOnline(hostId = "local-host-agent"): boolean {
    const agent = this.getConnectedAgent(hostId);
    if (!agent) return false;
    return agent.socket.readyState === WebSocket.OPEN;
  }

  public getHostStatus(hostId = "local-host-agent"): {
    online: boolean;
    connectedAt?: string;
    lastHeartbeatAt?: string;
    capabilities?: Record<string, unknown>;
  } {
    const agent = this.getConnectedAgent(hostId);
    if (!agent || agent.socket.readyState !== WebSocket.OPEN) {
      return { online: false };
    }
    return {
      online: true,
      connectedAt: agent.connectedAt,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      capabilities: agent.capabilities,
    };
  }

  public subscribeTerminal(sessionId: string, listener: (msg: unknown) => void): () => void {
    let set = this.terminalSessionListeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.terminalSessionListeners.set(sessionId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set?.size === 0) {
        this.terminalSessionListeners.delete(sessionId);
      }
    };
  }

  public sendTerminalMessage(hostId: string, type: TunnelMessageType, payload: unknown): void {
    const agent = this.getConnectedAgent(hostId);
    if (agent && agent.socket.readyState === WebSocket.OPEN) {
      agent.socket.send(JSON.stringify({ type, payload }));
    }
  }

  public async forwardRequest(
    hostId: string,
    reqPayload: Omit<TunnelHttpRequestPayload, "correlationId">,
    timeoutMs = 15000
  ): Promise<TunnelHttpResponsePayload> {
    const breaker = this.getCircuitBreaker(hostId);
    return breaker.execute(() => {
      const agent = this.getConnectedAgent(hostId);
      if (!agent || agent.socket.readyState !== WebSocket.OPEN) {
        throw new AppError(
          ErrorCode.SERVICE_UNAVAILABLE,
          `Host agent "${hostId}" is currently offline or unreachable over reverse tunnel. Ensure host agent daemon is running.`,
          { statusCode: 503 }
        );
      }

      const correlationId = createId("rpc");
      const fullPayload: TunnelHttpRequestPayload = {
        ...reqPayload,
        correlationId,
      };

      return new Promise<TunnelHttpResponsePayload>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingRpcs.delete(correlationId);
          reject(
            new AppError(
              ErrorCode.GATEWAY_TIMEOUT,
              `Host agent request timed out after ${timeoutMs}ms`,
              { statusCode: 504 }
            )
          );
        }, timeoutMs);

        this.pendingRpcs.set(correlationId, {
          correlationId,
          socket: agent.socket,
          resolve,
          reject,
          timer,
        });

        agent.socket.send(
          JSON.stringify({
            type: TunnelMessageType.TUNNEL_REQUEST,
            payload: fullPayload,
          })
        );
      });
    });
  }

  /**
   * Track client WebSocket for session termination and workspace notifications
   */
  public registerClientSocket(
    sessionId: string,
    socket: WebSocket,
    session?: { allowedWorkspaceIds: string[]; role: string; expiresAt?: string }
  ): void {
    if (session) {
      this.clientSessions.set(sessionId, session);
    }
    let set = this.clientSessionSockets.get(sessionId);
    if (!set) {
      set = new Set();
      this.clientSessionSockets.set(sessionId, set);
    }
    set.add(socket);

    if (typeof socket.on === "function") {
      const expiryTimer = session?.expiresAt ? setInterval(() => {
        if (Date.parse(session.expiresAt!) <= Date.now()) this.terminateSessionSockets(sessionId);
      }, 1000) : undefined;
      expiryTimer?.unref();
      socket.on("close", () => {
        if (expiryTimer) clearInterval(expiryTimer);
        set?.delete(socket);
        if (set?.size === 0) {
          this.clientSessionSockets.delete(sessionId);
          this.clientSessions.delete(sessionId);
        }
      });
    }
  }

  public getClientSocketCount(): number {
    let count = 0;
    for (const set of this.clientSessionSockets.values()) {
      count += set.size;
    }
    return count;
  }

  public broadcastWorkspaceEvent(workspaceId: string, event: unknown): void {
    const eventId = (event as { id?: string })?.id;
    if (eventId) {
      if (this.broadcastIds.has(eventId)) return;
      this.broadcastIds.add(eventId);
      if (this.broadcastIds.size > 10000) this.broadcastIds.delete(this.broadcastIds.values().next().value!);
    }
    const message = JSON.stringify({
      type: "workspace.event",
      payload: event,
    });

    for (const [sessionId, sockets] of this.clientSessionSockets.entries()) {
      const session = this.clientSessions.get(sessionId);
      if (!session) continue;
      if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
        this.terminateSessionSockets(sessionId);
        continue;
      }
      if (
        session.allowedWorkspaceIds.length > 0 &&
        !session.allowedWorkspaceIds.includes(workspaceId)
      ) {
        continue;
      }

      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(message);
          } catch {}
        }
      }
    }
  }

  public terminateSessionSockets(sessionId: string): void {
    const sockets = this.clientSessionSockets.get(sessionId);
    if (sockets) {
      for (const socket of sockets) {
        try {
          socket.close(4401, "Session has been revoked or expired");
        } catch {
          // Socket already closed
        }
      }
      this.clientSessionSockets.delete(sessionId);
      this.clientSessions.delete(sessionId);
    }
  }

  public hasTerminalSubscribers(sessionId: string): boolean {
    return (this.terminalSessionListeners.get(sessionId)?.size || 0) > 0;
  }
}

export const tunnelRelayService = new TunnelRelayService();
