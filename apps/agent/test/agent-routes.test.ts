import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FastifyInstance } from "fastify";
import { buildAgentApp, AgentContext } from "../src/app.js";

describe("Agent HTTP API Routes Integration", () => {
  let tmpDir: string;
  let projectDir: string;
  let context: AgentContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteide-agent-routes-"));
    projectDir = path.join(tmpDir, "demo-project");
    fs.mkdirSync(projectDir);

    context = await buildAgentApp({
      logger: false,
      journalPath: ":memory:",
      dataDir: tmpDir,
    });
    app = context.app;
    await app.ready();
  });

  afterAll(async () => {
    context.watcherService.stopAll();
    await app.close();
    context.workspaceService.close();
    context.journal.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("GET /api/v1/ready returns ready status and hostId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ready",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.ready).toBe(true);
    expect(body.data.hostId).toBeDefined();
  });

  it("performs full workspace registration and file lifecycle via HTTP", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/register",
      payload: {
        name: "Demo Project",
        paths: [projectDir],
      },
    });

    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.success).toBe(true);
    const workspaceId = regBody.data.id;
    expect(workspaceId).toBeDefined();

    const writeRes = await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/${workspaceId}/files/write`,
      payload: {
        path: "hello.txt",
        content: "Hello from Agent HTTP API",
      },
    });

    expect(writeRes.statusCode).toBe(200);
    const writeBody = JSON.parse(writeRes.body);
    expect(writeBody.success).toBe(true);
    expect(writeBody.data.eTag).toBeDefined();

    expect(fs.readFileSync(path.join(projectDir, "hello.txt"), "utf-8")).toBe(
      "Hello from Agent HTTP API"
    );

    const readRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/files/read?path=hello.txt`,
    });

    expect(readRes.statusCode).toBe(200);
    const readBody = JSON.parse(readRes.body);
    expect(readBody.success).toBe(true);
    expect(readBody.data.content).toBe("Hello from Agent HTTP API");

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/files`,
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.success).toBe(true);
    expect(listBody.data.some((f: { name: string }) => f.name === "hello.txt")).toBe(true);

    const searchRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/files/search?query=Agent&type=content`,
    });

    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.success).toBe(true);
    expect(searchBody.data.results.length).toBeGreaterThan(0);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/workspaces/${workspaceId}/files?path=hello.txt`,
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(fs.existsSync(path.join(projectDir, "hello.txt"))).toBe(false);

    const journalRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/journal`,
    });

    expect(journalRes.statusCode).toBe(200);
    const journalBody = JSON.parse(journalRes.body);
    expect(journalBody.success).toBe(true);
    expect(journalBody.data.length).toBeGreaterThanOrEqual(2);
  });

  it("caps client-asserted collab roles at the tunneled session role", async () => {
    const collabDir = path.join(tmpDir, "collab-project");
    fs.mkdirSync(collabDir);
    fs.writeFileSync(path.join(collabDir, "notes.md"), "hello");
    const regRes = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/register",
      payload: { name: "Collab Project", paths: [collabDir] },
    });
    const workspaceId = JSON.parse(regRes.body).data.id;

    const viewerJoin = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/collab/join`,
      headers: { "x-remoteide-role": "viewer" },
      payload: { path: "notes.md", userId: "guest", role: "owner" },
    });
    expect(viewerJoin.statusCode).toBe(200);
    expect(JSON.parse(viewerJoin.body).data.participant.role).toBe("viewer");

    const developerJoin = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/collab/join`,
      headers: { "x-remoteide-role": "developer" },
      payload: { path: "notes.md", userId: "dev", role: "owner" },
    });
    expect(JSON.parse(developerJoin.body).data.participant.role).toBe("editor");

    const kickRes = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/collab/kick`,
      headers: { "x-remoteide-role": "developer" },
      payload: { path: "notes.md", kickerRole: "owner", targetUserId: "guest" },
    });
    expect(kickRes.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("proxies preview sub-paths to the forwarded loopback port", async () => {
    const http = await import("node:http");
    const upstream = http.createServer((req, res) => res.end(`upstream:${req.url}`));
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const port = (upstream.address() as { port: number }).port;
    try {
      context.portForwardingService.forwardPort({ port, label: "test", protocol: "http" });
      const res = await app.inject({ method: "GET", url: `/api/v1/preview/${port}/assets/app.js?v=1` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe("upstream:/assets/app.js?v=1");
    } finally {
      context.portForwardingService.unforwardPort(port);
      await new Promise((resolve) => upstream.close(resolve));
    }
  });
});
