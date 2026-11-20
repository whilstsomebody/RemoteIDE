import { describe, it, expect, afterEach } from "vitest";
import { JobManagerService } from "../src/services/job-manager.service.js";
import { JobLifecycleEvent } from "@remote-ide/shared";

describe("Phase 4 - Host Agent Background Job Manager", () => {
  let service: JobManagerService;

  afterEach(async () => {
    if (service) {
      await service.shutdownAll();
    }
  });

  it("executes an approved command, captures stdout, and emits lifecycle events", async () => {
    service = new JobManagerService();
    const events: JobLifecycleEvent[] = [];
    service.onEvent((e) => events.push(e));

    const job = await service.createJob(
      {
        name: "Test Echo Job",
        command: "echo 'BACKGROUND_JOB_OUTPUT'",
        args: [],
        timeoutMs: 30000,
      },
      "owner-1"
    );

    expect(job.status).toBe("running");

    // Wait for job completion
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const current = service.getJob(job.id);
        if (current.status === "completed" || current.status === "failed") {
          clearInterval(check);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 5000);
    });

    const finished = service.getJob(job.id);
    expect(finished.status).toBe("completed");
    expect(finished.exitCode).toBe(0);

    const logs = service.getJobLogs(job.id);
    const stdoutLogs = logs
      .filter((l) => l.stream === "stdout")
      .map((l) => l.data)
      .join("");
    expect(stdoutLogs).toContain("BACKGROUND_JOB_OUTPUT");

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("job.created");
    expect(eventTypes).toContain("job.started");
    expect(eventTypes).toContain("job.completed");
  });

  it("supports cancelling a running job", async () => {
    service = new JobManagerService();

    // Spawn a long-running process
    const job = await service.createJob(
      {
        name: "Sleep Job",
        command: "sleep 10",
        args: [],
        timeoutMs: 30000,
      },
      "owner-1"
    );

    expect(job.status).toBe("running");

    // Cancel the job
    await service.cancelJob(job.id, "User cancelled test");

    const finished = service.getJob(job.id);
    expect(finished.status).toBe("cancelled");
  });

  it("supports retrying an approved job", async () => {
    service = new JobManagerService();

    const job = await service.createJob(
      {
        name: "Retryable Task",
        command: "echo RETRIED_TASK",
        args: [],
        timeoutMs: 30000,
      },
      "owner-1"
    );

    // Wait for first run to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    const retried = await service.retryJob(job.id, "owner-1");
    expect(retried.id).not.toBe(job.id);
    expect(retried.name).toBe("Retryable Task");
  });

  it("enforces concurrency bounds and queues excess jobs", async () => {
    service = new JobManagerService({ maxConcurrentJobs: 1 });

    const job1 = await service.createJob(
      {
        name: "Job 1",
        command: "sleep 0.5",
        args: [],
        timeoutMs: 30000,
      },
      "owner-1"
    );

    const job2 = await service.createJob(
      {
        name: "Job 2",
        command: "echo Queued",
        args: [],
        timeoutMs: 30000,
      },
      "owner-1"
    );

    expect(job1.status).toBe("running");
    expect(job2.status).toBe("pending");

    // Wait for job1 to complete and job2 to automatically pick up
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const j2 = service.getJob(job2.id);
        if (j2.status === "completed") {
          clearInterval(check);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 5000);
    });

    expect(service.getJob(job2.id).status).toBe("completed");
  });
});
