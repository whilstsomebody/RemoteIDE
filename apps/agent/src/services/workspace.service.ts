import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AppError, ErrorCode, generateId, Workspace, WorkspaceFolder } from "@remote-ide/shared";

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

export class WorkspaceService {
  private db: InstanceType<typeof DatabaseSync>;

  constructor(dbPath: string = ":memory:", private allowedRoots: string[] = []) {
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
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        folders TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  public registerWorkspace(name: string, folderPaths: string[]): Workspace {
    if (!name || name.trim().length === 0) {
      throw new AppError(ErrorCode.BAD_REQUEST, "Workspace name cannot be empty");
    }

    if (!folderPaths || folderPaths.length === 0) {
      throw new AppError(ErrorCode.BAD_REQUEST, "At least one folder path must be provided");
    }

    const verifiedFolders: WorkspaceFolder[] = [];
    for (const rawPath of folderPaths) {
      const resolvedPath = path.resolve(rawPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new AppError(
          ErrorCode.INVALID_WORKSPACE_PATH,
          `Path does not exist on host: ${rawPath}`
        );
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        throw new AppError(ErrorCode.INVALID_WORKSPACE_PATH, `Path is not a directory: ${rawPath}`);
      }

      const realCanonicalPath = fs.realpathSync(resolvedPath);
      // Registering the filesystem root or the whole home directory would expose
      // credentials (~/.ssh, cloud configs) and every other project to file APIs.
      if (realCanonicalPath === path.parse(realCanonicalPath).root || realCanonicalPath === this.canonicalHome()) {
        throw new AppError(
          ErrorCode.PATH_NOT_ALLOWED,
          "The filesystem root or home directory cannot be registered as a workspace"
        );
      }
      if (this.allowedRoots.length && !this.allowedRoots.some((root) => {
        let canonical: string;
        try {
          canonical = fs.realpathSync(path.resolve(root));
        } catch {
          return false;
        }
        return realCanonicalPath === canonical || realCanonicalPath.startsWith(`${canonical}${path.sep}`);
      })) {
        throw new AppError(ErrorCode.PATH_NOT_ALLOWED, "Workspace is outside configured project roots");
      }
      const folderName = path.basename(realCanonicalPath) || name;
      if (verifiedFolders.some((folder) => folder.name === folderName)) {
        throw new AppError(ErrorCode.INVALID_WORKSPACE_PATH, "Workspace folder names must be unique");
      }

      verifiedFolders.push({
        id: generateId("fld"),
        name: folderName,
        path: realCanonicalPath,
      });
    }

    const id = generateId("ws");
    const now = new Date().toISOString();
    const foldersJson = JSON.stringify(verifiedFolders);

    const existingWorkspaces = this.listWorkspaces();
    const shouldBeActive = existingWorkspaces.length === 0 ? 1 : 0;

    const stmt = this.db.prepare(`
      INSERT INTO workspaces (id, name, folders, created_at, updated_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, name.trim(), foldersJson, now, now, shouldBeActive);

    return {
      id,
      name: name.trim(),
      folders: verifiedFolders,
      createdAt: now,
      updatedAt: now,
      isActive: shouldBeActive === 1,
    };
  }

  private canonicalHome(): string | undefined {
    try {
      return fs.realpathSync(os.homedir());
    } catch {
      return undefined;
    }
  }

  public listWorkspaces(): Workspace[] {
    const stmt = this.db.prepare(`
      SELECT id, name, folders, created_at, updated_at, is_active
      FROM workspaces
      ORDER BY created_at ASC
    `);

    const rows = stmt.all() as Array<{
      id: string;
      name: string;
      folders: string;
      created_at: string;
      updated_at: string;
      is_active: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      folders: JSON.parse(r.folders) as WorkspaceFolder[],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      isActive: r.is_active === 1,
    }));
  }

  public getWorkspace(id: string): Workspace {
    const stmt = this.db.prepare(`
      SELECT id, name, folders, created_at, updated_at, is_active
      FROM workspaces
      WHERE id = ?
      LIMIT 1
    `);

    const row = stmt.get(id) as
      | {
          id: string;
          name: string;
          folders: string;
          created_at: string;
          updated_at: string;
          is_active: number;
        }
      | undefined;

    if (!row) {
      throw new AppError(ErrorCode.WORKSPACE_NOT_FOUND, `Workspace not found: ${id}`);
    }

    return {
      id: row.id,
      name: row.name,
      folders: JSON.parse(row.folders) as WorkspaceFolder[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isActive: row.is_active === 1,
    };
  }

  public setActiveWorkspace(id: string): Workspace {
    const target = this.getWorkspace(id);

    this.db.exec("UPDATE workspaces SET is_active = 0");

    const stmt = this.db.prepare(`
      UPDATE workspaces
      SET is_active = 1, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), id);

    return {
      ...target,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
  }

  public getActiveWorkspace(): Workspace | null {
    const stmt = this.db.prepare(`
      SELECT id, name, folders, created_at, updated_at, is_active
      FROM workspaces
      WHERE is_active = 1
      LIMIT 1
    `);

    const row = stmt.get() as
      | {
          id: string;
          name: string;
          folders: string;
          created_at: string;
          updated_at: string;
          is_active: number;
        }
      | undefined;

    if (!row) {
      const all = this.listWorkspaces();
      return all[0] || null;
    }

    return {
      id: row.id,
      name: row.name,
      folders: JSON.parse(row.folders) as WorkspaceFolder[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isActive: true,
    };
  }

  public removeWorkspace(id: string): void {
    // Only removes the registry entry; files on the host disk are never touched.
    const target = this.getWorkspace(id);

    const deleteStmt = this.db.prepare("DELETE FROM workspaces WHERE id = ?");
    deleteStmt.run(id);

    if (target.isActive) {
      const remaining = this.listWorkspaces();
      if (remaining.length > 0 && remaining[0]) {
        this.setActiveWorkspace(remaining[0].id);
      }
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
