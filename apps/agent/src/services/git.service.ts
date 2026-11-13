import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import {
  AppError,
  ErrorCode,
  GitStatus,
  GitFileChange,
  GitCommit,
  GitBranch,
  GitDiffFile,
  GitDiffHunk,
  GitBlameLine,
  GitStashEntry,
  logger,
} from "@remote-ide/shared";

const execFileAsync = promisify(execFile);

export class GitService {
  constructor(private readonly allowedPaths: string[] = []) {}

  /**
   * Validate that the repo path exists and is within allowed workspace roots.
   */
  public validateRepoPath(repoPath: string): string {
    const resolved = path.resolve(repoPath);
    if (!fs.existsSync(resolved)) {
      throw new AppError(ErrorCode.NOT_FOUND, `Repository path does not exist: ${resolved}`);
    }

    if (this.allowedPaths.length > 0) {
      const isAllowed = this.allowedPaths.some(
        (allowed) => resolved === allowed || resolved.startsWith(allowed + path.sep)
      );
      if (!isAllowed) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          `Repository path is outside allowed workspace paths: ${resolved}`
        );
      }
    }

    return resolved;
  }

  /**
   * Run git command using structured arguments only.
   */
  private async runGit(
    repoPath: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    const cwd = this.validateRepoPath(repoPath);
    try {
      return await execFileAsync("git", args, {
        cwd,
        env: {
          ...process.env,
          LC_ALL: "C", // Ensure deterministic output across locales
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
    } catch (err: unknown) {
      const e = err as {
        code?: number | string;
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      logger.warn({ args, stderr: e.stderr, code: e.code }, "Git execution error");
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        e.stderr?.trim() || e.message || "Git command failed",
        { details: [{ field: "args", issue: e.stderr || e.message }] }
      );
    }
  }

  /**
   * Get detailed repository status.
   */
  public async getStatus(repoPath: string): Promise<GitStatus> {
    const { stdout } = await this.runGit(repoPath, ["status", "--porcelain=v1", "-b", "-uall"]);

    const lines = stdout.split("\n").filter((line) => line.length > 0);
    let branch = "HEAD (detached)";
    let tracking: string | undefined;
    let ahead = 0;
    let behind = 0;

    const staged: GitFileChange[] = [];
    const unstaged: GitFileChange[] = [];
    const untracked: string[] = [];
    const conflicts: string[] = [];

    for (const line of lines) {
      if (line.startsWith("## ")) {
        // Parse header e.g. "## main...origin/main [ahead 1, behind 2]" or "## No commits yet on main"
        const header = line.substring(3).trim();
        const initialMatch = header.match(/(?:No commits yet on|Initial commit on)\s+([^\s]+)/i);
        if (initialMatch && initialMatch[1]) {
          branch = initialMatch[1];
          continue;
        }

        const branchMatch = header.match(/^([^\s.]+)(?:\.\.\.([^\s]+))?(?:\s+\[(.*)\])?$/);
        if (branchMatch && branchMatch[1]) {
          branch = branchMatch[1];
          tracking = branchMatch[2];
          const syncInfo = branchMatch[3] || "";
          const aheadMatch = syncInfo.match(/ahead\s+(\d+)/);
          const behindMatch = syncInfo.match(/behind\s+(\d+)/);
          if (aheadMatch && aheadMatch[1]) ahead = parseInt(aheadMatch[1], 10);
          if (behindMatch && behindMatch[1]) behind = parseInt(behindMatch[1], 10);
        } else {
          branch = header;
        }
        continue;
      }

      if (line.length < 3) continue;
      const x = line[0];
      const y = line[1];
      const filePath = line.substring(3).trim();

      // Check for conflicts
      const isConflict =
        (x === "U" && y === "U") ||
        (x === "A" && y === "A") ||
        (x === "D" && y === "D") ||
        x === "U" ||
        y === "U";

      if (isConflict) {
        conflicts.push(filePath);
        unstaged.push({ path: filePath, status: "conflicted", staged: false });
        continue;
      }

      // Untracked
      if (x === "?" && y === "?") {
        untracked.push(filePath);
        continue;
      }

      // Staged changes (column X)
      if (x !== " " && x !== "?") {
        let status: GitFileChange["status"] = "modified";
        if (x === "A") status = "added";
        else if (x === "D") status = "deleted";
        else if (x === "R") status = "renamed";
        else if (x === "C") status = "copied";

        staged.push({ path: filePath, status, staged: true });
      }

      // Unstaged changes (column Y)
      if (y !== " " && y !== "?") {
        let status: GitFileChange["status"] = "modified";
        if (y === "D") status = "deleted";

        unstaged.push({ path: filePath, status, staged: false });
      }
    }

    const isClean =
      staged.length === 0 &&
      unstaged.length === 0 &&
      untracked.length === 0 &&
      conflicts.length === 0;

    return {
      branch,
      tracking,
      ahead,
      behind,
      isClean,
      staged,
      unstaged,
      untracked,
      conflicts,
    };
  }

  /**
   * Stage specific files or all changes.
   */
  public async stage(repoPath: string, paths?: string[], all = false): Promise<void> {
    if (all || !paths || paths.length === 0) {
      await this.runGit(repoPath, ["add", "-A"]);
    } else {
      await this.runGit(repoPath, ["add", "--", ...paths]);
    }
  }

  /**
   * Unstage specific files or all staged changes.
   */
  public async unstage(repoPath: string, paths?: string[], all = false): Promise<void> {
    if (all || !paths || paths.length === 0) {
      await this.runGit(repoPath, ["reset", "HEAD"]);
    } else {
      await this.runGit(repoPath, ["restore", "--staged", "--", ...paths]);
    }
  }

  /**
   * Discard changes (destructive operation requiring confirmation).
   */
  public async discard(repoPath: string, paths: string[], confirmed: boolean): Promise<void> {
    if (!confirmed) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        "Explicit confirmation is required to discard changes."
      );
    }
    if (paths.length === 0) return;

    // Discard tracked changes
    try {
      await this.runGit(repoPath, ["restore", "--", ...paths]);
    } catch {
      // Some paths might be untracked
    }

    // Clean untracked files
    try {
      await this.runGit(repoPath, ["clean", "-f", "--", ...paths]);
    } catch {
      // Ignored
    }
  }

  /**
   * Commit staged changes.
   */
  public async commit(repoPath: string, message: string, amend = false): Promise<GitCommit> {
    if (!message || message.trim().length === 0) {
      throw new AppError(ErrorCode.BAD_REQUEST, "Commit message cannot be empty.");
    }

    const args = ["commit", "-m", message];
    if (amend) args.push("--amend");

    await this.runGit(repoPath, args);

    // Fetch the newly created commit
    const { stdout } = await this.runGit(repoPath, [
      "log",
      "-1",
      "--pretty=format:%H%x00%h%x00%an%x00%ae%x00%aI%x00%s",
    ]);

    const [hash = "", shortHash = "", author = "", email = "", date = "", msg = ""] =
      stdout.split("\0");
    return {
      hash,
      shortHash,
      author,
      email,
      date,
      message: msg,
    };
  }

  /**
   * Get file or hunk diffs.
   */
  public async getDiff(repoPath: string, file?: string, staged = false): Promise<GitDiffFile[]> {
    const args = ["diff"];
    if (staged) args.push("--cached");
    if (file) args.push("--", file);

    const { stdout } = await this.runGit(repoPath, args);
    return this.parseDiffOutput(stdout, staged);
  }

  private parseDiffOutput(diffText: string, staged: boolean): GitDiffFile[] {
    const files: GitDiffFile[] = [];
    if (!diffText.trim()) return files;

    const fileBlocks = diffText.split(/^diff --git /m).filter(Boolean);

    for (const block of fileBlocks) {
      const lines = block.split("\n");
      const headerLine = lines[0] || "";
      const match = headerLine.match(/a\/(.+?)\s+b\/(.+)/);
      const filePath = match ? match[2] : "unknown";

      const hunks: GitDiffHunk[] = [];
      let currentHunk: GitDiffHunk | null = null;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        if (line.startsWith("@@")) {
          // Hunk header: @@ -1,5 +1,6 @@ optional header
          const hunkMatch = line.match(/@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)/);
          if (hunkMatch && hunkMatch[1] && hunkMatch[3]) {
            currentHunk = {
              oldStart: parseInt(hunkMatch[1], 10),
              oldLines: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
              newStart: parseInt(hunkMatch[3], 10),
              newLines: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
              header: line,
              lines: [],
            };
            hunks.push(currentHunk);
          }
        } else if (currentHunk) {
          currentHunk.lines.push(line);
        }
      }

      files.push({
        file: filePath || "unknown",
        staged,
        diff: block,
        hunks,
      });
    }

    return files;
  }

  /**
   * Get commit history.
   */
  public async getHistory(repoPath: string, maxCount = 50): Promise<GitCommit[]> {
    const { stdout } = await this.runGit(repoPath, [
      "log",
      `-n${Math.min(maxCount, 100)}`,
      "--pretty=format:%H%x00%h%x00%an%x00%ae%x00%aI%x00%s",
    ]);

    if (!stdout.trim()) return [];

    return stdout
      .split("\n")
      .filter((line) => line.includes("\0"))
      .map((line) => {
        const [hash = "", shortHash = "", author = "", email = "", date = "", message = ""] =
          line.split("\0");
        return {
          hash,
          shortHash,
          author,
          email,
          date,
          message,
        };
      });
  }

  /**
   * Get list of local and remote branches.
   */
  public async getBranches(repoPath: string): Promise<GitBranch[]> {
    const { stdout } = await this.runGit(repoPath, [
      "branch",
      "-a",
      "--format=%(refname:short)%x00%(HEAD)%x00%(upstream:short)",
    ]);

    if (!stdout.trim()) return [];

    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name = "", head = "", upstream = ""] = line.split("\0");
        return {
          name,
          current: head === "*",
          remote: name.startsWith("remotes/") || name.startsWith("origin/"),
          upstream: upstream || undefined,
        };
      });
  }

  /**
   * Switch or create branch.
   */
  public async checkout(repoPath: string, branch: string, createNew = false): Promise<void> {
    const args = ["checkout"];
    if (createNew) args.push("-b");
    args.push(branch);
    await this.runGit(repoPath, args);
  }

  /**
   * Delete branch (destructive operation requiring confirmation).
   */
  public async deleteBranch(
    repoPath: string,
    branch: string,
    force = false,
    confirmed = false
  ): Promise<void> {
    if (!confirmed) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        "Explicit confirmation is required to delete a branch."
      );
    }
    const flag = force ? "-D" : "-d";
    await this.runGit(repoPath, ["branch", flag, branch]);
  }

  /**
   * Fetch from remote.
   */
  public async fetch(repoPath: string, remote = "origin"): Promise<void> {
    await this.runGit(repoPath, ["fetch", remote]);
  }

  /**
   * Pull changes.
   */
  public async pull(repoPath: string, remote = "origin", branch?: string): Promise<void> {
    const args = ["pull", remote];
    if (branch) args.push(branch);
    await this.runGit(repoPath, args);
  }

  /**
   * Push changes (force-push requires explicit confirmation).
   */
  public async push(
    repoPath: string,
    remote = "origin",
    branch?: string,
    force = false,
    confirmed = false
  ): Promise<void> {
    if (force && !confirmed) {
      throw new AppError(ErrorCode.BAD_REQUEST, "Explicit confirmation is required to force-push.");
    }

    const args = ["push"];
    if (force) args.push("--force");
    args.push(remote);
    if (branch) args.push(branch);

    await this.runGit(repoPath, args);
  }

  /**
   * Git stash operations.
   */
  public async stash(
    repoPath: string,
    action: "push" | "pop" | "drop" | "list",
    message?: string,
    index?: number
  ): Promise<GitStashEntry[]> {
    if (action === "push") {
      const args = ["stash", "push"];
      if (message) args.push("-m", message);
      await this.runGit(repoPath, args);
    } else if (action === "pop") {
      const args = ["stash", "pop"];
      if (typeof index === "number") args.push(`stash@{${index}}`);
      await this.runGit(repoPath, args);
    } else if (action === "drop") {
      const args = ["stash", "drop"];
      if (typeof index === "number") args.push(`stash@{${index}}`);
      await this.runGit(repoPath, args);
    }

    // Always return updated stash list
    const { stdout } = await this.runGit(repoPath, [
      "stash",
      "list",
      "--pretty=format:%gd%x00%s%x00%aI",
    ]);

    if (!stdout.trim()) return [];

    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [ref = "", msg = "", date = ""] = line.split("\0");
        const idxMatch = ref.match(/stash@\{(\d+)\}/);
        const stashIdx = idxMatch && idxMatch[1] ? parseInt(idxMatch[1], 10) : 0;
        return {
          index: stashIdx,
          message: msg,
          date: date,
        };
      });
  }

  /**
   * Git blame for a file.
   */
  public async blame(repoPath: string, file: string): Promise<GitBlameLine[]> {
    const { stdout } = await this.runGit(repoPath, ["blame", "--line-porcelain", "--", file]);

    const lines = stdout.split("\n");
    const result: GitBlameLine[] = [];

    let currentCommit = "";
    let currentAuthor = "";
    let currentDate = "";
    let lineNumber = 0;

    for (const line of lines) {
      if (line.match(/^[0-9a-f]{40}\s+(\d+)\s+(\d+)/)) {
        const parts = line.split(" ");
        if (parts[0] && parts[2]) {
          currentCommit = parts[0];
          lineNumber = parseInt(parts[2], 10);
        }
      } else if (line.startsWith("author ")) {
        currentAuthor = line.substring(7);
      } else if (line.startsWith("author-time ")) {
        const timestamp = parseInt(line.substring(12), 10);
        currentDate = new Date(timestamp * 1000).toISOString();
      } else if (line.startsWith("\t")) {
        result.push({
          lineNumber,
          commit: currentCommit.substring(0, 7),
          author: currentAuthor,
          date: currentDate,
          content: line.substring(1),
        });
      }
    }

    return result;
  }
}

export const gitService = new GitService();
