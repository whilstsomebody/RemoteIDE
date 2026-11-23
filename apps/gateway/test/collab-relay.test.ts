import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import * as Y from "yjs";
import { CollabRelayService } from "../src/services/collab-relay.service.js";
import { KafkaService } from "../src/services/kafka.service.js";
import { AppError, WsMessageType } from "@remote-ide/shared";

class MockWs extends EventEmitter {
  public readyState = 1; // WebSocket.OPEN
  public sentMessages: string[] = [];

  public send(msg: string) {
    this.sentMessages.push(msg);
  }

  public close(_code?: number, _reason?: string) {
    this.readyState = 3; // WebSocket.CLOSED
    this.emit("close");
  }
}

describe("Phase 11 — Gateway Collaborative Relay Service", () => {
  let collabRelay: CollabRelayService;
  let kafkaService: KafkaService;
  const workspaceId = "ws-relay-test";
  const filePath = "src/main.ts";

  beforeEach(() => {
    kafkaService = new KafkaService({ enableFallback: true });
    collabRelay = new CollabRelayService(kafkaService);
  });

  it("1. Client join: creates room, registers participant, and returns Step 2 sync payload", () => {
    const ws = new MockWs() as any;

    const res = collabRelay.join(
      ws,
      { workspaceId, filePath },
      { id: "sess-1", userId: "user-1", name: "Alice", role: "owner" }
    );

    expect(res.participant.id).toBe("user-1");
    expect(res.participant.name).toBe("Alice");
    expect(res.participant.role).toBe("owner");
    expect(res.participants.length).toBe(1);
    expect(res.syncUpdateBase64).toBeDefined();
  });

  it("2. Two editors: updates from Editor 1 are broadcast to Editor 2 and converge", () => {
    const ws1 = new MockWs() as any;
    const ws2 = new MockWs() as any;

    collabRelay.join(
      ws1,
      { workspaceId, filePath },
      { id: "sess-1", userId: "user-1", name: "Alice", role: "editor" }
    );
    collabRelay.join(
      ws2,
      { workspaceId, filePath },
      { id: "sess-2", userId: "user-2", name: "Bob", role: "editor" }
    );

    const c1 = new Y.Doc();
    const t1 = c1.getText("contents");
    let updateBytes: Uint8Array;
    c1.on("update", (u) => (updateBytes = u));
    c1.transact(() => t1.insert(0, "Hello Gateway Collab"));

    collabRelay.handleUpdate(
      ws1,
      {
        workspaceId,
        filePath,
        update: Buffer.from(updateBytes!).toString("base64"),
      },
      { role: "editor", userId: "user-1" }
    );

    const broadcastMsgStr = ws2.sentMessages.find((m: string) =>
      m.includes(WsMessageType.COLLAB_UPDATE)
    );
    expect(broadcastMsgStr).toBeDefined();

    const broadcastMsg = JSON.parse(broadcastMsgStr!);
    expect(broadcastMsg.payload.update).toBe(Buffer.from(updateBytes!).toString("base64"));
    expect(broadcastMsg.payload.userId).toBe("user-1");

    // ws1 should NOT have received its own update back
    const ws1ReceivedSelf = ws1.sentMessages.some((m: string) =>
      m.includes(WsMessageType.COLLAB_UPDATE)
    );
    expect(ws1ReceivedSelf).toBe(false);
  });

  it("3. Viewer attempting write is rejected and update is dropped", () => {
    const wsViewer = new MockWs() as any;

    collabRelay.join(
      wsViewer,
      { workspaceId, filePath },
      { id: "sess-viewer", userId: "viewer-1", name: "Auditor", role: "viewer" }
    );

    expect(() => {
      collabRelay.handleUpdate(
        wsViewer,
        {
          workspaceId,
          filePath,
          update: Buffer.from(new Uint8Array([1, 2, 3])).toString("base64"),
        },
        { role: "viewer", userId: "viewer-1" }
      );
    }).toThrow(AppError);

    const errorMsgStr = wsViewer.sentMessages.find((m: string) =>
      m.includes("UNAUTHORIZED_WRITE")
    );
    expect(errorMsgStr).toBeDefined();
  });

  it("4. Awareness updates: remote cursors and selection ranges fan out", () => {
    const ws1 = new MockWs() as any;
    const ws2 = new MockWs() as any;

    collabRelay.join(
      ws1,
      { workspaceId, filePath },
      { id: "sess-1", userId: "user-1", name: "Alice", role: "editor" }
    );
    collabRelay.join(
      ws2,
      { workspaceId, filePath },
      { id: "sess-2", userId: "user-2", name: "Bob", role: "editor" }
    );

    collabRelay.handleAwareness(ws1, {
      workspaceId,
      filePath,
      cursor: { line: 15, col: 4, selectionLength: 10 },
      followingParticipantId: "user-2",
    });

    const awarenessMsg = ws2.sentMessages.find((m: string) =>
      m.includes(WsMessageType.COLLAB_AWARENESS) && m.includes('"line":15')
    );
    expect(awarenessMsg).toBeDefined();
    const parsed = JSON.parse(awarenessMsg!);
    expect(parsed.payload.cursor.line).toBe(15);
    expect(parsed.payload.cursor.col).toBe(4);
    expect(parsed.payload.followingParticipantId).toBe("user-2");
  });

  it("5. Role assignment and Owner-controlled participant kick", () => {
    const wsOwner = new MockWs() as any;
    const wsTarget = new MockWs() as any;

    collabRelay.join(
      wsOwner,
      { workspaceId, filePath },
      { id: "sess-owner", userId: "owner-1", name: "Alice", role: "owner" }
    );
    collabRelay.join(
      wsTarget,
      { workspaceId, filePath },
      { id: "sess-target", userId: "target-1", name: "Bob", role: "editor" }
    );

    expect(() => {
      collabRelay.handleRoleAssign(
        wsTarget,
        { workspaceId, filePath, targetUserId: "target-1", newRole: "viewer" },
        { role: "editor" }
      );
    }).toThrow(AppError);

    collabRelay.handleRoleAssign(
      wsOwner,
      { workspaceId, filePath, targetUserId: "target-1", newRole: "viewer" },
      { role: "owner" }
    );

    const room = collabRelay.getRoom(workspaceId, filePath)!;
    const targetParticipant = room.participants.get(wsTarget);
    expect(targetParticipant?.role).toBe("viewer");

    collabRelay.handleKick(
      wsOwner,
      { workspaceId, filePath, targetUserId: "target-1" },
      { role: "owner" }
    );

    const kickMsg = wsTarget.sentMessages.find((m: string) => m.includes(WsMessageType.COLLAB_KICK));
    expect(kickMsg).toBeDefined();

    expect(room.participants.has(wsTarget)).toBe(false);
  });

  it("6. Demoted, kicked, or never-joined sockets cannot submit edits", () => {
    const wsOwner = new MockWs() as any;
    const wsTarget = new MockWs() as any;
    const wsOutsider = new MockWs() as any;
    const update = Buffer.from(Y.encodeStateAsUpdate(new Y.Doc())).toString("base64");

    collabRelay.join(wsOwner, { workspaceId, filePath }, { id: "s-o", userId: "owner-1", role: "owner" });
    collabRelay.join(wsTarget, { workspaceId, filePath }, { id: "s-t", userId: "target-1", role: "editor" });

    collabRelay.handleRoleAssign(
      wsOwner,
      { workspaceId, filePath, targetUserId: "target-1", newRole: "viewer" },
      { role: "owner" }
    );
    expect(() =>
      collabRelay.handleUpdate(wsTarget, { workspaceId, filePath, update }, { role: "editor", userId: "target-1" })
    ).toThrow(AppError);

    collabRelay.handleKick(wsOwner, { workspaceId, filePath, targetUserId: "target-1" }, { role: "owner" });
    expect(() =>
      collabRelay.handleUpdate(wsTarget, { workspaceId, filePath, update }, { role: "editor", userId: "target-1" })
    ).toThrow(AppError);

    expect(() =>
      collabRelay.handleUpdate(wsOutsider, { workspaceId, filePath, update }, { role: "editor", userId: "outsider" })
    ).toThrow(AppError);
  });
});
