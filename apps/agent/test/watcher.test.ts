import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WatcherService } from "../src/services/watcher.service.js";
import { LocalJournalService } from "../src/services/local-journal.service.js";
import { Workspace } from "@remote-ide/shared";

describe("WatcherService", () => {
  let tmpDir: string;
  let workspaceDir: string;
  let journal: LocalJournalService;
  let watcher: WatcherService;
  let workspace: Workspace;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteide-watch-test-"));
    workspaceDir = path.join(tmpDir, "watched-project");
    fs.mkdirSync(workspaceDir);

    journal = new LocalJournalService(":memory:");
    watcher = new WatcherService(journal);

    workspace = {
      id: "ws-watch-1",
      name: "Watch Test",
      folders: [{ id: "fld-1", name: "root", path: workspaceDir }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
    };

    watcher.watchWorkspace(workspace);
  });

  afterEach(() => {
    watcher.stopAll();
    journal.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects external file modifications and logs to SQLite journal", async () => {
    const filePath = path.join(workspaceDir, "external.txt");

    const eventPromise = new Promise<{
      relativePath: string;
      eventType: string;
    }>((resolve) => {
      watcher.subscribe((ev) => {
        if (ev.relativePath.includes("external.txt")) {
          resolve(ev);
        }
      });
    });

    // Small delay to ensure macOS FSEvents stream is actively registered
    await new Promise((r) => setTimeout(r, 150));

    fs.writeFileSync(filePath, "Edited by vim directly on host");

    const event = await Promise.race([
      eventPromise,
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Watcher timeout")), 8000)
      ),
    ]);

    expect(event).toBeDefined();
    expect(event?.relativePath).toContain("external.txt");

    const entries = journal.getWorkspaceEntries("ws-watch-1");
    expect(entries.length).toBeGreaterThanOrEqual(1);
  }, 12000);
});
