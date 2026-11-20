import { describe, it, expect, beforeEach } from "vitest";
import * as Y from "yjs";
import { CollabClient } from "../src/lib/collab/collab-client";
import { localCollabOrigin } from "../src/lib/collab/yjs-collab-extension";
import {
  CollabParticipant,
  WsMessageType,
} from "@remote-ide/shared";

class MockClientWs {
  public readyState = 1; // WebSocket.OPEN
  public sentMessages: string[] = [];

  public send(msg: string) {
    this.sentMessages.push(msg);
  }

  public close() {
    this.readyState = 3;
  }
}

describe("Phase 11 — Web CollabClient & CodeMirror Extension", () => {
  let mockWs: MockClientWs;
  const workspaceId = "ws-web-test";
  const filePath = "app.ts";

  beforeEach(() => {
    mockWs = new MockClientWs();
  });

  it("1. CollabClient initializes, sends COLLAB_JOIN with state vector, and applies initial sync", () => {
    let participantsReceived: CollabParticipant[] = [];

    const client = new CollabClient({
      workspaceId,
      filePath,
      currentUserId: "user-alpha",
      currentUserName: "Alpha",
      role: "editor",
      ws: mockWs as any,
      onParticipantsChange: (p) => (participantsReceived = p),
    });

    // Check that COLLAB_JOIN was sent
    expect(mockWs.sentMessages.length).toBe(1);
    const joinMsg = JSON.parse(mockWs.sentMessages[0]!);
    expect(joinMsg.type).toBe(WsMessageType.COLLAB_JOIN);
    expect(joinMsg.payload.filePath).toBe(filePath);
    expect(joinMsg.payload.clientStateVector).toBeDefined();

    // Server sends COLLAB_JOINED with initial text
    const serverDoc = new Y.Doc();
    serverDoc.getText("contents").insert(0, "function main() {}");
    const serverSyncUpdate = Buffer.from(Y.encodeStateAsUpdate(serverDoc)).toString("base64");

    client.handleWsMessage(WsMessageType.COLLAB_JOINED, {
      workspaceId,
      filePath,
      syncUpdateBase64: serverSyncUpdate,
      participants: [
        { id: "user-alpha", name: "Alpha", color: "#38bdf8", role: "editor", joinedAt: "" },
        { id: "user-beta", name: "Beta", color: "#34d399", role: "editor", joinedAt: "" },
      ],
    });

    expect(client.yText.toString()).toBe("function main() {}");
    expect(participantsReceived.length).toBe(2);
    expect(client.participants.length).toBe(2);

    client.destroy();
  });

  it("2. Local edits dispatch COLLAB_UPDATE while remote updates apply without echo loops", () => {
    const client = new CollabClient({
      workspaceId,
      filePath,
      currentUserId: "user-alpha",
      currentUserName: "Alpha",
      role: "editor",
      ws: mockWs as any,
    });

    mockWs.sentMessages = []; // clear join message

    // Local edit via transaction
    client.doc.transact(() => {
      client.yText.insert(0, "// Local comment\n");
    }, localCollabOrigin);

    // Verify COLLAB_UPDATE was sent
    expect(mockWs.sentMessages.length).toBe(1);
    const updateMsg = JSON.parse(mockWs.sentMessages[0]!);
    expect(updateMsg.type).toBe(WsMessageType.COLLAB_UPDATE);
    expect(updateMsg.payload.update).toBeDefined();

    // Ingest remote update from user-beta
    const remoteDoc = new Y.Doc();
    const remoteText = remoteDoc.getText("contents");
    let remoteUpdate: Uint8Array;
    remoteDoc.on("update", (u) => (remoteUpdate = u));
    remoteDoc.transact(() => remoteText.insert(0, "console.log('hi');"));

    client.handleWsMessage(WsMessageType.COLLAB_UPDATE, {
      workspaceId,
      filePath,
      update: Buffer.from(remoteUpdate!).toString("base64"),
      userId: "user-beta",
    });

    expect(client.yText.toString()).toContain("console.log('hi');");

    client.destroy();
  });

  it("3. Awareness & Cursor following: tracks active participants and triggers follow callback", () => {
    let followedUser: string | null = null;
    let followedLine = 0;
    let followedCol = 0;

    const client = new CollabClient({
      workspaceId,
      filePath,
      currentUserId: "user-alpha",
      currentUserName: "Alpha",
      role: "editor",
      ws: mockWs as any,
      onFollowCursor: (targetId, line, col) => {
        followedUser = targetId;
        followedLine = line;
        followedCol = col;
      },
    });

    client.participants = [
      { id: "user-beta", name: "Beta", color: "#34d399", role: "editor", joinedAt: "" },
    ];

    // Follow user-beta
    client.followParticipant("user-beta");
    expect(client.followingParticipantId).toBe("user-beta");

    // Receive awareness message where user-beta moves to line 42, col 10
    client.handleWsMessage(WsMessageType.COLLAB_AWARENESS, {
      workspaceId,
      filePath,
      userId: "user-beta",
      cursor: { line: 42, col: 10, selectionLength: 5 },
    });

    expect(followedUser).toBe("user-beta");
    expect(followedLine).toBe(42);
    expect(followedCol).toBe(10);

    const betaParticipant = client.participants.find((p) => p.id === "user-beta");
    expect(betaParticipant?.cursor?.line).toBe(42);
    expect(betaParticipant?.cursor?.selectionLength).toBe(5);

    client.destroy();
  });

  it("4. Viewer role: cannot submit document updates", () => {
    const client = new CollabClient({
      workspaceId,
      filePath,
      currentUserId: "user-viewer",
      currentUserName: "Viewer Only",
      role: "viewer",
      ws: mockWs as any,
    });

    mockWs.sentMessages = [];

    // Attempt local edit
    client.doc.transact(() => {
      client.yText.insert(0, "Illegal edit");
    }, Symbol.for("local-collab"));

    // No COLLAB_UPDATE should be sent over WebSocket
    const updateSent = mockWs.sentMessages.some((m) => m.includes(WsMessageType.COLLAB_UPDATE));
    expect(updateSent).toBe(false);

    client.destroy();
  });
});
