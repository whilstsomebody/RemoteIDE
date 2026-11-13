import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FilesystemService } from "../src/services/filesystem.service.js";
import { WorkspaceService } from "../src/services/workspace.service.js";
import { LocalJournalService } from "../src/services/local-journal.service.js";
import { ErrorCode } from "@remote-ide/shared";

describe("FilesystemService & Security", () => {
  let tmpDir: string;
  let workspaceDir: string;
  let outsideDir: string;
  let workspaceService: WorkspaceService;
  let journalService: LocalJournalService;
  let fsService: FilesystemService;
  let workspaceId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteide-fs-test-"));
    workspaceDir = path.join(tmpDir, "workspace");
    outsideDir = path.join(tmpDir, "outside");

    fs.mkdirSync(workspaceDir);
    fs.mkdirSync(outsideDir);

    workspaceService = new WorkspaceService(":memory:");
    journalService = new LocalJournalService(":memory:");
    fsService = new FilesystemService(workspaceService, journalService, {
      maxFileSizeMb: 1, // 1MB limit for tests
    });

    const ws = workspaceService.registerWorkspace("Test Project", [workspaceDir]);
    workspaceId = ws.id;
  });

  afterEach(() => {
    workspaceService.close();
    journalService.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("Directory listing & stat", () => {
    it("lists directory contents filtering ignored patterns", () => {
      fs.writeFileSync(path.join(workspaceDir, "index.ts"), "console.log('test');");
      fs.mkdirSync(path.join(workspaceDir, "src"));
      fs.writeFileSync(path.join(workspaceDir, "src", "util.ts"), "export const x = 1;");
      fs.mkdirSync(path.join(workspaceDir, "node_modules"));
      fs.writeFileSync(path.join(workspaceDir, "node_modules", "package.json"), "{}");

      const tree = fsService.listDirectory(workspaceId, "");
      const names = tree.map((n) => n.name);

      expect(names).toContain("src");
      expect(names).toContain("index.ts");
      expect(names).not.toContain("node_modules"); // filtered!
    });

    it("retrieves accurate file metadata and ETag", () => {
      const filePath = path.join(workspaceDir, "sample.txt");
      fs.writeFileSync(filePath, "Hello RemoteIDE");

      const stat = fsService.getFileStat(workspaceId, "sample.txt");
      expect(stat.name).toBe("sample.txt");
      expect(stat.size).toBe(15);
      expect(stat.isFile).toBe(true);
      expect(stat.isBinary).toBe(false);
      expect(stat.eTag).toBeDefined();
    });
  });

  describe("File CRUD & Atomic Writes", () => {
    it("creates, reads, and updates a file atomically", () => {
      // 1. Create and write
      const writeRes = fsService.writeFile(workspaceId, "src/app.ts", "const a = 10;");
      expect(writeRes.eTag).toBeDefined();
      expect(fs.existsSync(path.join(workspaceDir, "src", "app.ts"))).toBe(true);

      // 2. Read
      const readRes = fsService.readFile(workspaceId, "src/app.ts");
      expect(readRes.content).toBe("const a = 10;");
      expect(readRes.isBinary).toBe(false);

      // 3. Update with matching expectedETag
      const updateRes = fsService.writeFile(workspaceId, "src/app.ts", "const a = 20;", {
        expectedETag: writeRes.eTag,
      });
      expect(updateRes.eTag).not.toBe(writeRes.eTag);

      const updatedRead = fsService.readFile(workspaceId, "src/app.ts");
      expect(updatedRead.content).toBe("const a = 20;");
    });

    it("throws CONCURRENCY_CONFLICT on stale ETag during write", () => {
      const res1 = fsService.writeFile(workspaceId, "doc.txt", "Version 1");

      // External update modifies the file
      fs.writeFileSync(path.join(workspaceDir, "doc.txt"), "Version 1 Modified Out-of-band");

      // Attempt write with old ETag
      expect(() =>
        fsService.writeFile(workspaceId, "doc.txt", "Version 2", {
          expectedETag: res1.eTag,
        })
      ).toThrowError(
        expect.objectContaining({
          code: ErrorCode.CONCURRENCY_CONFLICT,
          statusCode: 409,
        })
      );
    });

    it("renames and moves files across subdirectories", () => {
      fsService.writeFile(workspaceId, "file-a.txt", "Move me");
      const moveRes = fsService.moveItem(workspaceId, "file-a.txt", "nested/file-b.txt");

      expect(moveRes.to).toBe("nested/file-b.txt");
      expect(fs.existsSync(path.join(workspaceDir, "file-a.txt"))).toBe(false);
      expect(fs.existsSync(path.join(workspaceDir, "nested", "file-b.txt"))).toBe(true);
    });

    it("deletes files and directories recursively", () => {
      fsService.writeFile(workspaceId, "to-delete/test.txt", "delete me");
      expect(fs.existsSync(path.join(workspaceDir, "to-delete", "test.txt"))).toBe(true);

      fsService.deleteItem(workspaceId, "to-delete", true);
      expect(fs.existsSync(path.join(workspaceDir, "to-delete"))).toBe(false);
    });

    it("prevents deleting workspace root directory", () => {
      expect(() => fsService.deleteItem(workspaceId, "")).toThrowError(
        expect.objectContaining({ code: ErrorCode.CANNOT_DELETE_ROOT })
      );
    });
  });

  describe("Security: Path Traversal & Symlink Attacks", () => {
    it("blocks path traversal attempts with ../", () => {
      expect(() => fsService.readFile(workspaceId, "../../outside/secret.txt")).toThrowError(
        expect.objectContaining({ code: ErrorCode.PATH_NOT_ALLOWED, statusCode: 403 })
      );

      expect(() => fsService.writeFile(workspaceId, "sub/../../escape.txt", "hacked")).toThrowError(
        expect.objectContaining({ code: ErrorCode.PATH_NOT_ALLOWED, statusCode: 403 })
      );
    });

    it("blocks symlink jail escapes pointing outside workspace root", () => {
      const secretFile = path.join(outsideDir, "secret.txt");
      fs.writeFileSync(secretFile, "Top Secret Data");

      // Create a symlink inside workspace pointing to outside target
      const maliciousSymlink = path.join(workspaceDir, "malicious_link");
      fs.symlinkSync(secretFile, maliciousSymlink);

      // Attempt to read through symlink must be rejected with SYMLINK_ESCAPE_DETECTED
      expect(() => fsService.readFile(workspaceId, "malicious_link")).toThrowError(
        expect.objectContaining({
          code: ErrorCode.SYMLINK_ESCAPE_DETECTED,
          statusCode: 403,
        })
      );
    });

    it("allows valid symlinks pointing within the workspace boundary", () => {
      const validTarget = path.join(workspaceDir, "actual.txt");
      fs.writeFileSync(validTarget, "Internal safe content");

      const validSymlink = path.join(workspaceDir, "safe_link.txt");
      fs.symlinkSync(validTarget, validSymlink);

      const read = fsService.readFile(workspaceId, "safe_link.txt");
      expect(read.content).toBe("Internal safe content");
    });
  });

  it("blocks writes and moves through an escaping ancestor with missing parents", () => {
    fs.symlinkSync(outsideDir, path.join(workspaceDir, "escape"));
    expect(() => fsService.writeFile(workspaceId, "escape/new/nested/file.txt", "unsafe")).toThrowError(expect.objectContaining({ code: ErrorCode.SYMLINK_ESCAPE_DETECTED }));
    expect(() => fsService.createItem(workspaceId, "escape/new/nested", "directory")).toThrow();
    fsService.writeFile(workspaceId, "source.txt", "safe");
    expect(() => fsService.moveItem(workspaceId, "source.txt", "escape/new/nested/file.txt")).toThrow();
    expect(fs.readdirSync(outsideDir)).toEqual([]);
  });

  it("uses the same ETag for read, stat and save and preserves executable permissions", () => {
    const filename = path.join(workspaceDir, "script.sh");
    fs.writeFileSync(filename, "echo old", { mode: 0o700 });
    const read = fsService.readFile(workspaceId, "script.sh");
    expect(fsService.getFileStat(workspaceId, "script.sh").eTag).toBe(read.eTag);
    const saved = fsService.writeFile(workspaceId, "script.sh", "echo new", { expectedETag: read.eTag });
    expect(fsService.getFileStat(workspaceId, "script.sh").eTag).toBe(saved.eTag);
    expect(fs.statSync(filename).mode & 0o777).toBe(0o700);
  });

  it("does not recreate a deleted file when saving a stale buffer", () => {
    const saved = fsService.writeFile(workspaceId, "file.txt", "old");
    fsService.deleteItem(workspaceId, "file.txt");
    expect(() => fsService.writeFile(workspaceId, "file.txt", "new", { expectedETag: saved.eTag })).toThrowError(expect.objectContaining({ code: ErrorCode.CONCURRENCY_CONFLICT }));
  });

  it("matches every consecutive line and filename in search", () => {
    fsService.writeFile(workspaceId, "match-a.txt", "match\nmatch\nmatch");
    fsService.writeFile(workspaceId, "match-b.txt", "match");
    expect(fsService.searchFiles(workspaceId, { query: "match", type: "content" }).totalMatches).toBe(4);
    expect(fsService.searchFiles(workspaceId, { query: "match", type: "filename" }).totalMatches).toBe(2);
  });

  it("keeps paths distinct across multiple workspace roots", () => {
    fs.writeFileSync(path.join(workspaceDir, "same.txt"), "first");
    fs.writeFileSync(path.join(outsideDir, "same.txt"), "second");
    const multi = workspaceService.registerWorkspace("Multi", [workspaceDir, outsideDir]);
    const tree = fsService.listDirectory(multi.id, "", 2);
    expect(tree.map((node) => node.path)).toEqual(["workspace", "outside"]);
    expect(tree[1]?.children?.[0]?.path).toBe("outside/same.txt");
    expect(fsService.readFile(multi.id, "outside/same.txt").content).toBe("second");
    expect(fsService.searchFiles(multi.id, { query: "same" }).results.map((item) => item.path)).toEqual(["workspace/same.txt", "outside/same.txt"]);
  });

  describe("Binary files and size limits", () => {
    it("identifies binary files containing null bytes", () => {
      const binaryPath = path.join(workspaceDir, "image.bin");
      const binaryBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]);
      fs.writeFileSync(binaryPath, binaryBuffer);

      const readRes = fsService.readFile(workspaceId, "image.bin");
      expect(readRes.isBinary).toBe(true);
      expect(readRes.encoding).toBe("base64");
    });

    it("rejects files exceeding maximum size limit", () => {
      const largePath = path.join(workspaceDir, "large.txt");
      // Write 2MB file (limit configured as 1MB)
      const largeBuffer = Buffer.alloc(2 * 1024 * 1024, "a");
      fs.writeFileSync(largePath, largeBuffer);

      expect(() => fsService.readFile(workspaceId, "large.txt")).toThrowError(
        expect.objectContaining({ code: ErrorCode.FILE_TOO_LARGE, statusCode: 413 })
      );
    });
  });

  describe("Search", () => {
    beforeEach(() => {
      fsService.writeFile(workspaceId, "src/main.ts", "function startEngine() {\n  return 42;\n}");
      fsService.writeFile(workspaceId, "src/config.ts", "export const engineName = 'V8';");
      fsService.writeFile(workspaceId, "docs/readme.md", "# Engine Documentation");
    });

    it("searches by filename", () => {
      const res = fsService.searchFiles(workspaceId, {
        query: "config",
        type: "filename",
      });
      expect(res.results.length).toBe(1);
      expect(res.results[0]?.path).toBe("src/config.ts");
    });

    it("searches text contents with line numbers and previews", () => {
      const res = fsService.searchFiles(workspaceId, {
        query: "startEngine",
        type: "content",
      });
      expect(res.results.length).toBe(1);
      expect(res.results[0]?.path).toBe("src/main.ts");
      expect(res.results[0]?.line).toBe(1);
      expect(res.results[0]?.preview).toContain("function startEngine");
    });
  });
});
