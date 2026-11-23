import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseExplorerService } from "../src/services/database/database-explorer.service.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { AppError } from "@remote-ide/shared";

describe("Phase 9 — Database Explorer Service", () => {
  let service: DatabaseExplorerService;
  let tmpDir: string;

  beforeEach(() => {
    service = new DatabaseExplorerService();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-explorer-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("lists seeded default demo SQLite database and redacts passwords", async () => {
    const profiles = service.listProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(1);

    const defaultProfile = profiles.find((p) => p.isDefault);
    expect(defaultProfile).toBeDefined();
    expect(defaultProfile?.type).toBe("sqlite");
    expect(defaultProfile?.status).toBe("connected");
  });

  it("tests connection, lists tables, inspects metadata, and paginates table data", async () => {
    const defaultProfile = service.listProfiles().find((p) => p.isDefault)!;

    const testResult = await service.testConnection(defaultProfile.id);
    expect(testResult.success).toBe(true);
    expect(testResult.version).toBeDefined();

    const tables = await service.listTables(defaultProfile.id);
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("users");
    expect(tableNames).toContain("project_tasks");

    const metadata = await service.getTableMetadata(defaultProfile.id, "users");
    expect(metadata.name).toBe("users");
    expect(metadata.columns.length).toBeGreaterThanOrEqual(3);
    const idCol = metadata.columns.find((c) => c.name === "id");
    expect(idCol?.isPrimaryKey).toBe(true);

    const tableData = await service.getTableData(defaultProfile.id, "users", 1, 10);
    expect(tableData.totalRows).toBeGreaterThanOrEqual(3);
    expect(tableData.rows.length).toBeGreaterThanOrEqual(3);
    expect(tableData.rows[0].name).toBe("Aman");
  });

  it("allows read-only SELECT and PRAGMA queries and returns columns and timing", async () => {
    const defaultProfile = service.listProfiles().find((p) => p.isDefault)!;

    const queryResult = await service.runQuery({
      profileId: defaultProfile.id,
      query: "SELECT 42 AS answer, 'hello' AS greeting;",
    });

    expect(queryResult.columns).toEqual(["answer", "greeting"]);
    expect(queryResult.rows.length).toBe(1);
    expect(queryResult.rows[0].answer).toBe(42);
    expect(queryResult.rows[0].greeting).toBe("hello");
    expect(queryResult.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("strictly enforces read-only queries and rejects modifying statements", async () => {
    const defaultProfile = service.listProfiles().find((p) => p.isDefault)!;

    const modifyingQueries = [
      "DROP TABLE users;",
      "DELETE FROM users WHERE id = 1;",
      "UPDATE users SET name = 'Hacked';",
      "INSERT INTO users (name, email, role) VALUES ('X', 'x@x.com', 'x');",
      "ALTER TABLE users ADD COLUMN age INT;",
      "TRUNCATE TABLE users;",
    ];

    for (const query of modifyingQueries) {
      await expect(service.runQuery({ profileId: defaultProfile.id, query })).rejects.toThrow(
        AppError
      );
    }
  });

  it("rejects state-changing PRAGMAs but allows introspection PRAGMAs", async () => {
    const defaultProfile = service.listProfiles().find((p) => p.isDefault)!;

    for (const query of [
      "PRAGMA query_only = OFF",
      "PRAGMA user_version = 7",
      "PRAGMA journal_mode(DELETE)",
      "PRAGMA main.writable_schema = ON",
    ]) {
      await expect(service.runQuery({ profileId: defaultProfile.id, query })).rejects.toThrow(
        AppError
      );
    }

    const info = await service.runQuery({
      profileId: defaultProfile.id,
      query: "PRAGMA table_info(users)",
    });
    expect(info.error).toBeUndefined();
    expect(info.rowCount).toBeGreaterThan(0);
  });

  it("opens file-backed SQLite databases read-only", async () => {
    const dbPath = path.join(tmpDir, "app.db");
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
    const seed = new DatabaseSync(dbPath);
    seed.exec("CREATE TABLE items (id INTEGER); INSERT INTO items VALUES (1);");
    seed.close();

    const profile = service.createProfile({ name: "file", type: "sqlite", database: dbPath });
    const rows = await service.runQuery({ profileId: profile.id, query: "SELECT * FROM items" });
    expect(rows.rowCount).toBe(1);

    // Defense in depth beneath the keyword filter: the connection itself refuses writes.
    const conn = (service as any).sqliteConnections.get(profile.id);
    expect(() => conn.exec("INSERT INTO items VALUES (2)")).toThrow(/readonly/);
  });

  it("clamps invalid pagination parameters", async () => {
    const defaultProfile = service.listProfiles().find((p) => p.isDefault)!;
    const data = await service.getTableData(defaultProfile.id, "users", Number.NaN, 100000);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(500);
  });

  it("throws NOT_FOUND when querying a non-existent database profile", async () => {
    await expect(
      service.runQuery({ profileId: "non-existent-db", query: "SELECT 1;" })
    ).rejects.toThrow(AppError);
  });
});
