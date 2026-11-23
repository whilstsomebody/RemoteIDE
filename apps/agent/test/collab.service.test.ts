import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as Y from "yjs";
import { FilesystemService } from "../src/services/filesystem.service.js";
import { WorkspaceService } from "../src/services/workspace.service.js";
import { WatcherService } from "../src/services/watcher.service.js";
import { LocalJournalService } from "../src/services/local-journal.service.js";
import { CollabDocManagerService } from "../src/services/collab/collab-doc-manager.service.js";
import { AppError } from "@remote-ide/shared";

describe("Phase 11 — Collaborative Editing & Yjs CRDT Persistence", () => {
  let tmpDir: string;
  let workspaceDir: string;
  let journalPath: string;
  let workspaceService: WorkspaceService;
  let journalService: LocalJournalService;
  let watcherService: WatcherService;
  let fsService: FilesystemService;
  let collabService: CollabDocManagerService;
  let workspaceId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteide-collab-test-"));
    workspaceDir = path.join(tmpDir, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });
    journalPath = path.join(tmpDir, "journal.sqlite");

    journalService = new LocalJournalService(journalPath);
    workspaceService = new WorkspaceService(journalPath, [tmpDir]);
    const ws = workspaceService.registerWorkspace("Collab Test Workspace", [workspaceDir]);
    workspaceId = ws.id;

    watcherService = new WatcherService(journalService);
    fsService = new FilesystemService(workspaceService, journalService, { watcherService });
    collabService = new CollabDocManagerService(fsService, watcherService, {
      batchWriteDelayMs: 50,
      inactivityTtlMs: 100,
    });
  });

  afterEach(async () => {
    if (collabService) {
      await collabService.flushAll();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it("1. Loads initial document from host filesystem into Y.Doc", async () => {
    const filePath = "index.ts";
    const initialContent = "console.log('Hello RemoteIDE');";
    fsService.writeFile(workspaceId, filePath, initialContent);

    const { participant, session, syncUpdateBase64 } = await collabService.join(
      workspaceId,
      filePath,
      { id: "user-1", name: "Alice", role: "owner" }
    );

    expect(participant.id).toBe("user-1");
    expect(participant.role).toBe("owner");
    expect(session.text.toString()).toBe(initialContent);
    expect(syncUpdateBase64).toBeDefined();
    expect(syncUpdateBase64.length).toBeGreaterThan(0);
  });

  it("2. Two simultaneous editors: changes propagate and converge over CRDT", async () => {
    const filePath = "concurrent.ts";
    fsService.writeFile(workspaceId, filePath, "Line 1\nLine 2\nLine 3");

    // Editor 1 (Alice) joins
    await collabService.join(workspaceId, filePath, {
      id: "alice",
      name: "Alice",
      role: "editor",
    });

    // Editor 2 (Bob) joins
    await collabService.join(workspaceId, filePath, {
      id: "bob",
      name: "Bob",
      role: "editor",
    });

    // Alice types locally on clientDocA
    const clientDocA = new Y.Doc();
    const clientTextA = clientDocA.getText("contents");
    // Sync initial state
    const { updateBase64: initialSync } = collabService.getSyncStep2(workspaceId, filePath);
    Y.applyUpdate(clientDocA, Buffer.from(initialSync, "base64"));

    // Bob types locally on clientDocB
    const clientDocB = new Y.Doc();
    const clientTextB = clientDocB.getText("contents");
    Y.applyUpdate(clientDocB, Buffer.from(initialSync, "base64"));

    // Alice appends text at beginning
    let updateAlice: Uint8Array | null = null;
    clientDocA.on("update", (u, origin) => {
      if (origin === "local") updateAlice = u;
    });
    clientDocA.transact(() => {
      clientTextA.insert(0, "// Author: Alice\n");
    }, "local");

    // Bob appends text at end
    let updateBob: Uint8Array | null = null;
    clientDocB.on("update", (u, origin) => {
      if (origin === "local") updateBob = u;
    });
    clientDocB.transact(() => {
      clientTextB.insert(clientTextB.length, "\n// Footer: Bob");
    }, "local");

    // Ingest Alice's update into host authoritative session
    collabService.applyClientUpdate(
      workspaceId,
      filePath,
      Buffer.from(updateAlice!).toString("base64"),
      { id: "alice", role: "editor" }
    );

    // Ingest Bob's update into host authoritative session
    collabService.applyClientUpdate(
      workspaceId,
      filePath,
      Buffer.from(updateBob!).toString("base64"),
      { id: "bob", role: "editor" }
    );

    // Cross-apply updates on client docs
    Y.applyUpdate(clientDocA, updateBob!, "remote");
    Y.applyUpdate(clientDocB, updateAlice!, "remote");

    const hostSession = collabService.getSession(workspaceId, filePath)!;
    const hostContent = hostSession.text.toString();

    // Verify all 3 (Alice, Bob, Host) converged to the exact same text
    expect(clientTextA.toString()).toBe(hostContent);
    expect(clientTextB.toString()).toBe(hostContent);
    expect(hostContent).toContain("// Author: Alice\n");
    expect(hostContent).toContain("\n// Footer: Bob");
  });

  it("3. Three simultaneous editors: multi-way convergence to identical state", async () => {
    const filePath = "three-editors.ts";
    fsService.writeFile(workspaceId, filePath, "start");

    await collabService.join(workspaceId, filePath, { id: "u1", name: "User 1", role: "editor" });
    await collabService.join(workspaceId, filePath, { id: "u2", name: "User 2", role: "editor" });
    await collabService.join(workspaceId, filePath, { id: "u3", name: "User 3", role: "editor" });

    const d1 = new Y.Doc();
    const d2 = new Y.Doc();
    const d3 = new Y.Doc();
    const t1 = d1.getText("contents");
    const t2 = d2.getText("contents");
    const t3 = d3.getText("contents");

    const { updateBase64: init } = collabService.getSyncStep2(workspaceId, filePath);
    Y.applyUpdate(d1, Buffer.from(init, "base64"), "init");
    Y.applyUpdate(d2, Buffer.from(init, "base64"), "init");
    Y.applyUpdate(d3, Buffer.from(init, "base64"), "init");

    let u1: Uint8Array, u2: Uint8Array, u3: Uint8Array;
    d1.on("update", (u, origin) => {
      if (origin === "local") u1 = u;
    });
    d2.on("update", (u, origin) => {
      if (origin === "local") u2 = u;
    });
    d3.on("update", (u, origin) => {
      if (origin === "local") u3 = u;
    });

    d1.transact(() => t1.insert(0, "[1]"), "local");
    d2.transact(() => t2.insert(t2.length, "[2]"), "local");
    d3.transact(() => t3.insert(3, "[3]"), "local");

    collabService.applyClientUpdate(workspaceId, filePath, Buffer.from(u1!).toString("base64"), {
      id: "u1",
      role: "editor",
    });
    collabService.applyClientUpdate(workspaceId, filePath, Buffer.from(u2!).toString("base64"), {
      id: "u2",
      role: "editor",
    });
    collabService.applyClientUpdate(workspaceId, filePath, Buffer.from(u3!).toString("base64"), {
      id: "u3",
      role: "editor",
    });

    // Exchange all updates
    Y.applyUpdate(d1, u2!, "remote");
    Y.applyUpdate(d1, u3!, "remote");
    Y.applyUpdate(d2, u1!, "remote");
    Y.applyUpdate(d2, u3!, "remote");
    Y.applyUpdate(d3, u1!, "remote");
    Y.applyUpdate(d3, u2!, "remote");

    const hostSession = collabService.getSession(workspaceId, filePath)!;
    expect(t1.toString()).toBe(t2.toString());
    expect(t2.toString()).toBe(t3.toString());
    expect(t1.toString()).toBe(hostSession.text.toString());
  });

  it("4. Concurrent edits at the exact same location converge deterministically without data loss", async () => {
    const filePath = "collision.ts";
    fsService.writeFile(workspaceId, filePath, "const x = ;");

    await collabService.join(workspaceId, filePath, { id: "dev1", name: "Dev 1", role: "editor" });
    await collabService.join(workspaceId, filePath, { id: "dev2", name: "Dev 2", role: "editor" });

    const c1 = new Y.Doc();
    const c2 = new Y.Doc();
    const { updateBase64: init } = collabService.getSyncStep2(workspaceId, filePath);
    Y.applyUpdate(c1, Buffer.from(init, "base64"), "init");
    Y.applyUpdate(c2, Buffer.from(init, "base64"), "init");

    let u1: Uint8Array, u2: Uint8Array;
    c1.on("update", (u, origin) => {
      if (origin === "local") u1 = u;
    });
    c2.on("update", (u, origin) => {
      if (origin === "local") u2 = u;
    });

    // Both insert at the exact same offset: index 10 (after "const x = ")
    c1.transact(() => c1.getText("contents").insert(10, "100"), "local");
    c2.transact(() => c2.getText("contents").insert(10, "200"), "local");

    collabService.applyClientUpdate(workspaceId, filePath, Buffer.from(u1!).toString("base64"), {
      id: "dev1",
      role: "editor",
    });
    collabService.applyClientUpdate(workspaceId, filePath, Buffer.from(u2!).toString("base64"), {
      id: "dev2",
      role: "editor",
    });

    Y.applyUpdate(c1, u2!, "remote");
    Y.applyUpdate(c2, u1!, "remote");

    const hostContent = collabService.getSession(workspaceId, filePath)!.text.toString();
    expect(c1.getText("contents").toString()).toBe(c2.getText("contents").toString());
    expect(c1.getText("contents").toString()).toBe(hostContent);
    // Both 100 and 200 are preserved
    expect(hostContent).toContain("100");
    expect(hostContent).toContain("200");
  });

  it("5. Viewer attempting a write is rejected immediately and document remains untouched", async () => {
    const filePath = "readonly.ts";
    const initialCode = "const immutable = true;";
    fsService.writeFile(workspaceId, filePath, initialCode);

    await collabService.join(workspaceId, filePath, {
      id: "viewer-1",
      name: "Auditor",
      role: "viewer",
    });

    // Create a rogue update
    const dummyDoc = new Y.Doc();
    const text = dummyDoc.getText("contents");
    text.insert(0, initialCode);
    let rogueUpdate: Uint8Array;
    dummyDoc.on("update", (u) => (rogueUpdate = u));
    dummyDoc.transact(() => text.insert(0, "// MALICIOUS EDIT\n"));

    expect(() => {
      collabService.applyClientUpdate(
        workspaceId,
        filePath,
        Buffer.from(rogueUpdate!).toString("base64"),
        { id: "viewer-1", role: "viewer" }
      );
    }).toThrow(AppError);

    const session = collabService.getSession(workspaceId, filePath)!;
    expect(session.text.toString()).toBe(initialCode);
  });

  it("6. Device disconnect and reconnect: state vector sync recovers missed updates", async () => {
    const filePath = "sync-recovery.ts";
    fsService.writeFile(workspaceId, filePath, "v1.0.0");

    await collabService.join(workspaceId, filePath, { id: "d1", name: "Device 1", role: "editor" });

    // Client connects and gets initial state
    const clientDoc = new Y.Doc();
    const { updateBase64: init } = collabService.getSyncStep2(workspaceId, filePath);
    Y.applyUpdate(clientDoc, Buffer.from(init, "base64"));

    // Client disconnects (simulated: client stops receiving live updates)
    collabService.leave(workspaceId, filePath, "d1");

    // Other edits happen on host while client is offline
    const session = collabService.getSession(workspaceId, filePath)!;
    session.doc.transact(() => {
      session.text.insert(session.text.length, " -> v1.0.1 -> v1.0.2");
    });

    // Client reconnects: sends its state vector (Step 1)
    const clientStateVector = Y.encodeStateVector(clientDoc);
    const clientStateVectorBase64 = Buffer.from(clientStateVector).toString("base64");

    // Host computes Step 2 diff update containing only missing operations
    const { updateBase64: diffUpdate } = collabService.getSyncStep2(
      workspaceId,
      filePath,
      clientStateVectorBase64
    );

    // Client applies Step 2 update
    Y.applyUpdate(clientDoc, Buffer.from(diffUpdate, "base64"));

    expect(clientDoc.getText("contents").toString()).toBe("v1.0.0 -> v1.0.1 -> v1.0.2");
    expect(clientDoc.getText("contents").toString()).toBe(session.text.toString());
  });

  it("7. Batched writes to host filesystem & final document persistence after disconnect", async () => {
    const filePath = "persist.ts";
    fsService.writeFile(workspaceId, filePath, "Original");

    await collabService.join(workspaceId, filePath, { id: "p1", name: "Perry", role: "editor" });
    const session = collabService.getSession(workspaceId, filePath)!;

    // Make collaborative edit
    session.doc.transact(() => {
      session.text.insert(0, "Updated: ");
    });

    await collabService.flush(workspaceId, filePath);

    // Verify host filesystem has the persisted content
    const diskContent = fsService.readFile(workspaceId, filePath, "utf-8").content;
    expect(diskContent).toBe("Updated: Original");

    // All participants leave
    collabService.leave(workspaceId, filePath, "p1");
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Disk still retains correct final document
    const finalDiskContent = fsService.readFile(workspaceId, filePath, "utf-8").content;
    expect(finalDiskContent).toBe("Updated: Original");
  });

  it("8. External filesystem modification conflict detection and reload/merge workflows", async () => {
    const filePath = "conflict.ts";
    const initialText = "lineA\nlineB\nlineC";
    fsService.writeFile(workspaceId, filePath, initialText);

    await collabService.join(workspaceId, filePath, { id: "c1", name: "Charlie", role: "editor" });
    const session = collabService.getSession(workspaceId, filePath)!;

    // Collaborative editor edits lineB -> lineB_edited
    session.doc.transact(() => {
      session.text.delete(6, 5);
      session.text.insert(6, "lineB_edited");
    });

    // Simulate an external tool (e.g. Git checkout or external editor) modifying the file on disk
    const externalContent = "lineA\nlineB_from_git\nlineC";
    const { fullPath } = fsService.resolveSafePath(workspaceId, filePath);
    fs.writeFileSync(fullPath, externalContent, "utf-8");

    collabService.handleExternalFileChange(workspaceId, filePath);

    expect(session.conflictStatus?.conflictDetected).toBe(true);
    expect(session.conflictStatus?.diskContent).toBe(externalContent);
    expect(session.conflictStatus?.crdtContent).toBe("lineA\nlineB_edited\nlineC");

    // Test Resolution 1: Reload from disk
    const reloadResult = collabService.resolveConflict(workspaceId, filePath, "reload_disk");
    expect(reloadResult.content).toBe(externalContent);
    expect(session.conflictStatus).toBeUndefined();

    // Verify disk still matches
    expect(fsService.readFile(workspaceId, filePath).content).toBe(externalContent);
  });

  it("9. Collaboration roles, awareness, line comments, and proposals", async () => {
    const filePath = "collab-features.ts";
    fsService.writeFile(workspaceId, filePath, "const greeting = 'hi';");

    await collabService.join(workspaceId, filePath, { id: "owner-1", name: "Alice", role: "owner" });
    await collabService.join(workspaceId, filePath, { id: "user-2", name: "Bob", role: "editor" });

    // Awareness: update cursor
    const awareness = collabService.updateAwareness(workspaceId, filePath, "user-2", {
      line: 1,
      col: 7,
      selectionLength: 8,
    });
    expect(awareness?.cursor?.line).toBe(1);
    expect(awareness?.cursor?.col).toBe(7);

    // Line comments: add and list
    const comment = collabService.addComment(
      workspaceId,
      filePath,
      { id: "user-2", name: "Bob" },
      1,
      "Should we change this to hello?"
    );
    expect(comment.id).toBeDefined();
    expect(comment.line).toBe(1);
    expect(collabService.listComments(workspaceId, filePath).length).toBe(1);

    // Resolve comment
    const resolved = collabService.resolveComment(workspaceId, filePath, comment.id);
    expect(resolved).toBe(true);
    expect(collabService.listComments(workspaceId, filePath)[0]!.resolved).toBe(true);

    // Proposals: Viewer proposes change
    await collabService.join(workspaceId, filePath, { id: "viewer-1", name: "Eve", role: "viewer" });
    const proposal = collabService.addProposal(
      workspaceId,
      filePath,
      { id: "viewer-1", name: "Eve" },
      "'hi'",
      "'hello world'"
    );
    expect(proposal.status).toBe("pending");

    // Viewer cannot apply proposal
    expect(() => {
      collabService.applyProposal(workspaceId, filePath, proposal.id, "viewer");
    }).toThrow(AppError);

    // Owner applies proposal
    const applied = collabService.applyProposal(workspaceId, filePath, proposal.id, "owner");
    expect(applied.applied).toBe(true);
    expect(applied.content).toBe("const greeting = 'hello world';");

    // Role assignment & kick
    collabService.assignRole(workspaceId, filePath, "owner", "user-2", "viewer");
    expect(collabService.getSession(workspaceId, filePath)!.participants.get("user-2")?.role).toBe(
      "viewer"
    );

    collabService.kick(workspaceId, filePath, "owner", "user-2");
    expect(collabService.getSession(workspaceId, filePath)!.participants.has("user-2")).toBe(false);
  });

  it("blocks writes from a participant demoted to viewer even if the caller claims editor", async () => {
    const filePath = "demoted.ts";
    fsService.writeFile(workspaceId, filePath, "const a = 1;");
    await collabService.join(workspaceId, filePath, { id: "owner-1", name: "O", role: "owner" });
    await collabService.join(workspaceId, filePath, { id: "ed-1", name: "E", role: "editor" });
    collabService.assignRole(workspaceId, filePath, "owner", "ed-1", "viewer");

    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(collabService.getSession(workspaceId, filePath)!.doc));
    let update: Uint8Array | undefined;
    doc.on("update", (u: Uint8Array) => (update = u));
    doc.getText("contents").insert(0, "// edit\n");

    expect(() =>
      collabService.applyClientUpdate(
        workspaceId,
        filePath,
        Buffer.from(update!).toString("base64"),
        { id: "ed-1", role: "editor" }
      )
    ).toThrow(AppError);
  });

  it("cleans up the session after the last participant is kicked", async () => {
    const filePath = "kicked.ts";
    fsService.writeFile(workspaceId, filePath, "x");
    await collabService.join(workspaceId, filePath, { id: "u-1", name: "U", role: "editor" });
    collabService.kick(workspaceId, filePath, "owner", "u-1");
    await new Promise((r) => setTimeout(r, 200));
    expect(collabService.getSession(workspaceId, filePath)).toBeUndefined();
  });
});
