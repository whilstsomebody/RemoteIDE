import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { authService } from "../src/services/auth.service.js";
import { tunnelRelayService } from "../src/services/tunnel-relay.service.js";
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
  it("preserves binary proxy responses", async () => {
    const bytes = Buffer.from([0, 255, 128, 1]);
    vi.spyOn(tunnelRelayService, "forwardRequest").mockResolvedValue({ correlationId: "rpc", statusCode: 200, headers: { "content-type": "image/png" }, bodyEncoding: "base64", body: bytes.toString("base64") });
    const response = await app.inject({ url: "/api/v1/preview/3000/image.png", headers: { authorization: `Bearer ${token(UserRole.OWNER)}` } });
    expect(response.rawPayload).toEqual(bytes);
    expect(response.headers["content-security-policy"]).toContain("sandbox");
  });
});
