import { WebSocket } from "ws";
import {
  TunnelMessageType,
  TunnelHttpRequestPayload,
  TunnelHttpResponsePayload,
  AuditEventType,
  AppError,
  ErrorCode,
  createId,
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
  correlationId: string;
  resolve: (response: TunnelHttpResponsePayload) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class TunnelRelayService {
  private connectedAgents = new Map<string, ConnectedHostAgent>(); // hostId -> ConnectedHostAgent
  private pendingRpcs = new Map<string, PendingRpc>(); // correlationId -> PendingRpc
  private clientSessionSockets = new Map<string, Set<WebSocket>>(); // sessionId -> Set<WebSocket>

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
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRpcs.delete(payload.correlationId);
            pending.resolve(payload);
          }
        }
      } catch (err) {
        // Malformed frame
      }
    });

    socket.on("close", () => {
      if (this.connectedAgents.get(hostId)?.socket === socket) {
        this.connectedAgents.delete(hostId);
        auditService.record(AuditEventType.HOST_DISCONNECTED, hostId);
      }
    });

    socket.on("error", () => {
      socket.close();
    });
  }

  public isHostOnline(hostId = "local-host-agent"): boolean {
    const agent = this.connectedAgents.get(hostId);
    if (!agent) return false;
    return agent.socket.readyState === WebSocket.OPEN;
  }

  public getHostStatus(hostId = "local-host-agent"): {
    online: boolean;
    connectedAt?: string;
    lastHeartbeatAt?: string;
    capabilities?: Record<string, unknown>;
  } {
    const agent = this.connectedAgents.get(hostId);
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

  /**
   * Forward an HTTP request over the agent's outbound reverse WebSocket tunnel.
   */
  public async forwardRequest(
    hostId: string,
    reqPayload: Omit<TunnelHttpRequestPayload, "correlationId">,
    timeoutMs = 15000
  ): Promise<TunnelHttpResponsePayload> {
    const agent = this.connectedAgents.get(hostId);
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

    return new Promise((resolve, reject) => {
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
  }

  /**
   * Track client WebSocket for session termination
   */
  public registerClientSocket(sessionId: string, socket: WebSocket): void {
    let set = this.clientSessionSockets.get(sessionId);
    if (!set) {
      set = new Set();
      this.clientSessionSockets.set(sessionId, set);
    }
    set.add(socket);

    socket.on("close", () => {
      set?.delete(socket);
      if (set?.size === 0) {
        this.clientSessionSockets.delete(sessionId);
      }
    });
  }

  /**
   * Immediately close all active client WebSockets for a revoked/expired session
   */
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
    }
  }
}

export const tunnelRelayService = new TunnelRelayService();
