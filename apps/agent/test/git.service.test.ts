import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { GitService } from "../src/services/git.service.js";
import { AppError } from "@remote-ide/shared";

describe("Phase 5 - Host Agent Git Service", () => {
  let tmpDir: string;
  let service: GitService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-test-"));
    service = new GitService([tmpDir]);

    // Initialize real git repo in tmpDir
    execFileSync("git", ["init", "-b", "main"], { cwd: tmpDir });
    execFileSync("git", ["config", "user.name", "Test User"], { cwd: tmpDir });
    execFileSync("git", ["config", "user.email", "test@remoteide.local"], { cwd: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports empty/untracked status for a fresh repository", async () => {
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test Repo\n");
    const status = await service.getStatus(tmpDir);

    expect(status.branch).toBe("main");
    expect(status.isClean).toBe(false);
    expect(status.untracked).toContain("README.md");
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged).toHaveLength(0);
  });

  it("stages files and creates a real commit", async () => {
    fs.writeFileSync(path.join(tmpDir, "hello.txt"), "Hello RemoteIDE\n");
    await service.stage(tmpDir, ["hello.txt"]);

    let status = await service.getStatus(tmpDir);
    expect(status.staged).toHaveLength(1);
    expect(status.staged[0]?.path).toBe("hello.txt");
    expect(status.staged[0]?.status).toBe("added");

    const commit = await service.commit(tmpDir, "Initial test commit");
    expect(commit.message).toBe("Initial test commit");
    expect(commit.hash).toHaveLength(40);
    expect(commit.shortHash).toHaveLength(7);

    status = await service.getStatus(tmpDir);
    expect(status.isClean).toBe(true);
    expect(status.staged).toHaveLength(0);
  });

  it("produces unified diffs for modified tracked files", async () => {
    const filePath = path.join(tmpDir, "code.ts");
    fs.writeFileSync(filePath, "const x = 1;\n");
    await service.stage(tmpDir, ["code.ts"]);
    await service.commit(tmpDir, "Add code.ts");

    // Modify file
    fs.writeFileSync(filePath, "const x = 2;\nconst y = 3;\n");
    const diffs = await service.getDiff(tmpDir, "code.ts", false);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.file).toBe("code.ts");
    expect(diffs[0]?.hunks.length).toBeGreaterThan(0);
  });

  it("requires explicit confirmation for destructive discard", async () => {
    fs.writeFileSync(path.join(tmpDir, "safe.txt"), "original\n");
    await service.stage(tmpDir, ["safe.txt"]);
    await service.commit(tmpDir, "first commit");

    fs.writeFileSync(path.join(tmpDir, "safe.txt"), "modified\n");

    // Rejection without confirmed: true
    await expect(service.discard(tmpDir, ["safe.txt"], false)).rejects.toThrow(AppError);

    // Success with confirmed: true
    await service.discard(tmpDir, ["safe.txt"], true);
    const content = fs.readFileSync(path.join(tmpDir, "safe.txt"), "utf-8");
    expect(content).toBe("original\n");
  });

  it("lists commit history accurately", async () => {
    fs.writeFileSync(path.join(tmpDir, "v1.txt"), "1\n");
    await service.stage(tmpDir, ["v1.txt"]);
    await service.commit(tmpDir, "Commit 1");

    fs.writeFileSync(path.join(tmpDir, "v2.txt"), "2\n");
    await service.stage(tmpDir, ["v2.txt"]);
    await service.commit(tmpDir, "Commit 2");

    const history = await service.getHistory(tmpDir, 10);
    expect(history.length).toBe(2);
    expect(history[0]?.message).toBe("Commit 2");
    expect(history[1]?.message).toBe("Commit 1");
  });
  it("parses branch names and rejects branch/remote option injection", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "a");
    await service.stage(tmpDir, ["a.txt"]);
    await service.commit(tmpDir, "initial");
    expect(await service.getBranches(tmpDir)).toContainEqual(expect.objectContaining({ name: "main", current: true }));
    await expect(service.checkout(tmpDir, "--detach")).rejects.toThrow("command options");
    await expect(service.push(tmpDir, "--all")).rejects.toThrow("command options");
  });


  it("treats checkout targets as refs and rejects push refspecs", async () => {
    fs.writeFileSync(path.join(tmpDir, "notes"), "committed\n");
    await service.stage(tmpDir, ["notes"]);
    await service.commit(tmpDir, "add notes");
    fs.writeFileSync(path.join(tmpDir, "notes"), "uncommitted work\n");

    await expect(service.checkout(tmpDir, "notes")).rejects.toThrow(AppError);
    expect(fs.readFileSync(path.join(tmpDir, "notes"), "utf-8")).toBe("uncommitted work\n");

    await expect(service.push(tmpDir, "origin", "+main")).rejects.toThrow("refspecs");
    await expect(service.push(tmpDir, "origin", ":main")).rejects.toThrow("refspecs");
  });

  it("parses branch names containing dots with an upstream", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "a\n");
    await service.stage(tmpDir, ["a.txt"]);
    await service.commit(tmpDir, "init");
    execFileSync("git", ["checkout", "-b", "release-1.0"], { cwd: tmpDir });
    execFileSync("git", ["config", "branch.release-1.0.remote", "."], { cwd: tmpDir });
    execFileSync("git", ["config", "branch.release-1.0.merge", "refs/heads/main"], { cwd: tmpDir });

    const status = await service.getStatus(tmpDir);
    expect(status.branch).toBe("release-1.0");
    expect(status.tracking).toBe("main");
  });
});
