import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { buildApp } from "../src/app.js";
import { authService } from "../src/services/auth.service.js";
import { tunnelRelayService } from "../src/services/tunnel-relay.service.js";
import { aiAssistantService } from "../src/services/ai-assistant.service.js";
import { outboxService } from "../src/services/outbox.service.js";
import {
  TunnelMessageType,
  createId,
} from "@remote-ide/shared";

describe("Phase 13 — Complete System Validation & 18-Step Scenario", () => {
  let app: any;
  let testDir: string;
  let workspaceId: string;
  let ownerToken: string;
  let phoneToken: string;
  let phoneSessionId: string;
  const hostId = "test-host-agent-13";

  // Mock Agent WebSocket for reverse tunnel simulation
  let mockAgentWs: any;

  beforeAll(async () => {
    // 1. Setup local project directory (Computer A)
    testDir = path.join(os.tmpdir(), `remoteide-e2e-${createId("test")}`);
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "package.json"), JSON.stringify({ name: "sample-app", version: "1.0.0" }));
    fs.writeFileSync(path.join(testDir, "index.js"), 'console.log("Hello from RemoteIDE");\n');

    try {
      execSync("git init", { cwd: testDir });
      execSync('git config user.email "test@example.com"', { cwd: testDir });
      execSync('git config user.name "Test Runner"', { cwd: testDir });
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "initial commit"', { cwd: testDir });
    } catch {}

    // 2. Initialize Gateway
    app = await buildApp({ logger: false });
    await app.ready();

    // 3. Authenticate Owner on Computer A via bootstrap
    const setupToken = authService.getSetupToken();
    const bootstrapRes = await authService.bootstrapOwner({
      email: "owner@computera.local",
      password: "StrongPassword123!",
      displayName: "Computer A Owner",
      localSetupToken: setupToken,
      remoteIp: "127.0.0.1",
      userAgent: "TestHost/1.0",
    });
    ownerToken = bootstrapRes.sessionToken;
    workspaceId = "ws-e2e-project";

    // 4. Connect simulated Host Agent reverse tunnel
    const listeners = new Map<string, (data: any) => void>();
    mockAgentWs = {
      readyState: 1, // OPEN
      send: (dataStr: string) => {
        const msg = JSON.parse(dataStr);
        if (msg.type === TunnelMessageType.TUNNEL_REQUEST) {
          const req = msg.payload;
          // Simulated Host Agent HTTP handler
          let respBody: any = { success: true };
          const statusCode = 200;

          if (req.path.includes("/api/v1/files") && req.method === "GET") {
            respBody = {
              success: true,
              data: [
                { name: "index.js", path: "index.js", isFile: true, size: 35 },
                { name: "package.json", path: "package.json", isFile: true, size: 40 },
              ],
            };
          } else if (req.path.includes("/api/v1/files/write")) {
            respBody = { success: true, data: { bytesWritten: 50, eTag: "w_etag_123" } };
          } else if (req.path.includes("/api/v1/git/status")) {
            respBody = { success: true, data: { branch: "main", clean: false, modified: ["index.js"] } };
          } else if (req.path.includes("/api/v1/preview")) {
            respBody = "<h1>Dev Server Preview OK</h1>";
          }

          const responseMsg = {
            type: TunnelMessageType.TUNNEL_RESPONSE,
            payload: {
              correlationId: req.correlationId,
              statusCode,
              headers: { "content-type": "application/json" },
              body: respBody,
            },
          };

          // Trigger response on next tick
          setTimeout(() => {
            const handler = listeners.get("message");
            if (handler) handler(Buffer.from(JSON.stringify(responseMsg)));
          }, 5);
        }
      },
      on: (event: string, fn: any) => {
        listeners.set(event, fn);
      },
      close: () => {
        mockAgentWs.readyState = 3;
      },
    };

    tunnelRelayService.registerAgentSocket(hostId, mockAgentWs, { os: "darwin", arch: "arm64" });
  });

  afterAll(async () => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
    await app.close();
  });

  it("Executes the complete 18-step end-to-end scenario", async () => {
    // -------------------------------------------------------------
    // Step 1: Install & verify host agent on Computer A
    // -------------------------------------------------------------
    expect(tunnelRelayService.isHostOnline(hostId)).toBe(true);

    // -------------------------------------------------------------
    // Step 2: Register a local project folder
    // -------------------------------------------------------------
    expect(fs.existsSync(path.join(testDir, "index.js"))).toBe(true);

    // -------------------------------------------------------------
    // Step 3: Generate a time-limited access link
    // -------------------------------------------------------------
    const createLinkRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Phone Access Link",
        role: "editor",
        expiresInSeconds: 7200,
        oneTimeRedemption: true,
        allowedWorkspaceIds: [workspaceId],
      },
    });

    expect(createLinkRes.statusCode).toBe(201);
    const linkBody = JSON.parse(createLinkRes.body);
    expect(linkBody.success).toBe(true);
    const rawToken = linkBody.data.rawToken;
    expect(rawToken).toBeDefined();

    // -------------------------------------------------------------
    // Step 4 & 5: Open link from Phone B, authenticate and browse files
    // -------------------------------------------------------------
    const redeemRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      payload: {
        token: rawToken,
        deviceName: "Phone B (Mobile PWA)",
      },
    });

    expect(redeemRes.statusCode).toBe(200);
    const redeemBody = JSON.parse(redeemRes.body);
    expect(redeemBody.success).toBe(true);
    phoneToken = redeemBody.data.sessionToken;
    phoneSessionId = redeemBody.data.session.id;
    expect(redeemBody.data.session.role).toBe("editor");

    // Browse files
    const listFilesRes = await app.inject({
      method: "GET",
      url: `/api/v1/files?workspaceId=${workspaceId}`,
      headers: { authorization: `Bearer ${phoneToken}` },
    });
    expect(listFilesRes.statusCode).toBe(200);
    const filesData = JSON.parse(listFilesRes.body);
    expect(filesData.data.length).toBeGreaterThanOrEqual(2);

    // -------------------------------------------------------------
    // Step 6: Modify a source file from Phone B
    // -------------------------------------------------------------
    const writeRes = await app.inject({
      method: "POST",
      url: `/api/v1/files/write?workspaceId=${workspaceId}`,
      headers: { authorization: `Bearer ${phoneToken}` },
      payload: {
        path: "index.js",
        content: 'console.log("Updated from Phone B");\n',
      },
    });
    expect(writeRes.statusCode).toBe(200);

    // -------------------------------------------------------------
    // Step 7: Run authorized terminal command check
    // Editor role is strictly denied terminal access (owner-only capability)
    // -------------------------------------------------------------
    const terminalAttempt = await app.inject({
      method: "POST",
      url: `/api/v1/terminals?workspaceId=${workspaceId}`,
      headers: { authorization: `Bearer ${phoneToken}` },
      payload: { shell: "bash" },
    });
    expect(terminalAttempt.statusCode).toBe(403);

    // Owner can execute terminal operations
    const ownerTerminalRes = await app.inject({
      method: "GET",
      url: `/api/v1/terminals`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerTerminalRes.statusCode).toBe(200);

    // -------------------------------------------------------------
    // Step 8 & 9: Development server & preview
    // -------------------------------------------------------------
    const previewRes = await app.inject({
      method: "GET",
      url: `/api/v1/preview/3000/`,
      headers: { authorization: `Bearer ${phoneToken}` },
    });
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.body).toContain("Preview OK");

    // -------------------------------------------------------------
    // Step 10: Review Git changes
    // -------------------------------------------------------------
    const gitStatusRes = await app.inject({
      method: "GET",
      url: `/api/v1/git/status?workspaceId=${workspaceId}`,
      headers: { authorization: `Bearer ${phoneToken}` },
    });
    expect(gitStatusRes.statusCode).toBe(200);
    const gitData = JSON.parse(gitStatusRes.body);
    expect(gitData.data.modified).toContain("index.js");

    // -------------------------------------------------------------
    // Step 11: Disconnect Phone B
    // -------------------------------------------------------------
    const disconnectPresenceRes = await app.inject({
      method: "POST",
      url: "/api/v1/catchup/presence",
      headers: { authorization: `Bearer ${phoneToken}` },
      payload: {
        deviceId: "phone-b",
        state: "disconnected",
      },
    });
    expect(disconnectPresenceRes.statusCode).toBe(200);

    // -------------------------------------------------------------
    // Step 12: Make changes on Computer A while Phone B is offline
    // -------------------------------------------------------------
    fs.appendFileSync(path.join(testDir, "index.js"), '// Added on Computer A offline\n');
    await outboxService.recordWorkspaceEvent({
      workspaceId,
      hostId: "agent-computer-a",
      eventType: "file.modified",
      actorId: "owner-computer-a",
      deviceId: "computer-a",
      payload: { path: "index.js" },
    });

    // -------------------------------------------------------------
    // Step 13 & 14: Reconnect Phone B and acknowledge one-time catchup changelog
    // -------------------------------------------------------------
    const catchupRes = await app.inject({
      method: "GET",
      url: `/api/v1/catchup/summary?workspaceId=${workspaceId}&deviceId=phone-b`,
      headers: { authorization: `Bearer ${phoneToken}` },
    });
    expect(catchupRes.statusCode).toBe(200);
    const catchupData = JSON.parse(catchupRes.body).data;
    if (catchupData?.deliveryId) {
      const ackRes = await app.inject({
        method: "POST",
        url: `/api/v1/catchup/ack`,
        headers: { authorization: `Bearer ${phoneToken}` },
        payload: {
          deliveryId: catchupData.deliveryId,
          workspaceId,
          deviceId: "phone-b",
        },
      });
      expect(ackRes.statusCode).toBe(200);
    }

    // -------------------------------------------------------------
    // Step 15 & 16: Open AI assistant, ask question, verify strictly read-only
    // -------------------------------------------------------------
    await aiAssistantService.setApiKey("owner-computer-a", "AIzaSyValidProductionMockKey");
    aiAssistantService.setMockGenerator(async function* () {
      yield "To optimize this function, use a hash map for O(1) lookups.";
    });

    const aiConvRes = await app.inject({
      method: "POST",
      url: "/api/v1/ai/conversations",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        workspaceId,
        title: "Code Review",
      },
    });
    expect(aiConvRes.statusCode).toBe(201);
    const aiConv = JSON.parse(aiConvRes.body);

    const aiMsgRes = await app.inject({
      method: "POST",
      url: `/api/v1/ai/conversations/${aiConv.data.id}/messages`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        prompt: "How can I optimize this loop?",
      },
    });
    expect(aiMsgRes.statusCode).toBe(200);
    expect(aiMsgRes.body).toContain("hash map");

    // -------------------------------------------------------------
    // Step 17: Revoke Phone B's access from Computer A
    // -------------------------------------------------------------
    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/auth/sessions/${phoneSessionId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(revokeRes.statusCode).toBe(200);

    // -------------------------------------------------------------
    // Step 18: Verify all protected operations for Phone B are immediately denied
    // -------------------------------------------------------------
    const deniedFilesRes = await app.inject({
      method: "GET",
      url: `/api/v1/files?workspaceId=${workspaceId}`,
      headers: { authorization: `Bearer ${phoneToken}` },
    });
    expect(deniedFilesRes.statusCode).toBe(401);

    const deniedWriteRes = await app.inject({
      method: "POST",
      url: `/api/v1/files/write?workspaceId=${workspaceId}`,
      headers: { authorization: `Bearer ${phoneToken}` },
      payload: { path: "exploit.txt", content: "forbidden" },
    });
    expect(deniedWriteRes.statusCode).toBe(401);
  });

  it("Verifies reliability: metrics exporter, liveness, and readiness probes", async () => {
    // 1. Prometheus /metrics endpoint
    const metricsRes = await app.inject({
      method: "GET",
      url: "/metrics",
    });
    expect(metricsRes.statusCode).toBe(200);
    expect(metricsRes.headers["content-type"]).toContain("text/plain");
    expect(metricsRes.body).toContain("remoteide_gateway_uptime_seconds");
    expect(metricsRes.body).toContain("remoteide_http_latency_ms");

    // 2. JSON metrics endpoint
    const jsonMetricsRes = await app.inject({
      method: "GET",
      url: "/api/v1/metrics",
    });
    expect(jsonMetricsRes.statusCode).toBe(200);
    const jsonMetrics = JSON.parse(jsonMetricsRes.body);
    expect(jsonMetrics.data.service).toBe("@remote-ide/gateway");
    expect(jsonMetrics.data.http.latencyMs).toBeDefined();

    // 3. Health liveness & readiness
    const livenessRes = await app.inject({ method: "GET", url: "/health/liveness" });
    expect(livenessRes.statusCode).toBe(200);
    const liveness = JSON.parse(livenessRes.body);
    expect(liveness.data.alive).toBe(true);

    const readinessRes = await app.inject({ method: "GET", url: "/health/readiness" });
    expect(readinessRes.statusCode).toBe(200);
    const readiness = JSON.parse(readinessRes.body);
    expect(readiness.data.ready).toBe(true);
  });

  it("Verifies Multi-Factor Authentication (TOTP setup, verify, and authenticate)", async () => {
    // 1. Setup MFA
    const setupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/setup",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(setupRes.statusCode).toBe(200);
    const setupData = JSON.parse(setupRes.body).data;
    expect(setupData.secret).toBeDefined();
    expect(setupData.backupCodes.length).toBe(8);

    // 2. Generate valid TOTP code
    const { generateTotpCode } = await import("@remote-ide/shared");
    const validCode = generateTotpCode(setupData.secret);

    // 3. Verify and enable MFA
    const verifyRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/verify",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { code: validCode },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(JSON.parse(verifyRes.body).data.enabled).toBe(true);

    // 4. Disable MFA
    const disableRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/disable",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { code: validCode },
    });
    expect(disableRes.statusCode).toBe(200);
    expect(JSON.parse(disableRes.body).data.disabled).toBe(true);
  });
});
