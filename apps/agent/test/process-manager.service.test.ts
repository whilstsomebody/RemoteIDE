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
  it("preserves private environment on restart and does not kill the replacement process", async () => {
    const proc = await service.startProcess({ workspaceId: "ws-restart", name: "restart", command: process.execPath, args: ["-e", "console.log(process.env.RESTART_VALUE); setInterval(() => {}, 100);"], cwd: process.cwd(), env: { RESTART_VALUE: "retained" } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const restarted = await service.restartProcess(proc.id);
    expect(restarted.pid).not.toBe(proc.pid);
    await new Promise((resolve) => setTimeout(resolve, 3200));
    expect((await service.getProcess(proc.id)).status).toBe("running");
    expect(service.getLogs(proc.id).filter((line) => line.text.includes("retained")).length).toBeGreaterThanOrEqual(2);
    await service.stopProcess(proc.id);
  }, 10000);

});
