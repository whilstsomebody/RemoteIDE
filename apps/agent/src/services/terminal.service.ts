import * as pty from "node-pty";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import {
  AppError,
  ErrorCode,
  CreateTerminalDto,
  TerminalSession,
  generateId,
  logger,
} from "@remote-ide/shared";

interface PtySessionRecord {
  session: TerminalSession;
  ptyProcess: pty.IPty;
  outputBuffer: string[];
  maxBufferChars: number;
  currentBufferChars: number;
  listeners: Set<(data: string) => void>;
  idleTimeoutTimer: NodeJS.Timeout | null;
}

export interface TerminalServiceOptions {
  maxConcurrentSessions?: number;
  maxBufferChars?: number;
  idleTimeoutMs?: number;
}

export class TerminalService {
  private sessions = new Map<string, PtySessionRecord>();
  private readonly maxConcurrentSessions: number;
  private readonly maxBufferChars: number;
  private readonly idleTimeoutMs: number;
  private readonly hasTmux: boolean;

  constructor(options: TerminalServiceOptions = {}) {
    this.maxConcurrentSessions = options.maxConcurrentSessions ?? 10;
    this.maxBufferChars = options.maxBufferChars ?? 150_000; // ~150KB output ring buffer
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000; // 30 minutes idle timeout
    this.ensureSpawnHelperPermissions();
    this.hasTmux = this.detectTmux();
  }

  /**
   * Ensure node-pty spawn-helper binary has executable permissions on Unix systems.
   */
  private ensureSpawnHelperPermissions(): void {
    if (process.platform === "win32") return;
    try {
      const ptyPath = require.resolve("node-pty");
      const helper = path.resolve(
        path.dirname(ptyPath),
        "../prebuilds",
        `${process.platform}-${process.arch}`,
        "spawn-helper"
      );
      if (fs.existsSync(helper)) {
        const stats = fs.statSync(helper);
        if ((stats.mode & 0o111) === 0) {
          fs.chmodSync(helper, 0o755);
        }
      }
    } catch {
      // Ignore if resolved dynamically
    }
  }

  /**
   * Detect if tmux is installed on the host.
   */
  private detectTmux(): boolean {
    try {
      execSync("which tmux", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns whether tmux persistence is supported on this host.
   */
  public isTmuxSupported(): boolean {
    return this.hasTmux;
  }

  /**
   * Determine available shells on the host.
   */
  public getAvailableShells(): string[] {
    const candidatePaths = [
      process.env.SHELL,
      "/bin/zsh",
      "/bin/bash",
      "/usr/bin/bash",
      "/usr/local/bin/fish",
      "/opt/homebrew/bin/fish",
      "/usr/bin/fish",
      "/bin/sh",
      "pwsh",
      "powershell.exe",
    ].filter((p): p is string => Boolean(p));

    const discovered: string[] = [];
    for (const shellPath of candidatePaths) {
      if (shellPath.includes("/") || shellPath.includes("\\")) {
        if (fs.existsSync(shellPath) && !discovered.includes(shellPath)) {
          discovered.push(shellPath);
        }
      } else {
        try {
          execSync(`which ${shellPath}`, { stdio: "ignore" });
          if (!discovered.includes(shellPath)) discovered.push(shellPath);
        } catch {
          // not found
        }
      }
    }

    if (discovered.length === 0) {
      discovered.push(process.platform === "win32" ? "cmd.exe" : "/bin/sh");
    }

    return discovered;
  }

  /**
   * Resolve default shell for host OS.
   */
  private resolveShell(requested?: string): string {
    const available = this.getAvailableShells();
    if (requested) {
      const match = available.find(
        (s) => s === requested || path.basename(s) === requested.toLowerCase()
      );
      if (match) return match;
    }

    if (process.env.SHELL && fs.existsSync(process.env.SHELL)) {
      return process.env.SHELL;
    }

    return available[0] || (process.platform === "win32" ? "cmd.exe" : "/bin/sh");
  }

  /**
   * Create an interactive pseudoterminal on the host.
   *
   * SECURITY NOTICE:
   * The spawned PTY process runs natively on the host machine and inherits the
   * operating-system permissions, uid, gid, and environment of the agent's user.
   * It is strictly restricted to Owner authorization at the gateway and agent levels.
   */
  public async createTerminal(dto: CreateTerminalDto, ownerId: string): Promise<TerminalSession> {
    if (this.sessions.size >= this.maxConcurrentSessions) {
      throw new AppError(
        ErrorCode.RESOURCE_EXHAUSTED,
        `Maximum concurrent terminal session limit reached (${this.maxConcurrentSessions}).`
      );
    }

    // Working directory validation
    let resolvedCwd = dto.cwd ? path.resolve(dto.cwd) : os.homedir();
    if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
      logger.warn(
        { cwd: dto.cwd },
        "Requested terminal working directory not found, defaulting to home"
      );
      resolvedCwd = os.homedir();
    }

    const sessionId = generateId("term");
    const shellPath = this.resolveShell(dto.shell);
    const cols = dto.cols || 80;
    const rows = dto.rows || 24;
    const sessionName = dto.name || `Terminal (${path.basename(shellPath)})`;

    let spawnBinary = shellPath;
    let spawnArgs: string[] = [];
    let tmuxSessionName: string | undefined = undefined;

    // Optional tmux persistence integration
    if (dto.useTmux && this.hasTmux) {
      tmuxSessionName = `remoteide_${sessionId.replace(/[^a-zA-Z0-9]/g, "")}`;
      spawnBinary = "tmux";
      // Attach or create new named tmux session with selected shell
      spawnArgs = ["new-session", "-A", "-s", tmuxSessionName, shellPath];
    }

    const ptySpawn =
      pty.spawn || (pty as unknown as { default: { spawn: typeof pty.spawn } }).default?.spawn;
    if (typeof ptySpawn !== "function") {
      throw new AppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to initialize node-pty spawn engine on host."
      );
    }

    // Default POSIX / Windows terminal environment
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      REMOTE_IDE_SESSION: sessionId,
      REMOTE_IDE_OWNER: ownerId,
    };

    const ptyProcess = ptySpawn(spawnBinary, spawnArgs, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: resolvedCwd,
      env,
    });

    const now = new Date().toISOString();
    const session: TerminalSession = {
      id: sessionId,
      name: sessionName,
      shell: path.basename(shellPath),
      cwd: resolvedCwd,
      cols,
      rows,
      createdAt: now,
      lastActiveAt: now,
      status: "running",
      tmuxSessionName,
      pid: ptyProcess.pid,
    };

    const record: PtySessionRecord = {
      session,
      ptyProcess,
      outputBuffer: [],
      maxBufferChars: this.maxBufferChars,
      currentBufferChars: 0,
      listeners: new Set(),
      idleTimeoutTimer: null,
    };

    // Buffer incoming output & broadcast to active attached listeners
    ptyProcess.onData((data: string) => {
      session.lastActiveAt = new Date().toISOString();
      this.resetIdleTimer(record);

      // Append to ring buffer
      record.outputBuffer.push(data);
      record.currentBufferChars += data.length;

      // Enforce output ring buffer size bound (FIFO drop oldest chunks)
      while (record.currentBufferChars > record.maxBufferChars && record.outputBuffer.length > 1) {
        const dropped = record.outputBuffer.shift();
        if (dropped) record.currentBufferChars -= dropped.length;
      }

      // Notify attached client sockets
      for (const listener of record.listeners) {
        try {
          listener(data);
        } catch (err) {
          logger.error({ err, sessionId }, "Error delivering terminal data to listener");
        }
      }
    });

    // Handle process termination
    ptyProcess.onExit(({ exitCode }) => {
      logger.info({ sessionId, exitCode }, "Terminal PTY process exited");
      session.status = "exited";
      session.exitCode = exitCode;
      this.clearIdleTimer(record);
    });

    this.resetIdleTimer(record);
    this.sessions.set(sessionId, record);

    logger.info(
      {
        sessionId,
        shell: shellPath,
        cwd: resolvedCwd,
        pid: ptyProcess.pid,
        useTmux: Boolean(tmuxSessionName),
      },
      "Interactive host terminal session started"
    );

    return session;
  }

  /**
   * Write data (keystrokes / commands) to the PTY stdin.
   */
  public writeTerminal(sessionId: string, data: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Terminal session not found: ${sessionId}`);
    }
    if (record.session.status !== "running") {
      throw new AppError(
        ErrorCode.CONFLICT,
        `Terminal session is not running (status: ${record.session.status})`
      );
    }

    record.session.lastActiveAt = new Date().toISOString();
    this.resetIdleTimer(record);
    record.ptyProcess.write(data);
  }

  /**
   * Resize PTY window dimensions.
   */
  public resizeTerminal(sessionId: string, cols: number, rows: number): void {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Terminal session not found: ${sessionId}`);
    }
    if (record.session.status !== "running") return;

    record.session.cols = cols;
    record.session.rows = rows;
    record.session.lastActiveAt = new Date().toISOString();
    this.resetIdleTimer(record);

    try {
      record.ptyProcess.resize(cols, rows);
    } catch (err) {
      logger.warn({ err, sessionId, cols, rows }, "Failed to resize PTY window");
    }
  }

  /**
   * Attach a listener callback to receive live stream data.
   * Returns current buffered history so reconnection seamlessly repopulates the client view.
   */
  public attach(
    sessionId: string,
    listener: (data: string) => void
  ): { session: TerminalSession; replayBuffer: string; unsubscribe: () => void } {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Terminal session not found: ${sessionId}`);
    }

    record.listeners.add(listener);
    const replayBuffer = record.outputBuffer.join("");

    const unsubscribe = () => {
      record.listeners.delete(listener);
    };

    return { session: record.session, replayBuffer, unsubscribe };
  }

  /**
   * Retrieve session metadata.
   */
  public getTerminal(sessionId: string): TerminalSession {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Terminal session not found: ${sessionId}`);
    }
    return record.session;
  }

  /**
   * List all terminal sessions on the host.
   */
  public listTerminals(): TerminalSession[] {
    return Array.from(this.sessions.values()).map((r) => r.session);
  }

  /**
   * Terminate a terminal session gracefully (SIGTERM -> SIGKILL).
   */
  public async closeTerminal(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) return;

    this.clearIdleTimer(record);

    if (record.session.status === "running") {
      try {
        record.ptyProcess.kill("SIGTERM");
        // Give short grace period before forced kill
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (record.session.status === "running") {
          record.ptyProcess.kill("SIGKILL");
        }
      } catch (err) {
        logger.warn({ err, sessionId }, "Error terminating PTY process");
      }
    }

    record.listeners.clear();
    record.outputBuffer = [];
    this.sessions.delete(sessionId);

    logger.info({ sessionId }, "Terminal session closed and resources released");
  }

  /**
   * Gracefully close all terminal sessions on agent shutdown.
   */
  public async shutdownAll(): Promise<void> {
    logger.info("Terminating all active terminal PTY sessions...");
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.closeTerminal(id)));
  }

  private resetIdleTimer(record: PtySessionRecord): void {
    this.clearIdleTimer(record);
    record.idleTimeoutTimer = setTimeout(() => {
      logger.info(
        { sessionId: record.session.id },
        "Terminal session exceeded idle timeout, terminating"
      );
      void this.closeTerminal(record.session.id);
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer(record: PtySessionRecord): void {
    if (record.idleTimeoutTimer) {
      clearTimeout(record.idleTimeoutTimer);
      record.idleTimeoutTimer = null;
    }
  }
}

export const terminalService = new TerminalService();
