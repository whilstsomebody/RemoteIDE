import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  AppError,
  ErrorCode,
  CreateJobDto,
  JobDefinition,
  JobLifecycleEvent,
  JobLifecycleEventType,
  JobLogEntry,
  generateId,
  logger,
} from "@remote-ide/shared";

interface JobRecord {
  job: JobDefinition;
  process?: ChildProcess;
  logs: JobLogEntry[];
  maxLogEntries: number;
  timeoutTimer?: NodeJS.Timeout;
  logListeners: Set<(entry: JobLogEntry) => void>;
}

export interface JobManagerOptions {
  maxConcurrentJobs?: number;
  maxLogEntriesPerJob?: number;
  defaultTimeoutMs?: number;
}

export class JobManagerService {
  private jobs = new Map<string, JobRecord>();
  private pendingQueue: string[] = []; // Job IDs queued for execution
  private eventListeners = new Set<(event: JobLifecycleEvent) => void>();
  private readonly maxConcurrentJobs: number;
  private readonly maxLogEntriesPerJob: number;
  private readonly defaultTimeoutMs: number;

  constructor(options: JobManagerOptions = {}) {
    this.maxConcurrentJobs = options.maxConcurrentJobs ?? 5;
    this.maxLogEntriesPerJob = options.maxLogEntriesPerJob ?? 5000;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 1800000; // 30 minutes
  }

  /**
   * Register a subscriber for job lifecycle events.
   */
  public onEvent(listener: (event: JobLifecycleEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emitEvent(type: JobLifecycleEventType, job: JobDefinition): void {
    const event: JobLifecycleEvent = {
      type,
      jobId: job.id,
      timestamp: new Date().toISOString(),
      job: { ...job },
    };

    logger.info({ eventType: type, jobId: job.id, name: job.name }, "Job lifecycle event emitted");

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error({ err, eventType: type, jobId: job.id }, "Error notifying job event listener");
      }
    }
  }

  /**
   * Create and queue/execute a new background job.
   */
  public async createJob(dto: CreateJobDto, ownerId: string): Promise<JobDefinition> {
    // Idempotency check: return existing running/pending job if same key
    if (dto.idempotencyKey) {
      for (const record of this.jobs.values()) {
        if (
          record.job.idempotencyKey === dto.idempotencyKey &&
          (record.job.status === "running" || record.job.status === "pending")
        ) {
          logger.info(
            { idempotencyKey: dto.idempotencyKey, jobId: record.job.id },
            "Idempotent job reused"
          );
          return record.job;
        }
      }
    }

    // Working directory validation
    let resolvedCwd = dto.cwd ? path.resolve(dto.cwd) : os.homedir();
    if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
      resolvedCwd = os.homedir();
    }

    const jobId = generateId("job");
    const now = new Date().toISOString();

    const job: JobDefinition = {
      id: jobId,
      name: dto.name,
      command: dto.command,
      args: dto.args || [],
      cwd: resolvedCwd,
      owner: ownerId,
      status: "pending",
      idempotencyKey: dto.idempotencyKey,
      createdAt: now,
      timeoutMs: dto.timeoutMs || this.defaultTimeoutMs,
    };

    const record: JobRecord = {
      job,
      logs: [],
      maxLogEntries: this.maxLogEntriesPerJob,
      logListeners: new Set(),
    };

    this.jobs.set(jobId, record);
    this.emitEvent("job.created", job);

    this.addLog(
      record,
      "system",
      `Job registered and queued: ${job.name} (${job.command} ${job.args.join(" ")})`
    );

    // Schedule execution
    this.pendingQueue.push(jobId);
    this.processQueue();

    return job;
  }

  /**
   * Process pending queue if capacity is available.
   */
  private processQueue(): void {
    const runningCount = Array.from(this.jobs.values()).filter(
      (r) => r.job.status === "running"
    ).length;

    if (runningCount >= this.maxConcurrentJobs) {
      return;
    }

    const nextJobId = this.pendingQueue.shift();
    if (!nextJobId) return;

    const record = this.jobs.get(nextJobId);
    if (!record || record.job.status !== "pending") {
      this.processQueue();
      return;
    }

    this.startJobProcess(record);
  }

  /**
   * Spawn child process and manage log streams.
   */
  private startJobProcess(record: JobRecord): void {
    const { job } = record;
    job.status = "running";
    job.startedAt = new Date().toISOString();
    this.emitEvent("job.started", job);

    this.addLog(record, "system", `Starting process in ${job.cwd}...`);

    try {
      // Spawn child process with shell wrapper to support command execution
      const child = spawn(job.command, job.args, {
        cwd: job.cwd,
        shell: true,
        env: {
          ...process.env,
          REMOTE_IDE_JOB_ID: job.id,
          REMOTE_IDE_JOB_NAME: job.name,
        },
      });

      record.process = child;

      // Handle stdout
      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        this.addLog(record, "stdout", text);
      });

      // Handle stderr
      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        this.addLog(record, "stderr", text);
      });

      // Execution timeout watchdog
      if (job.timeoutMs && job.timeoutMs > 0) {
        record.timeoutTimer = setTimeout(() => {
          if (job.status === "running") {
            this.addLog(
              record,
              "system",
              `Job execution timed out after ${job.timeoutMs}ms. Terminating...`
            );
            this.cancelJob(job.id, "Execution timeout exceeded");
          }
        }, job.timeoutMs);
      }

      // Process error
      child.on("error", (err) => {
        logger.error({ err, jobId: job.id }, "Child process error");
        job.error = err.message;
        this.finishJob(record, "failed", null, err.message);
      });

      // Process exit
      child.on("close", (code) => {
        if (job.status === "cancelled") return;
        const status = code === 0 ? "completed" : "failed";
        this.finishJob(
          record,
          status,
          code,
          code !== 0 ? `Process exited with code ${code}` : undefined
        );
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown spawn error";
      this.addLog(record, "system", `Failed to spawn process: ${message}`);
      this.finishJob(record, "failed", null, message);
    }
  }

  private finishJob(
    record: JobRecord,
    status: "completed" | "failed" | "cancelled",
    exitCode: number | null,
    error?: string
  ): void {
    if (record.timeoutTimer) {
      clearTimeout(record.timeoutTimer);
      record.timeoutTimer = undefined;
    }

    const { job } = record;
    if (job.status !== "running" && job.status !== "pending") return;

    job.status = status;
    job.completedAt = new Date().toISOString();
    job.exitCode = exitCode;
    if (error) job.error = error;

    this.addLog(record, "system", `Job ${status} with exit code ${exitCode ?? "none"}`);

    if (status === "completed") {
      this.emitEvent("job.completed", job);
    } else if (status === "cancelled") {
      this.emitEvent("job.cancelled", job);
    } else {
      this.emitEvent("job.failed", job);
    }

    // Trigger next queued job
    this.processQueue();
  }

  /**
   * Add a log entry and broadcast to active stream listeners.
   */
  private addLog(record: JobRecord, stream: "stdout" | "stderr" | "system", data: string): void {
    const entry: JobLogEntry = {
      id: generateId("log"),
      jobId: record.job.id,
      timestamp: new Date().toISOString(),
      stream,
      data,
    };

    record.logs.push(entry);

    // Bound memory size
    if (record.logs.length > record.maxLogEntries) {
      record.logs.splice(0, record.logs.length - record.maxLogEntries);
    }

    for (const listener of record.logListeners) {
      try {
        listener(entry);
      } catch (err) {
        logger.error({ err, jobId: record.job.id }, "Error delivering job log to subscriber");
      }
    }
  }

  /**
   * Cancel a running or queued job.
   */
  public async cancelJob(jobId: string, reason = "Cancelled by user"): Promise<JobDefinition> {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }

    // If pending, remove from queue
    if (record.job.status === "pending") {
      this.pendingQueue = this.pendingQueue.filter((id) => id !== jobId);
      this.finishJob(record, "cancelled", null, reason);
      return record.job;
    }

    if (record.job.status === "running" && record.process) {
      this.finishJob(record, "cancelled", null, reason);
      try {
        record.process.kill("SIGTERM");
        setTimeout(() => {
          if (record.process && !record.process.killed) {
            record.process.kill("SIGKILL");
          }
        }, 500);
      } catch (err) {
        logger.warn({ err, jobId }, "Error killing job process");
      }
    }

    return record.job;
  }

  /**
   * Retry an approved job.
   */
  public async retryJob(jobId: string, ownerId: string): Promise<JobDefinition> {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }

    return this.createJob(
      {
        name: record.job.name,
        command: record.job.command,
        args: record.job.args,
        cwd: record.job.cwd,
        timeoutMs: record.job.timeoutMs,
      },
      ownerId
    );
  }

  /**
   * Retrieve job details.
   */
  public getJob(jobId: string): JobDefinition {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }
    return record.job;
  }

  /**
   * Retrieve job logs.
   */
  public getJobLogs(jobId: string): JobLogEntry[] {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }
    return record.logs;
  }

  /**
   * Subscribe to live streaming logs.
   */
  public subscribeLogs(
    jobId: string,
    listener: (entry: JobLogEntry) => void
  ): { logs: JobLogEntry[]; unsubscribe: () => void } {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }

    record.logListeners.add(listener);
    return {
      logs: [...record.logs],
      unsubscribe: () => record.logListeners.delete(listener),
    };
  }

  /**
   * List all jobs.
   */
  public listJobs(): JobDefinition[] {
    return Array.from(this.jobs.values()).map((r) => r.job);
  }

  /**
   * Graceful shutdown of all active jobs on agent shutdown.
   */
  public async shutdownAll(): Promise<void> {
    logger.info("Terminating all active background jobs...");
    const runningJobs = Array.from(this.jobs.values()).filter((r) => r.job.status === "running");
    await Promise.all(runningJobs.map((r) => this.cancelJob(r.job.id, "Host agent shutting down")));
  }
}

export const jobManagerService = new JobManagerService();
