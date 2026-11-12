import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildAgentApp, AgentContext } from "../src/app.js";

describe("Agent Service & SQLite Journal", () => {
  let context: AgentContext;

  beforeAll(async () => {
    context = await buildAgentApp({ logger: false, journalPath: ":memory:" });
    await context.app.ready();
  });

  afterAll(async () => {
    context.watcherService.stopAll();
    await context.app.close();
    context.workspaceService.close();
    context.journal.close();
  });

  describe("HostLocalJournal", () => {
    it("records operations and retrieves recent entries", () => {
      context.journal.recordChange("ws-test", "package.json", "update", "v1", { bytes: 1024 });

      const entries = context.journal.getWorkspaceEntries("ws-test", 5);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      const latest = entries[0];
      expect(latest?.operationType).toBe("update");
      expect(latest?.relativePath).toBe("package.json");
      expect(latest?.metadata).toEqual({ bytes: 1024 });
    });

    it("reports healthy SQLite status", () => {
      const health = context.journal.checkHealth();
      expect(health.healthy).toBe(true);
    });
  });

  describe("Agent HTTP Endpoints", () => {
    it("GET /health returns healthy status including journal component", async () => {
      const res = await context.app.inject({
        method: "GET",
        url: "/health",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("healthy");
      expect(body.data.service).toBe("@remote-ide/agent");
      expect(body.data.components.journal.status).toBe("healthy");
    });

    it("GET /api/v1/capabilities returns structured host capabilities", async () => {
      const res = await context.app.inject({
        method: "GET",
        url: "/api/v1/capabilities",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.features.fileWatching).toBe(true);
      expect(body.data.limits.maxFileSizeMb).toBeGreaterThan(0);
      expect(body.data.os.platform).toBeDefined();
    });
  });
});
