import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WorkspaceService } from "../src/services/workspace.service.js";

describe("WorkspaceService", () => {
  let tmpDir: string;
  let workspaceService: WorkspaceService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteide-ws-test-"));
    workspaceService = new WorkspaceService(":memory:");
  });

  afterEach(() => {
    workspaceService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers a valid local directory as workspace", () => {
    const projectDir = path.join(tmpDir, "my-app");
    fs.mkdirSync(projectDir);

    const ws = workspaceService.registerWorkspace("My App", [projectDir]);
    expect(ws.id.startsWith("ws_")).toBe(true);
    expect(ws.name).toBe("My App");
    expect(ws.folders.length).toBe(1);
    expect(ws.folders[0]?.path).toBe(fs.realpathSync(projectDir));
    expect(ws.isActive).toBe(true);
  });

  it("supports multi-root workspaces", () => {
    const dirA = path.join(tmpDir, "frontend");
    const dirB = path.join(tmpDir, "backend");
    fs.mkdirSync(dirA);
    fs.mkdirSync(dirB);

    const ws = workspaceService.registerWorkspace("Fullstack App", [dirA, dirB]);
    expect(ws.folders.length).toBe(2);
    expect(ws.folders[0]?.name).toBe("frontend");
    expect(ws.folders[1]?.name).toBe("backend");
  });

  it("rejects non-existent directory path", () => {
    const fakePath = path.join(tmpDir, "does-not-exist");
    expect(() => workspaceService.registerWorkspace("Fake", [fakePath])).toThrowError();
  });

  it("rejects file path instead of directory", () => {
    const filePath = path.join(tmpDir, "file.txt");
    fs.writeFileSync(filePath, "hello");

    expect(() => workspaceService.registerWorkspace("Not A Dir", [filePath])).toThrowError();
  });

  it("lists, switches, and removes workspaces without deleting host files", () => {
    const dirA = path.join(tmpDir, "proj-a");
    const dirB = path.join(tmpDir, "proj-b");
    fs.mkdirSync(dirA);
    fs.mkdirSync(dirB);

    workspaceService.registerWorkspace("Project A", [dirA]);
    const wsB = workspaceService.registerWorkspace("Project B", [dirB]);

    const list = workspaceService.listWorkspaces();
    expect(list.length).toBe(2);

    // Switch active
    workspaceService.setActiveWorkspace(wsB.id);
    const active = workspaceService.getActiveWorkspace();
    expect(active?.id).toBe(wsB.id);

    // Remove workspace from RemoteIDE
    workspaceService.removeWorkspace(wsB.id);
    expect(workspaceService.listWorkspaces().length).toBe(1);

    // Verify folder on host disk is completely untouched!
    expect(fs.existsSync(dirB)).toBe(true);
  });
  it("enforces configured project roots after resolving symlinks", () => {
    const allowed = path.join(tmpDir, "allowed");
    const outside = path.join(tmpDir, "outside");
    fs.mkdirSync(allowed);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(allowed, "escape"));
    const restricted = new WorkspaceService(":memory:", [allowed]);
    try {
      expect(() => restricted.registerWorkspace("Outside", [outside])).toThrow(
        "outside configured project roots"
      );
      expect(() => restricted.registerWorkspace("Escape", [path.join(allowed, "escape")])).toThrow(
        "outside configured project roots"
      );
      expect(restricted.registerWorkspace("Allowed", [allowed]).folders).toHaveLength(1);
    } finally {
      restricted.close();
    }
  });

  it("refuses to register the filesystem root or the home directory", () => {
    expect(() => workspaceService.registerWorkspace("Root", [path.parse(tmpDir).root])).toThrow(
      "cannot be registered"
    );
    expect(() => workspaceService.registerWorkspace("Home", [os.homedir()])).toThrow(
      "cannot be registered"
    );
  });
});
