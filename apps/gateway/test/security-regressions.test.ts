import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { authService } from "../src/services/auth.service.js";
import { tunnelRelayService } from "../src/services/tunnel-relay.service.js";
import { rateLimiterService } from "../src/services/rate-limiter.service.js";
import { aiAssistantService } from "../src/services/ai-assistant.service.js";
import { ROLE_PERMISSIONS, UserRole } from "@remote-ide/shared";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
beforeEach(async () => { app = await buildApp({ logger: false }); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await app.close(); });
function token(role: UserRole, scope: string[] = []) {
  return authService.createSessionInternal({ userId: "regression", hostId: "local-host-agent", role, capabilities: ROLE_PERMISSIONS[role], allowedWorkspaceIds: scope, deviceName: "Test", ipAddress: "203.0.113.1", userAgent: "Test", isOwner: role === UserRole.OWNER, durationSeconds: 3600 }).sessionToken;
}

describe("authorization regressions", () => {
  it("does not trust a spoofed Host header for owner fallback or setup-token disclosure", async () => {
    vi.spyOn(authService, "isOwnerBootstrapped").mockReturnValue(false);
    const status = await app.inject({ url: "/api/v1/auth/status", remoteAddress: "203.0.113.1", headers: { host: "localhost" } });
    expect(status.json().data.localSetupToken).toBeUndefined();
    const request = await app.inject({ url: "/api/v1/workspaces", remoteAddress: "203.0.113.1", headers: { host: "localhost" } });
    expect(request.statusCode).toBe(401);
  });
  it("blocks query-string capability spoofing and workspace registration by guests", async () => {
    const auth = { authorization: `Bearer ${token(UserRole.VIEWER)}` };
    const forward = vi.spyOn(tunnelRelayService, "forwardRequest");
    const response = await app.inject({ method: "PUT", url: "/api/v1/workspaces/ws/files/write?path=/git/file", headers: auth, payload: { path: "file", content: "overwrite" } });
    expect(response.statusCode).toBe(403);
    expect(forward).not.toHaveBeenCalled();
    const register = await app.inject({ method: "POST", url: "/api/v1/workspaces/register", headers: { authorization: `Bearer ${token(UserRole.EDITOR)}` }, payload: { name: "outside", paths: ["/"] } });
    expect(register.statusCode).toBe(403);
  });
  it("checks decoded workspace IDs and force-push permissions", async () => {
    const response = await app.inject({ url: "/api/v1/workspaces/%73ecret/files", headers: { authorization: `Bearer ${token(UserRole.VIEWER, ["allowed"])}` } });
    expect(response.statusCode).toBe(403);
    const force = await app.inject({ method: "POST", url: "/api/v1/git/push", headers: { authorization: `Bearer ${token(UserRole.DEVELOPER)}` }, payload: { force: true, confirmed: true } });
    expect(force.statusCode).toBe(403);
  });
  it("authenticates sync writes and scopes reconciliation", async () => {
    const anonymous = await app.inject({ url: "/api/v1/sync/reconcile?workspaceId=secret", remoteAddress: "203.0.113.1" });
    expect(anonymous.statusCode).toBe(401);
    const scoped = await app.inject({ url: "/api/v1/sync/reconcile?workspaceId=secret", headers: { authorization: `Bearer ${token(UserRole.VIEWER, ["allowed"])}` } });
    expect(scoped.statusCode).toBe(403);
    const write = await app.inject({ method: "POST", url: "/api/v1/sync/events", remoteAddress: "203.0.113.1", payload: { hostId: "spoof", events: [] } });
    expect(write.statusCode).toBe(401);
  });
  it("rejects untrusted origins before state-changing routes", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { origin: "http://localhost:3000.attacker.example" } });
    expect(response.statusCode).toBe(403);
  });
  it("applies the auth rate limit to percent-encoded auth paths", async () => {
    rateLimiterService.reset();
    let last = 0;
    for (let i = 0; i <= rateLimiterService.defaultRules.auth.limit; i++) {
      last = (await app.inject({ method: "POST", url: "/api/v1/auth/%6cogin", remoteAddress: "198.51.100.7", payload: {} })).statusCode;
    }
    expect(last).toBe(429);
    rateLimiterService.reset();
  });
  it("does not forward session credentials across the tunnel", async () => {
    const sessionToken = token(UserRole.OWNER);
    const forward = vi.spyOn(tunnelRelayService, "forwardRequest").mockResolvedValue({ correlationId: "rpc", statusCode: 200, body: {} });
    await app.inject({ url: "/api/v1/workspaces", headers: { authorization: `Bearer ${sessionToken}`, cookie: `remoteide_session=${sessionToken}` } });
    const headers = forward.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers["x-remoteide-role"]).toBe(UserRole.OWNER);
  });
  it("requires authentication for tunnel status", async () => {
    const response = await app.inject({ url: "/api/v1/tunnel/status", remoteAddress: "203.0.113.1" });
    expect(response.statusCode).toBe(401);
  });
  it("refuses to append prompts to another user's AI conversation", async () => {
    aiAssistantService.setMockGenerator(async function* () { yield "ok"; });
    try {
      const conv = await aiAssistantService.createConversation("ws", "victim", "Private");
      const events = [];
      for await (const evt of aiAssistantService.streamPrompt(conv.id, "attacker", "inject")) events.push(evt);
      expect(events[0]?.code).toBe("NOT_FOUND");
      expect((await aiAssistantService.getConversation(conv.id, "victim"))?.messages).toHaveLength(0);
    } finally {
      aiAssistantService.setMockGenerator(null);
    }
  });
  it("preserves binary proxy responses", async () => {
    const bytes = Buffer.from([0, 255, 128, 1]);
    vi.spyOn(tunnelRelayService, "forwardRequest").mockResolvedValue({ correlationId: "rpc", statusCode: 200, headers: { "content-type": "image/png" }, bodyEncoding: "base64", body: bytes.toString("base64") });
    const response = await app.inject({ url: "/api/v1/preview/3000/image.png", headers: { authorization: `Bearer ${token(UserRole.OWNER)}` } });
    expect(response.rawPayload).toEqual(bytes);
    expect(response.headers["content-security-policy"]).toContain("sandbox");
  });
});
