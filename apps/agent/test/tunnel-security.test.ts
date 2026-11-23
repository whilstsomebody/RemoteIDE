import { afterAll, beforeAll, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAgentApp, type AgentContext } from "../src/app.js";
import { RelayTunnelTransport } from "../src/services/tunnel-transport.js";
import { ROLE_PERMISSIONS, UserRole, type TunnelHttpRequestPayload } from "@remote-ide/shared";

let context: AgentContext;
let dir: string;
let allowed: string;
let transport: RelayTunnelTransport;
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tunnel-security-"));
  for (const name of ["allowed", "secret"]) fs.mkdirSync(path.join(dir, name));
  context = await buildAgentApp({ logger: false, dataDir: dir, journalPath: ":memory:", enableTunnel: false });
  allowed = context.workspaceService.registerWorkspace("Allowed", [path.join(dir, "allowed")]).id;
  context.workspaceService.registerWorkspace("Secret", [path.join(dir, "secret")]);
  transport = new RelayTunnelTransport({ app: context.app, hostId: "test-host", gatewayWsUrl: "ws://localhost:4000/api/v1/tunnel/agent" });
});
afterAll(async () => {
  context.watcherService.stopAll(); context.terminalWsServer?.close();
  await context.app.close(); context.workspaceService.close(); context.journal.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
function dispatch(request: Partial<TunnelHttpRequestPayload>) {
  return (transport as any).handleProxiedRequest({ correlationId: "test", method: "GET", path: "/api/v1/workspaces", ...request });
}
function auth() { return { sessionId: "session", userId: "user", role: UserRole.OPERATOR, capabilities: ROLE_PERMISSIONS[UserRole.OPERATOR], allowedWorkspaceIds: [allowed] }; }
it("rejects tunnel requests without authorization context", async () => {
  expect((await dispatch({})).statusCode).toBe(401);
});
it("filters workspace metadata and rejects host-wide tools for scoped sessions", async () => {
  const response = await dispatch({ authContext: auth() });
  expect(response.statusCode).toBe(200);
  expect(response.body.data.map((ws: any) => ws.id)).toEqual([allowed]);
  for (const url of ["/api/v1/git/status?path=/", "/api/v1/jobs", "/api/v1/processes", "/api/v1/ports"]) {
    expect((await dispatch({ path: url, authContext: auth() })).statusCode).toBe(403);
  }
  expect((await dispatch({ method: "POST", path: "/api/v1/workspaces/register", body: { paths: ["/"] }, authContext: auth() })).statusCode).toBe(403);
});
it("authorizes the canonical path so dot segments cannot reach owner-only routes", async () => {
  const response = await dispatch({
    method: "POST",
    path: `/api/v1/workspaces/${allowed}/../../terminals`,
    body: {},
    authContext: auth(),
  });
  expect(response.statusCode).toBe(403);
  expect(response.body.error.message).toContain("restricted to owner");
});
it("rejects local API requests with a non-loopback Host or foreign Origin", async () => {
  expect((await context.app.inject({ method: "GET", url: "/api/v1/health", headers: { host: "attacker.example:4001" } })).statusCode).toBe(403);
  expect((await context.app.inject({ method: "GET", url: "/api/v1/health", headers: { origin: "https://attacker.example" } })).statusCode).toBe(403);
  expect((await context.app.inject({ method: "GET", url: "/api/v1/health", headers: { host: "127.0.0.1:4001", origin: "http://localhost:3000" } })).statusCode).toBe(200);
});
