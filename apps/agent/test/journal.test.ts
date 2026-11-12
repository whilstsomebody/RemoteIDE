import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalJournalService } from "../src/services/local-journal.service.js";

describe("LocalJournalService", () => {
  let tmpDir: string;
  let journalPath: string;
  let journal: LocalJournalService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteide-journal-test-"));
    journalPath = path.join(tmpDir, "journal.sqlite");
    journal = new LocalJournalService(journalPath);
  });

  afterEach(() => {
    journal.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("assigns monotonically increasing sequence numbers", () => {
    const ev1 = journal.recordChange("ws-1", "file1.txt", "create", "v1");
    const ev2 = journal.recordChange("ws-1", "file2.txt", "update", "v2");
    const ev3 = journal.recordChange("ws-1", "file1.txt", "delete");

    expect(ev1.sequenceNumber).toBe(1);
    expect(ev2.sequenceNumber).toBe(2);
    expect(ev3.sequenceNumber).toBe(3);
    expect(ev1.status).toBe("pending");
  });

  it("tracks pending events and updates delivery status", () => {
    const ev1 = journal.recordChange("ws-1", "file1.txt", "create");
    const ev2 = journal.recordChange("ws-1", "file2.txt", "create");

    let pending = journal.getPendingEntries();
    expect(pending.length).toBe(2);

    // Mark ev1 delivered
    journal.markDelivered([ev1.sequenceNumber]);

    pending = journal.getPendingEntries();
    expect(pending.length).toBe(1);
    expect(pending[0]?.sequenceNumber).toBe(ev2.sequenceNumber);
  });

  it("persists entries across service restarts", () => {
    journal.recordChange("ws-1", "persistent.txt", "create", "etag-123");
    journal.close();

    // Reopen same file
    const reopenedJournal = new LocalJournalService(journalPath);
    const entries = reopenedJournal.getWorkspaceEntries("ws-1");

    expect(entries.length).toBe(1);
    expect(entries[0]?.relativePath).toBe("persistent.txt");
    expect(entries[0]?.fileVersion).toBe("etag-123");
    reopenedJournal.close();
  });
});
