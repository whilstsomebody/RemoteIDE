import { describe, it, expect, afterEach } from "vitest";
import { ProcessManagerService } from "../src/services/process-manager.service.js";

describe("Phase 5 - Host Agent Process Manager", () => {
  const service = new ProcessManagerService([process.cwd()]);

  afterEach(() => {
    service.shutdown();
  });

  it("masks sensitive environment variables", () => {
    const rawEnv = {
      NODE_ENV: "development",
      API_SECRET_KEY: "super-secret-token-12345",
      DATABASE_PASSWORD: "secret-password",
      PORT: "3000",
    };

    const masked = service.maskEnv(rawEnv);
    expect(masked["NODE_ENV"]).toBe("development");
    expect(masked["PORT"]).toBe("3000");
    expect(masked["API_SECRET_KEY"]).not.toBe("super-secret-token-12345");
    expect(masked["DATABASE_PASSWORD"]).toContain("••••••••");
  });

  it("starts, lists, and stops a managed process", async () => {
    const proc = await service.startProcess({
      workspaceId: "ws-1",
      name: "Long Running Worker",
      command: "node",
      args: ["-e", "setInterval(() => console.log('tick'), 100);"],
      cwd: process.cwd(),
      env: { TEST_VAR: "true" },
    });

    expect(proc.id).toBeDefined();
    expect(proc.status).toBe("running");
    expect(proc.pid).toBeGreaterThan(0);

    const list = await service.listProcesses("ws-1");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((p) => p.id === proc.id)).toBe(true);

    const stopped = await service.stopProcess(proc.id);
    expect(["stopped", "crashed"]).toContain(stopped.status);
  });
});
