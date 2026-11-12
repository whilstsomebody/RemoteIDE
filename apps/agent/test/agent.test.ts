import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildAgentApp } from "../src/app.js";
import { FastifyInstance } from "fastify";
import { HostLocalJournal } from "../src/journal/sqlite-journal.js";

describe("Agent Service & SQLite Journal", () => {
  let app: FastifyInstance;
  let journal: HostLocalJournal;

  beforeAll(async () => {
    const res = await buildAgentApp({ logger: false, journalPath: ":memory:" });
    app = res.app;
    journal = res.journal;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    journal.close();
  });

  describe("HostLocalJournal", () => {
    it("records operations and retrieves recent entries", () => {
      journal.record({
        operation: "fs:read",
        target: "/workspace/package.json",
        status: "success",
        metadata: { bytes: 1024 },
      });

      const entries = journal.getRecentEntries(5);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      const latest = entries[0];
      expect(latest?.operation).toBe("fs:read");
      expect(latest?.target).toBe("/workspace/package.json");
      expect(latest?.status).toBe("success");
      expect(latest?.metadata).toEqual({ bytes: 1024 });
    });

    it("reports healthy SQLite status", () => {
      const health = journal.checkHealth();
      expect(health.healthy).toBe(true);
    });
  });

  describe("Agent HTTP Endpoints", () => {
    it("GET /health returns healthy status including journal component", async () => {
      const res = await app.inject({
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
      const res = await app.inject({
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
