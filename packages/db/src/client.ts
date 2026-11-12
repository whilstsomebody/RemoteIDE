import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

export type RemoteIdeDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseConfig {
  connectionString?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export function createDatabaseClient(config?: DatabaseConfig): {
  db: RemoteIdeDatabase;
  pool: pg.Pool;
  close: () => Promise<void>;
  checkHealth: () => Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
} {
  const connectionString =
    config?.connectionString ||
    process.env.DATABASE_URL ||
    "postgresql://remoteide:remoteide_dev_pass@localhost:5432/remoteide_db";

  const pool = new Pool({
    connectionString,
    max: config?.max ?? 10,
    idleTimeoutMillis: config?.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: config?.connectionTimeoutMillis ?? 5000,
  });

  const db = drizzle(pool, { schema });

  async function checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await pool.query("SELECT 1");
      return {
        healthy: true,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function close(): Promise<void> {
    await pool.end();
  }

  return { db, pool, close, checkHealth };
}

