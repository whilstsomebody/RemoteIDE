import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => {
    exec(sql: string): void;
    prepare(sql: string): { get(...args: unknown[]): unknown; run(...args: unknown[]): void };
    close(): void;
  };
};

/** Durable state for the current single-gateway deployment. Never silently falls back to memory. */
export class GatewayStateStore {
  private db: InstanceType<typeof DatabaseSync>;
  constructor(filename: string) {
    if (filename !== ":memory:") {
      fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
      const fd = fs.openSync(filename, "a", 0o600);
      fs.closeSync(fd);
      fs.chmodSync(filename, 0o600);
    }
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS gateway_state (section TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }
  read<T>(section: string): T | undefined {
    const row = this.db.prepare("SELECT value FROM gateway_state WHERE section = ?").get(section) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : undefined;
  }
  write(section: string, value: unknown): void {
    this.db.prepare("INSERT INTO gateway_state(section, value) VALUES (?, ?) ON CONFLICT(section) DO UPDATE SET value = excluded.value").run(section, JSON.stringify(value));
  }
  close(): void { this.db.close(); }
}

export const gatewayStateStore = new GatewayStateStore(
  process.env.NODE_ENV === "test" ? ":memory:" : process.env.GATEWAY_STATE_PATH || "./data/gateway-state.sqlite"
);
