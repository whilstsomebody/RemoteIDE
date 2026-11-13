import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { tunnelRelayService } from "../src/services/tunnel-relay.service.js";
import { authService } from "../src/services/auth.service.js";
import { TunnelMessageType } from "@remote-ide/shared";

class MockWebSocket extends EventEmitter {
  public readyState = 1; // WebSocket.OPEN
  public sentMessages: string[] = [];
  public closeCode?: number;
  public closeReason?: string;

  public send(data: string) {
    this.sentMessages.push(data);
  }

  public close(code?: number, reason?: string) {
    this.readyState = 3; // WebSocket.CLOSED
    this.closeCode = code;
    this.closeReason = reason;
    this.emit("close", code, reason);
  }
}

describe("Phase 3 - Outbound Reverse Tunnel Relay & Session Severance", () => {
  beforeEach(() => {
    (tunnelRelayService as any).connectedAgents.clear();
    (tunnelRelayService as any).pendingRpcs.clear();
    (tunnelRelayService as any).clientSessionSockets.clear();
    (authService as any).sessions.clear();
    (authService as any).tokenHashToSessionId.clear();
  });

  it("handles agent reverse tunnel registration, heartbeats, and request forwarding", async () => {
    const mockAgentSocket = new MockWebSocket();

    // 1. Agent registers over outbound reverse tunnel
    tunnelRelayService.registerAgentSocket("test-host", mockAgentSocket as any, {
      reverseTunnel: true,
      platform: "darwin",
    });

    expect(tunnelRelayService.isHostOnline("test-host")).toBe(true);
    const status = tunnelRelayService.getHostStatus("test-host");
    expect(status.online).toBe(true);
    expect(status.capabilities).toBeDefined();

    // 2. Heartbeat ping from agent produces pong
    mockAgentSocket.emit(
      "message",
      JSON.stringify({
        type: TunnelMessageType.TUNNEL_HEARTBEAT,
        timestamp: new Date().toISOString(),
      })
    );

    const heartbeatAckMsg = mockAgentSocket.sentMessages.find((m) =>
      m.includes(TunnelMessageType.TUNNEL_HEARTBEAT_ACK)
    );
    expect(heartbeatAckMsg).toBeDefined();

    // 3. Gateway forwards request across reverse tunnel
    const forwardPromise = tunnelRelayService.forwardRequest("test-host", {
      method: "GET",
      path: "/api/v1/workspaces",
      headers: { "x-test": "1" },
    });

    // Check that TUNNEL_REQUEST was sent across the agent socket
    const requestFrame = mockAgentSocket.sentMessages.find((m) =>
      m.includes(TunnelMessageType.TUNNEL_REQUEST)
    );
    expect(requestFrame).toBeDefined();
    const parsedRequest = JSON.parse(requestFrame!);
    const correlationId = parsedRequest.payload.correlationId;
    expect(correlationId).toBeDefined();

    // Agent replies with TUNNEL_RESPONSE
    mockAgentSocket.emit(
      "message",
      JSON.stringify({
        type: TunnelMessageType.TUNNEL_RESPONSE,
        payload: {
          correlationId,
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: { success: true, message: "Response from agent across reverse tunnel" },
        },
      })
    );

    const response = await forwardPromise;
    expect(response.statusCode).toBe(200);
    expect((response.body as any).message).toContain("reverse tunnel");
  });

  it("immediately severs active client WebSockets when a session is revoked", async () => {
    // 1. Create a session
    const { session } = authService.createSessionInternal({
      userId: "test-user-1",
      hostId: "local-host-agent",
      role: "viewer" as any,
      capabilities: [],
      allowedWorkspaceIds: [],
      deviceName: "iPad",
      ipAddress: "127.0.0.1",
      userAgent: "Safari",
      isOwner: false,
      durationSeconds: 3600,
    });

    const mockClientSocket = new MockWebSocket();
    tunnelRelayService.registerClientSocket(session.id, mockClientSocket as any);

    // 2. Revoking the session immediately closes the client WebSocket with code 4401
    authService.revokeSession(session.id, "admin");

    expect(mockClientSocket.readyState).toBe(3); // CLOSED
    expect(mockClientSocket.closeCode).toBe(4401);
    expect(mockClientSocket.closeReason).toContain("revoked or expired");
  });
});
