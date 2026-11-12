import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabaseClient } from "./client.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(migrationsFolder?: string): Promise<void> {
  const { db, close } = createDatabaseClient();
  const folder = migrationsFolder || path.resolve(__dirname, "../drizzle");

  console.log(`[db:migrate] Running migrations from: ${folder}`);
  try {
    await migrate(db, { migrationsFolder: folder });
    console.log("[db:migrate] Migrations completed successfully.");
  } catch (err) {
    console.error("[db:migrate] Migration error:", err);
    throw err;
  } finally {
    await close();
  }
}

// Allow direct CLI execution if executed directly
if (process.argv[1] && process.argv[1].endsWith("migrate.js")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
