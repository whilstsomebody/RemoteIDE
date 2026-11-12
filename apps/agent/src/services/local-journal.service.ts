import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { generateId, FsChangeOperation, FsJournalEntry } from "@remote-ide/shared";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec: (sql: string) => void;
    prepare: (sql: string) => {
      run: (...args: unknown[]) => void;
      all: (...args: unknown[]) => unknown[];
      get: (...args: unknown[]) => unknown;
    };
    close: () => void;
  };
};

export class LocalJournalService {
  private db: InstanceType<typeof DatabaseSync>;
  private readonly dbPath: string;

  constructor(dbPath: string = ":memory:") {
    this.dbPath = dbPath;

    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_change_journal (
        sequence_number INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        file_version TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_journal_workspace ON file_change_journal (workspace_id);
      CREATE INDEX IF NOT EXISTS idx_journal_status ON file_change_journal (status);
      CREATE INDEX IF NOT EXISTS idx_journal_seq ON file_change_journal (sequence_number DESC);
    `);
  }

  public recordChange(
    workspaceId: string,
    relativePath: string,
    operationType: FsChangeOperation,
    fileVersion?: string,
    metadata?: Record<string, unknown>
  ): FsJournalEntry {
    const eventId = generateId("fsev");
    const timestamp = new Date().toISOString();
    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO file_change_journal (
        event_id, workspace_id, relative_path, operation_type, timestamp, file_version, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `);

    stmt.run(
      eventId,
      workspaceId,
      relativePath,
      operationType,
      timestamp,
      fileVersion || null,
      metadataStr
    );

    const getLatestStmt = this.db.prepare(`
      SELECT sequence_number, event_id, workspace_id, relative_path, operation_type, timestamp, file_version, status, metadata
      FROM file_change_journal
      WHERE event_id = ?
      LIMIT 1
    `);

    const row = getLatestStmt.get(eventId) as {
      sequence_number: number;
      event_id: string;
      workspace_id: string;
      relative_path: string;
      operation_type: FsChangeOperation;
      timestamp: string;
      file_version: string | null;
      status: "pending" | "delivered" | "synced";
      metadata: string | null;
    };

    return {
      sequenceNumber: row.sequence_number,
      eventId: row.event_id,
      workspaceId: row.workspace_id,
      relativePath: row.relative_path,
      operationType: row.operation_type,
      timestamp: row.timestamp,
      fileVersion: row.file_version,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  public getPendingEntries(limit: number = 50): FsJournalEntry[] {
    const stmt = this.db.prepare(`
      SELECT sequence_number, event_id, workspace_id, relative_path, operation_type, timestamp, file_version, status, metadata
      FROM file_change_journal
      WHERE status = 'pending'
      ORDER BY sequence_number ASC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      sequence_number: number;
      event_id: string;
      workspace_id: string;
      relative_path: string;
      operation_type: FsChangeOperation;
      timestamp: string;
      file_version: string | null;
      status: "pending" | "delivered" | "synced";
      metadata: string | null;
    }>;

    return rows.map((r) => ({
      sequenceNumber: r.sequence_number,
      eventId: r.event_id,
      workspaceId: r.workspace_id,
      relativePath: r.relative_path,
      operationType: r.operation_type,
      timestamp: r.timestamp,
      fileVersion: r.file_version,
      status: r.status,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  public markDelivered(sequenceNumbers: number[]): void {
    if (sequenceNumbers.length === 0) return;
    const stmt = this.db.prepare(`
      UPDATE file_change_journal
      SET status = 'delivered'
      WHERE sequence_number = ?
    `);

    for (const seq of sequenceNumbers) {
      stmt.run(seq);
    }
  }

  public getWorkspaceEntries(workspaceId: string, limit: number = 50): FsJournalEntry[] {
    const stmt = this.db.prepare(`
      SELECT sequence_number, event_id, workspace_id, relative_path, operation_type, timestamp, file_version, status, metadata
      FROM file_change_journal
      WHERE workspace_id = ?
      ORDER BY sequence_number DESC
      LIMIT ?
    `);

    const rows = stmt.all(workspaceId, limit) as Array<{
      sequence_number: number;
      event_id: string;
      workspace_id: string;
      relative_path: string;
      operation_type: FsChangeOperation;
      timestamp: string;
      file_version: string | null;
      status: "pending" | "delivered" | "synced";
      metadata: string | null;
    }>;

    return rows.map((r) => ({
      sequenceNumber: r.sequence_number,
      eventId: r.event_id,
      workspaceId: r.workspace_id,
      relativePath: r.relative_path,
      operationType: r.operation_type,
      timestamp: r.timestamp,
      fileVersion: r.file_version,
      status: r.status,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  public checkHealth(): { healthy: boolean; dbPath: string; pendingCount: number; error?: string } {
    try {
      const countStmt = this.db.prepare(
        "SELECT count(*) as count FROM file_change_journal WHERE status = 'pending'"
      );
      const res = countStmt.get() as { count: number };
      return { healthy: true, dbPath: this.dbPath, pendingCount: res.count };
    } catch (err) {
      return { healthy: false, dbPath: this.dbPath, pendingCount: 0, error: String(err) };
    }
  }

  public close(): void {
    try {
      this.db.close();
    } catch {
      // Already closed
    }
  }
}
