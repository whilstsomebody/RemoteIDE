import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  AppError,
  ErrorCode,
  FileNode,
  FileStat,
  ReadFileResponse,
  WriteFileResponse,
  SearchFilesResponse,
  SearchResultItem,
} from "@remote-ide/shared";
import { WorkspaceService } from "./workspace.service.js";
import { LocalJournalService } from "./local-journal.service.js";
import type { WatcherService } from "./watcher.service.js";

export interface FilesystemServiceOptions {
  maxFileSizeMb?: number;
  ignoredPatterns?: string[];
  watcherService?: WatcherService;
}

export class FilesystemService {
  private workspaceService: WorkspaceService;
  private journalService?: LocalJournalService;
  private watcherService?: WatcherService;
  private maxFileSizeBytes: number;
  private ignoredPatterns: Set<string>;

  constructor(
    workspaceService: WorkspaceService,
    journalService?: LocalJournalService,
    options?: FilesystemServiceOptions
  ) {
    this.workspaceService = workspaceService;
    this.journalService = journalService;
    this.watcherService = options?.watcherService;
    this.maxFileSizeBytes = (options?.maxFileSizeMb ?? 25) * 1024 * 1024;
    this.ignoredPatterns = new Set(
      options?.ignoredPatterns ?? [".git", "node_modules", ".DS_Store", "Thumbs.db", ".turbo"]
    );
  }

  /**
   * Resolves a client-supplied relative path against a workspace root and enforces strict boundary isolation.
   * Prevents path traversal and symlink jail escapes.
   */
  public resolveSafePath(
    workspaceId: string,
    relativePath: string = "",
    options: { allowMissing?: boolean } = {}
  ): { fullPath: string; canonicalRoot: string; relativeToFolder: string; folderName: string } {
    const workspace = this.workspaceService.getWorkspace(workspaceId);

    // Normalize relative path, reject null bytes
    if (relativePath.includes("\0")) {
      throw new AppError(ErrorCode.PATH_NOT_ALLOWED, "Invalid path: null byte detected");
    }

    const cleanRelative = path.normalize(relativePath).replace(/^(\/|\\)+/, "");

    // Pick first matching folder (for multi-root, folder prefix or first folder)
    let selectedFolder = workspace.folders[0];
    if (!selectedFolder) {
      throw new AppError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace has no folders registered");
    }

    let subPath = cleanRelative;
    // Check if the relative path starts with a folder name in a multi-root workspace
    if (workspace.folders.length > 1) {
      for (const folder of workspace.folders) {
        if (
          cleanRelative === folder.name ||
          cleanRelative.startsWith(`${folder.name}/`) ||
          cleanRelative.startsWith(`${folder.name}\\`)
        ) {
          selectedFolder = folder;
          subPath = cleanRelative.slice(folder.name.length).replace(/^(\/|\\)+/, "");
          break;
        }
      }
    }

    const canonicalRoot = fs.realpathSync(selectedFolder.path);
    const candidatePath = path.resolve(canonicalRoot, subPath);

    // 1. Path traversal check: Candidate must start with canonical root
    if (
      candidatePath !== canonicalRoot &&
      !candidatePath.startsWith(`${canonicalRoot}${path.sep}`)
    ) {
      throw new AppError(
        ErrorCode.PATH_NOT_ALLOWED,
        `Path traversal attempt detected outside workspace root: ${relativePath}`
      );
    }

    // 2. Symlink escape check for existing paths
    if (fs.existsSync(candidatePath)) {
      const canonicalCandidate = fs.realpathSync(candidatePath);
      if (
        canonicalCandidate !== canonicalRoot &&
        !canonicalCandidate.startsWith(`${canonicalRoot}${path.sep}`)
      ) {
        throw new AppError(
          ErrorCode.SYMLINK_ESCAPE_DETECTED,
          `Symlink target escapes workspace root: ${relativePath}`
        );
      }
      return {
        fullPath: candidatePath,
        canonicalRoot,
        relativeToFolder: subPath,
        folderName: selectedFolder.name,
      };
    }

    // 3. For new files that don't exist yet, verify parent directory's canonical resolution
    if (options.allowMissing) {
      const parentDir = path.dirname(candidatePath);
      if (fs.existsSync(parentDir)) {
        const canonicalParent = fs.realpathSync(parentDir);
        if (
          canonicalParent !== canonicalRoot &&
          !canonicalParent.startsWith(`${canonicalRoot}${path.sep}`)
        ) {
          throw new AppError(
            ErrorCode.SYMLINK_ESCAPE_DETECTED,
            `Parent directory symlink escapes workspace root: ${relativePath}`
          );
        }
      }
      return {
        fullPath: candidatePath,
        canonicalRoot,
        relativeToFolder: subPath,
        folderName: selectedFolder.name,
      };
    }

    throw new AppError(ErrorCode.FILE_NOT_FOUND, `File or directory not found: ${relativePath}`);
  }

  /**
   * Inspects buffer to determine if it contains binary data.
   */
  public isBinaryBuffer(buffer: Buffer): boolean {
    const checkLength = Math.min(buffer.length, 8192);
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Computes deterministic ETag for a file.
   */
  public computeETag(stat: fs.Stats, content?: Buffer): string {
    if (content) {
      const hash = crypto.createHash("sha1").update(content).digest("hex").slice(0, 16);
      return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}-${hash}"`;
    }
    return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  }

  /**
   * Lists directory contents as a file tree node.
   */
  public listDirectory(
    workspaceId: string,
    relativeDir: string = "",
    depth: number = 1
  ): FileNode[] {
    const { fullPath, canonicalRoot } = this.resolveSafePath(workspaceId, relativeDir);

    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      throw new AppError(ErrorCode.BAD_REQUEST, `Target is not a directory: ${relativeDir}`);
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (this.ignoredPatterns.has(entry.name)) {
        continue;
      }

      const itemFullPath = path.join(fullPath, entry.name);
      const itemRelative = path.relative(canonicalRoot, itemFullPath);

      try {
        const itemLstat = fs.lstatSync(itemFullPath);
        const isSymlink = itemLstat.isSymbolicLink();

        let isDirectory = entry.isDirectory();
        let size = itemLstat.size;
        let isBinary = false;

        if (isSymlink) {
          try {
            const realTarget = fs.realpathSync(itemFullPath);
            // Verify symlink does not escape
            if (
              realTarget !== canonicalRoot &&
              !realTarget.startsWith(`${canonicalRoot}${path.sep}`)
            ) {
              continue; // Skip dangerous symlinks
            }
            const targetStat = fs.statSync(realTarget);
            isDirectory = targetStat.isDirectory();
            size = targetStat.size;
          } catch {
            continue; // Broken symlink
          }
        }

        const node: FileNode = {
          name: entry.name,
          path: itemRelative,
          type: isDirectory ? "directory" : isSymlink ? "symlink" : "file",
          size: isDirectory ? undefined : size,
          mtime: itemLstat.mtime.toISOString(),
          isSymlink,
          isBinary,
        };

        if (isDirectory && depth > 1) {
          node.children = this.listDirectory(workspaceId, itemRelative, depth - 1);
        }

        nodes.push(node);
      } catch {
        // Skip inaccessible entries
      }
    }

    // Sort: directories first, then alphabetical
    return nodes.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Retrieves full file stat metadata and ETag.
   */
  public getFileStat(workspaceId: string, relativePath: string): FileStat {
    const { fullPath, relativeToFolder } = this.resolveSafePath(workspaceId, relativePath);
    const lstat = fs.lstatSync(fullPath);
    const isSymlink = lstat.isSymbolicLink();
    const stat = fs.statSync(fullPath);

    let isBinary = false;
    if (stat.isFile() && stat.size > 0) {
      const fd = fs.openSync(fullPath, "r");
      const buffer = Buffer.alloc(Math.min(stat.size, 1024));
      fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);
      isBinary = this.isBinaryBuffer(buffer);
    }

    return {
      path: relativeToFolder,
      name: path.basename(fullPath),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      ctime: stat.ctime.toISOString(),
      mode: stat.mode,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      isSymlink,
      isBinary,
      eTag: this.computeETag(stat),
    };
  }

  /**
   * Reads file contents with safety checks.
   */
  public readFile(
    workspaceId: string,
    relativePath: string,
    encoding: "utf-8" | "base64" = "utf-8"
  ): ReadFileResponse {
    const { fullPath, relativeToFolder } = this.resolveSafePath(workspaceId, relativePath);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      throw new AppError(ErrorCode.BAD_REQUEST, `Cannot read directory as file: ${relativePath}`);
    }

    if (stat.size > this.maxFileSizeBytes) {
      throw new AppError(
        ErrorCode.FILE_TOO_LARGE,
        `File size (${Math.round(stat.size / 1024 / 1024)}MB) exceeds limit (${Math.round(this.maxFileSizeBytes / 1024 / 1024)}MB)`
      );
    }

    const buffer = fs.readFileSync(fullPath);
    const isBinary = this.isBinaryBuffer(buffer);

    let content: string;
    let effectiveEncoding = encoding;

    if (isBinary && encoding === "utf-8") {
      content = buffer.toString("base64");
      effectiveEncoding = "base64";
    } else {
      content = buffer.toString(effectiveEncoding);
    }

    const eTag = this.computeETag(stat, buffer);

    return {
      path: relativeToFolder,
      content,
      encoding: effectiveEncoding,
      eTag,
      size: stat.size,
      isBinary,
      mtime: stat.mtime.toISOString(),
    };
  }

  /**
   * Performs an atomic file write with optional optimistic concurrency check.
   */
  public writeFile(
    workspaceId: string,
    relativePath: string,
    content: string,
    options: {
      encoding?: "utf-8" | "base64";
      expectedETag?: string;
      createParents?: boolean;
    } = {}
  ): WriteFileResponse {
    const { fullPath, relativeToFolder } = this.resolveSafePath(workspaceId, relativePath, {
      allowMissing: true,
    });

    const isExisting = fs.existsSync(fullPath);

    // Optimistic concurrency check
    if (isExisting) {
      const currentStat = fs.statSync(fullPath);
      if (currentStat.isDirectory()) {
        throw new AppError(
          ErrorCode.BAD_REQUEST,
          `Target is an existing directory: ${relativePath}`
        );
      }

      if (options.expectedETag) {
        const currentBuffer = fs.readFileSync(fullPath);
        const currentETag = this.computeETag(currentStat, currentBuffer);
        if (currentETag !== options.expectedETag) {
          throw new AppError(
            ErrorCode.CONCURRENCY_CONFLICT,
            `File has been modified on host (expected ${options.expectedETag}, found ${currentETag})`,
            { details: [{ expectedETag: options.expectedETag, currentETag }] }
          );
        }
      }
    }

    // Prepare buffer
    const encoding = options.encoding ?? "utf-8";
    const buffer = Buffer.from(content, encoding);

    if (buffer.length > this.maxFileSizeBytes) {
      throw new AppError(
        ErrorCode.FILE_TOO_LARGE,
        `Content size exceeds maximum allowed file size`
      );
    }

    // Ensure parent directories exist
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      if (options.createParents !== false) {
        fs.mkdirSync(parentDir, { recursive: true });
      } else {
        throw new AppError(
          ErrorCode.FILE_NOT_FOUND,
          `Parent directory does not exist for: ${relativePath}`
        );
      }
    }

    // Atomic write pattern: Write to temp file then rename atomically
    const tempFileName = `.${path.basename(fullPath)}.tmp.${crypto.randomUUID()}`;
    const tempFilePath = path.join(parentDir, tempFileName);

    const fd = fs.openSync(tempFilePath, "w", 0o644);
    fs.writeSync(fd, buffer, 0, buffer.length, 0);
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // Atomic rename
    fs.renameSync(tempFilePath, fullPath);

    // Suppress watcher echo loop
    if (this.watcherService) {
      this.watcherService.markInternalSave(workspaceId, relativeToFolder);
    }

    const newStat = fs.statSync(fullPath);
    const newETag = this.computeETag(newStat, buffer);

    // Record in local change journal
    if (this.journalService) {
      this.journalService.recordChange(
        workspaceId,
        relativeToFolder,
        isExisting ? "update" : "create",
        newETag,
        { size: newStat.size }
      );
    }

    return {
      path: relativeToFolder,
      size: newStat.size,
      eTag: newETag,
      mtime: newStat.mtime.toISOString(),
    };
  }

  /**
   * Creates a file or directory.
   */
  public createItem(
    workspaceId: string,
    relativePath: string,
    type: "file" | "directory",
    initialContent: string = ""
  ): { path: string } {
    const { fullPath, relativeToFolder } = this.resolveSafePath(workspaceId, relativePath, {
      allowMissing: true,
    });

    if (fs.existsSync(fullPath)) {
      throw new AppError(ErrorCode.FILE_ALREADY_EXISTS, `Target already exists: ${relativePath}`);
    }

    if (type === "directory") {
      if (this.watcherService) {
        this.watcherService.markInternalSave(workspaceId, relativeToFolder);
      }
      fs.mkdirSync(fullPath, { recursive: true });
      if (this.journalService) {
        this.journalService.recordChange(workspaceId, relativeToFolder, "create", undefined, {
          isDir: true,
        });
      }
    } else {
      this.writeFile(workspaceId, relativePath, initialContent);
    }

    return { path: relativeToFolder };
  }

  /**
   * Renames or moves a file/directory.
   */
  public moveItem(
    workspaceId: string,
    fromPath: string,
    toPath: string,
    overwrite: boolean = false
  ): { from: string; to: string } {
    const source = this.resolveSafePath(workspaceId, fromPath);
    const destination = this.resolveSafePath(workspaceId, toPath, { allowMissing: true });

    if (fs.existsSync(destination.fullPath) && !overwrite) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `Destination path already exists and overwrite is false: ${toPath}`
      );
    }

    const parentDir = path.dirname(destination.fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.renameSync(source.fullPath, destination.fullPath);

    if (this.watcherService) {
      this.watcherService.markInternalSave(workspaceId, source.relativeToFolder);
      this.watcherService.markInternalSave(workspaceId, destination.relativeToFolder);
    }

    if (this.journalService) {
      this.journalService.recordChange(
        workspaceId,
        destination.relativeToFolder,
        "rename",
        undefined,
        {
          previousPath: source.relativeToFolder,
        }
      );
    }

    return { from: source.relativeToFolder, to: destination.relativeToFolder };
  }

  /**
   * Deletes a file or directory with recursive authorization.
   */
  public deleteItem(
    workspaceId: string,
    relativePath: string,
    recursive: boolean = false
  ): { path: string } {
    const { fullPath, canonicalRoot, relativeToFolder } = this.resolveSafePath(
      workspaceId,
      relativePath
    );

    if (fullPath === canonicalRoot) {
      throw new AppError(ErrorCode.CANNOT_DELETE_ROOT, "Cannot delete the root of a workspace");
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!recursive) {
        const contents = fs.readdirSync(fullPath);
        if (contents.length > 0) {
          throw new AppError(
            ErrorCode.BAD_REQUEST,
            `Directory is not empty; pass recursive: true to delete: ${relativePath}`
          );
        }
      }
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }

    if (this.watcherService) {
      this.watcherService.markInternalSave(workspaceId, relativeToFolder);
    }

    if (this.journalService) {
      this.journalService.recordChange(workspaceId, relativeToFolder, "delete");
    }

    return { path: relativeToFolder };
  }

  /**
   * Searches filenames and text contents inside the workspace.
   */
  public searchFiles(
    workspaceId: string,
    options: {
      query: string;
      type?: "filename" | "content";
      isRegex?: boolean;
      caseSensitive?: boolean;
      maxResults?: number;
    }
  ): SearchFilesResponse {
    const workspace = this.workspaceService.getWorkspace(workspaceId);
    const maxResults = options.maxResults ?? 50;
    const type = options.type ?? "filename";
    const results: SearchResultItem[] = [];

    let regex: RegExp;
    try {
      const flags = options.caseSensitive ? "g" : "gi";
      regex = options.isRegex
        ? new RegExp(options.query, flags)
        : new RegExp(options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    } catch {
      throw new AppError(ErrorCode.BAD_REQUEST, `Invalid regex search pattern: ${options.query}`);
    }

    for (const folder of workspace.folders) {
      const canonicalRoot = fs.realpathSync(folder.path);

      const searchDir = (currentDir: string) => {
        if (results.length >= maxResults) return;

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxResults) return;
          if (this.ignoredPatterns.has(entry.name)) continue;

          const itemPath = path.join(currentDir, entry.name);
          const relativePath = path.relative(canonicalRoot, itemPath);

          if (entry.isDirectory()) {
            searchDir(itemPath);
          } else if (entry.isFile()) {
            if (type === "filename") {
              if (regex.test(entry.name)) {
                results.push({
                  path: relativePath,
                  match: entry.name,
                });
              }
            } else if (type === "content") {
              try {
                const stat = fs.statSync(itemPath);
                // Skip files > 5MB for text content search
                if (stat.size > 5 * 1024 * 1024) continue;

                const buffer = fs.readFileSync(itemPath);
                if (this.isBinaryBuffer(buffer)) continue;

                const text = buffer.toString("utf-8");
                const lines = text.split("\n");
                for (let i = 0; i < lines.length; i++) {
                  if (results.length >= maxResults) break;
                  const line = lines[i]!;
                  if (regex.test(line)) {
                    results.push({
                      path: relativePath,
                      line: i + 1,
                      match: options.query,
                      preview: line.trim().slice(0, 140),
                    });
                  }
                }
              } catch {
                // Ignore read errors during search
              }
            }
          }
        }
      };

      searchDir(canonicalRoot);
    }

    return {
      query: options.query,
      totalMatches: results.length,
      results,
    };
  }
}
