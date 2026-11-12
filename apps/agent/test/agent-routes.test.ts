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
    // 1. Register workspace
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

    // 2. Write a file
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

    // Verify on disk directly
    expect(fs.readFileSync(path.join(projectDir, "hello.txt"), "utf-8")).toBe(
      "Hello from Agent HTTP API"
    );

    // 3. Read the file
    const readRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/files/read?path=hello.txt`,
    });

    expect(readRes.statusCode).toBe(200);
    const readBody = JSON.parse(readRes.body);
    expect(readBody.success).toBe(true);
    expect(readBody.data.content).toBe("Hello from Agent HTTP API");

    // 4. List directory files
    const listRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/files`,
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.success).toBe(true);
    expect(listBody.data.some((f: { name: string }) => f.name === "hello.txt")).toBe(true);

    // 5. Search files
    const searchRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/files/search?query=Agent&type=content`,
    });

    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.success).toBe(true);
    expect(searchBody.data.results.length).toBeGreaterThan(0);

    // 6. Delete file
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/workspaces/${workspaceId}/files?path=hello.txt`,
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(fs.existsSync(path.join(projectDir, "hello.txt"))).toBe(false);

    // 7. Check local change journal
    const journalRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/journal`,
    });

    expect(journalRes.statusCode).toBe(200);
    const journalBody = JSON.parse(journalRes.body);
    expect(journalBody.success).toBe(true);
    expect(journalBody.data.length).toBeGreaterThanOrEqual(2);
  });
});
