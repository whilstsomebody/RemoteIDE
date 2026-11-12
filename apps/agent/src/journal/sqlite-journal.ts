import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

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

export interface JournalRecord {
  id?: string;
  operation: string;
  target: string;
  status: "success" | "failure" | "pending";
  metadata?: Record<string, unknown>;
}

export interface JournalEntry extends JournalRecord {
  id: string;
  timestamp: string;
}

export class HostLocalJournal {
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
      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        operation TEXT NOT NULL,
        target TEXT NOT NULL,
        status TEXT NOT NULL,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON journal_entries (timestamp DESC);
    `);
  }

  public record(entry: JournalRecord): JournalEntry {
    const id =
      entry.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2));
    const timestamp = new Date().toISOString();
    const metadataStr = entry.metadata ? JSON.stringify(entry.metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO journal_entries (id, timestamp, operation, target, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, timestamp, entry.operation, entry.target, entry.status, metadataStr);

    return {
      id,
      timestamp,
      operation: entry.operation,
      target: entry.target,
      status: entry.status,
      metadata: entry.metadata,
    };
  }

  public getRecentEntries(limit: number = 20): JournalEntry[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, operation, target, status, metadata
      FROM journal_entries
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      id: string;
      timestamp: string;
      operation: string;
      target: string;
      status: "success" | "failure" | "pending";
      metadata: string | null;
    }>;

    return rows.map((r) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  public checkHealth(): { healthy: boolean; dbPath: string; error?: string } {
    try {
      const stmt = this.db.prepare("SELECT 1 as alive");
      const res = stmt.get() as { alive: number };
      return { healthy: res.alive === 1, dbPath: this.dbPath };
    } catch (err) {
      return { healthy: false, dbPath: this.dbPath, error: String(err) };
    }
  }

  public close(): void {
    this.db.close();
  }
}
