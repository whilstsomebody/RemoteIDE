import { describe, it, expect, afterEach } from "vitest";
import { TerminalService } from "../src/services/terminal.service.js";
import { AppError } from "@remote-ide/shared";

describe("Phase 4 - Host Agent Interactive Terminal & PTY Service", () => {
  let service: TerminalService;

  afterEach(async () => {
    if (service) {
      await service.shutdownAll();
    }
  });

  it("detects available shells and tmux support on the host", () => {
    service = new TerminalService();
    const shells = service.getAvailableShells();
    expect(shells.length).toBeGreaterThan(0);
    expect(typeof service.isTmuxSupported()).toBe("boolean");
  });

  it("spawns an actual interactive PTY process and receives live output", async () => {
    service = new TerminalService();
    const session = await service.createTerminal(
      {
        cols: 80,
        rows: 24,
        useTmux: false,
      },
      "owner-123"
    );

    expect(session.id).toBeDefined();
    expect(session.status).toBe("running");
    expect(session.pid).toBeGreaterThan(0);

    let received = "";
    const { unsubscribe } = service.attach(session.id, (chunk) => {
      received += chunk;
    });

    service.writeTerminal(session.id, "echo REMOTE_IDE_PTY_OK\n");

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (received.includes("REMOTE_IDE_PTY_OK")) {
          clearInterval(check);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 5000);
    });

    unsubscribe();
    expect(received).toContain("REMOTE_IDE_PTY_OK");

    await service.closeTerminal(session.id);
  });

  it("replays output ring buffer upon reattachment so disconnects don't lose context", async () => {
    service = new TerminalService();
    const session = await service.createTerminal(
      {
        cols: 80,
        rows: 24,
        useTmux: false,
      },
      "owner-123"
    );

    service.writeTerminal(session.id, "echo PERSISTENT_REPLAY_TEST\n");

    await new Promise((resolve) => setTimeout(resolve, 600));

    const { replayBuffer, unsubscribe } = service.attach(session.id, () => {});
    unsubscribe();

    expect(replayBuffer).toContain("PERSISTENT_REPLAY_TEST");

    const current = service.getTerminal(session.id);
    expect(current.status).toBe("running");

    await service.closeTerminal(session.id);
  });

  it("resizes PTY window dimensions without crashing", async () => {
    service = new TerminalService();
    const session = await service.createTerminal(
      { cols: 80, rows: 24, useTmux: false },
      "owner-123"
    );

    service.resizeTerminal(session.id, 120, 40);
    const updated = service.getTerminal(session.id);
    expect(updated.cols).toBe(120);
    expect(updated.rows).toBe(40);

    await service.closeTerminal(session.id);
  });

  it("enforces concurrent PTY limit", async () => {
    service = new TerminalService({ maxConcurrentSessions: 2 });
    const s1 = await service.createTerminal({ cols: 80, rows: 24, useTmux: false }, "owner-123");
    const s2 = await service.createTerminal({ cols: 80, rows: 24, useTmux: false }, "owner-123");

    await expect(
      service.createTerminal({ cols: 80, rows: 24, useTmux: false }, "owner-123")
    ).rejects.toThrow(AppError);

    await service.closeTerminal(s1.id);
    await service.closeTerminal(s2.id);
  });

  it("terminates shell process cleanly on close", async () => {
    service = new TerminalService();
    const session = await service.createTerminal(
      { cols: 80, rows: 24, useTmux: false },
      "owner-123"
    );
    expect(service.listTerminals().length).toBe(1);

    await service.closeTerminal(session.id);
    expect(service.listTerminals().length).toBe(0);
    expect(() => service.getTerminal(session.id)).toThrow(AppError);
  });
});
