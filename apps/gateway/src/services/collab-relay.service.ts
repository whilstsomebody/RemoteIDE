import { WebSocket } from "ws";
import * as Y from "yjs";
import path from "node:path";
import {
  AppError,
  ErrorCode,
  CollabRole,
  CollabParticipant,
  CollabComment,
  CollabProposedChange,
  CollabConflictStatus,
  getParticipantColor,
  WsMessageType,
  createWsMessage,
  DomainEventType,
  KafkaTopic,
  DurableEvent,
} from "@remote-ide/shared";
import { kafkaService as defaultKafkaService, KafkaService } from "./kafka.service.js";
import { logger } from "@remote-ide/shared";

export interface CollabRoomParticipant extends CollabParticipant {
  sessionId: string;
  socket: WebSocket;
}

export interface CollabRoom {
  workspaceId: string;
  filePath: string;
  doc: Y.Doc;
  participants: Map<WebSocket, CollabRoomParticipant>;
  comments: CollabComment[];
  proposals: CollabProposedChange[];
  conflictStatus?: CollabConflictStatus;
}

export class CollabRelayService {
  private rooms = new Map<string, CollabRoom>();
  private socketToRooms = new Map<WebSocket, Set<string>>();
  private kafkaService: KafkaService;

  constructor(kafkaService?: KafkaService) {
    this.kafkaService = kafkaService || defaultKafkaService;
  }

  public getRoomKey(workspaceId: string, filePath: string): string {
    return `${workspaceId}:${path.normalize(filePath)}`;
  }

  public getOrCreateRoom(workspaceId: string, filePath: string): CollabRoom {
    const key = this.getRoomKey(workspaceId, filePath);
    let room = this.rooms.get(key);

    if (!room) {
      const doc = new Y.Doc();
      room = {
        workspaceId,
        filePath: path.normalize(filePath),
        doc,
        participants: new Map(),
        comments: [],
        proposals: [],
      };
      this.rooms.set(key, room);

      this.publishMilestone(DomainEventType.COLLAB_SESSION_STARTED, {
        workspaceId,
        filePath: room.filePath,
        timestamp: new Date().toISOString(),
      });
    }

    return room;
  }

  public getRoom(workspaceId: string, filePath: string): CollabRoom | undefined {
    return this.rooms.get(this.getRoomKey(workspaceId, filePath));
  }

  public join(
    socket: WebSocket,
    payload: { workspaceId: string; filePath: string; clientStateVector?: string },
    session: { id: string; userId: string; role: CollabRole; deviceName?: string; name?: string }
  ): {
    participant: CollabParticipant;
    syncUpdateBase64: string;
    participants: CollabParticipant[];
    conflictStatus?: CollabConflictStatus;
  } {
    const room = this.getOrCreateRoom(payload.workspaceId, payload.filePath);

    room.participants.delete(socket);

    const participant: CollabRoomParticipant = {
      id: session.userId,
      name: session.name || session.deviceName || `User-${session.userId.slice(0, 5)}`,
      color: getParticipantColor(session.userId),
      role: session.role,
      deviceId: session.deviceName,
      joinedAt: new Date().toISOString(),
      sessionId: session.id,
      socket,
    };

    room.participants.set(socket, participant);

    // Track room for socket disconnect cleanup
    let userRooms = this.socketToRooms.get(socket);
    if (!userRooms) {
      userRooms = new Set();
      this.socketToRooms.set(socket, userRooms);
    }
    userRooms.add(this.getRoomKey(payload.workspaceId, payload.filePath));

    // Generate Step 2 sync update
    let updateBytes: Uint8Array;
    if (payload.clientStateVector) {
      const stateVector = Buffer.from(payload.clientStateVector, "base64");
      updateBytes = Y.encodeStateAsUpdate(room.doc, stateVector);
    } else {
      updateBytes = Y.encodeStateAsUpdate(room.doc);
    }
    const syncUpdateBase64 = Buffer.from(updateBytes).toString("base64");

    const participantsList = Array.from(room.participants.values()).map(
      ({ socket: _s, sessionId: _sess, ...p }) => p
    );

    this.broadcastToRoom(
      room,
      createWsMessage(WsMessageType.COLLAB_AWARENESS, {
        workspaceId: room.workspaceId,
        filePath: room.filePath,
        participant: {
          id: participant.id,
          name: participant.name,
          color: participant.color,
          role: participant.role,
        },
        participants: participantsList,
      }),
      socket // exclude self
    );

    this.publishMilestone(DomainEventType.COLLAB_PARTICIPANT_JOINED, {
      workspaceId: room.workspaceId,
      filePath: room.filePath,
      userId: participant.id,
      role: participant.role,
      participantCount: room.participants.size,
    });

    return {
      participant,
      syncUpdateBase64,
      participants: participantsList,
      conflictStatus: room.conflictStatus,
    };
  }

  /**
   * Handles an incoming Yjs document update from a client.
   * STRICT SECURITY: Read-only Viewers are blocked immediately.
   */
  public handleUpdate(
    socket: WebSocket,
    payload: { workspaceId: string; filePath: string; update: string },
    session: { role: CollabRole; userId: string }
  ): { applied: boolean } {
    if (session.role === "viewer") {
      socket.send(
        JSON.stringify(
          createWsMessage(WsMessageType.ERROR, {
            code: "UNAUTHORIZED_WRITE",
            message: "Viewers are not permitted to submit document modifications",
          })
        )
      );
      throw new AppError(
        ErrorCode.FORBIDDEN,
        "Viewers are not permitted to submit document modifications"
      );
    }

    const room = this.getRoom(payload.workspaceId, payload.filePath);
    if (!room) {
      throw new AppError(ErrorCode.BAD_REQUEST, "No active collaborative room for file");
    }

    const updateBytes = Buffer.from(payload.update, "base64");
    Y.applyUpdate(room.doc, updateBytes, session.userId);

    this.broadcastToRoom(
      room,
      createWsMessage(WsMessageType.COLLAB_UPDATE, {
        workspaceId: room.workspaceId,
        filePath: room.filePath,
        update: payload.update,
        userId: session.userId,
      }),
      socket // exclude sender
    );

    return { applied: true };
  }

  public handleAwareness(
    socket: WebSocket,
    payload: {
      workspaceId: string;
      filePath: string;
      cursor?: {
        line: number;
        col: number;
        selectionLength?: number;
        anchor?: number;
        head?: number;
      };
      followingParticipantId?: string;
    }
  ): void {
    const room = this.getRoom(payload.workspaceId, payload.filePath);
    if (!room) return;

    const participant = room.participants.get(socket);
    if (!participant) return;

    if (payload.cursor !== undefined) {
      participant.cursor = payload.cursor;
    }
    if (payload.followingParticipantId !== undefined) {
      participant.followingParticipantId = payload.followingParticipantId || undefined;
    }

    this.broadcastToRoom(
      room,
      createWsMessage(WsMessageType.COLLAB_AWARENESS, {
        workspaceId: room.workspaceId,
        filePath: room.filePath,
        userId: participant.id,
        cursor: participant.cursor,
        followingParticipantId: participant.followingParticipantId,
      }),
      socket // exclude sender
    );
  }

  /**
   * Handles participant role assignment.
   * Only Document Owner can assign roles.
   */
  public handleRoleAssign(
    socket: WebSocket,
    payload: {
      workspaceId: string;
      filePath: string;
      targetUserId: string;
      newRole: CollabRole;
    },
    session: { role: CollabRole }
  ): void {
    if (session.role !== "owner") {
      socket.send(
        JSON.stringify(
          createWsMessage(WsMessageType.ERROR, {
            code: "FORBIDDEN",
            message: "Only the document owner can change roles",
          })
        )
      );
      throw new AppError(ErrorCode.FORBIDDEN, "Only the document owner can change roles");
    }

    const room = this.getRoom(payload.workspaceId, payload.filePath);
    if (!room) return;

    for (const [ws, participant] of room.participants.entries()) {
      if (participant.id === payload.targetUserId) {
        participant.role = payload.newRole;
        ws.send(
          JSON.stringify(
            createWsMessage(WsMessageType.COLLAB_ROLE_ASSIGNED, {
              workspaceId: room.workspaceId,
              filePath: room.filePath,
              userId: participant.id,
              role: payload.newRole,
            })
          )
        );
      }
    }

    const participantsList = Array.from(room.participants.values()).map(
      ({ socket: _s, sessionId: _sess, ...p }) => p
    );
    this.broadcastToRoom(
      room,
      createWsMessage(WsMessageType.COLLAB_AWARENESS, {
        workspaceId: room.workspaceId,
        filePath: room.filePath,
        participants: participantsList,
      })
    );

    this.publishMilestone(DomainEventType.COLLAB_ROLE_CHANGED, {
      workspaceId: room.workspaceId,
      filePath: room.filePath,
      targetUserId: payload.targetUserId,
      newRole: payload.newRole,
    });
  }

  /**
   * Removes/kicks a participant from the collaborative session.
   * Only Document Owner can kick participants.
   */
  public handleKick(
    socket: WebSocket,
    payload: { workspaceId: string; filePath: string; targetUserId: string },
    session: { role: CollabRole }
  ): void {
    if (session.role !== "owner") {
      socket.send(
        JSON.stringify(
          createWsMessage(WsMessageType.ERROR, {
            code: "FORBIDDEN",
            message: "Only the document owner can remove participants",
          })
        )
      );
      throw new AppError(ErrorCode.FORBIDDEN, "Only the document owner can remove participants");
    }

    const room = this.getRoom(payload.workspaceId, payload.filePath);
    if (!room) return;

    for (const [ws, participant] of Array.from(room.participants.entries())) {
      if (participant.id === payload.targetUserId) {
        ws.send(
          JSON.stringify(
            createWsMessage(WsMessageType.COLLAB_KICK, {
              workspaceId: room.workspaceId,
              filePath: room.filePath,
              reason: "Removed by session owner",
            })
          )
        );
        room.participants.delete(ws);
      }
    }

    const participantsList = Array.from(room.participants.values()).map(
      ({ socket: _s, sessionId: _sess, ...p }) => p
    );
    this.broadcastToRoom(
      room,
      createWsMessage(WsMessageType.COLLAB_AWARENESS, {
        workspaceId: room.workspaceId,
        filePath: room.filePath,
        participants: participantsList,
      })
    );

    this.publishMilestone(DomainEventType.COLLAB_PARTICIPANT_LEFT, {
      workspaceId: room.workspaceId,
      filePath: room.filePath,
      userId: payload.targetUserId,
      kicked: true,
      participantCount: room.participants.size,
    });
  }

  public handleLeave(socket: WebSocket, workspaceId: string, filePath: string): void {
    const room = this.getRoom(workspaceId, filePath);
    if (!room) return;

    const participant = room.participants.get(socket);
    room.participants.delete(socket);

    const userRooms = this.socketToRooms.get(socket);
    if (userRooms) {
      userRooms.delete(this.getRoomKey(workspaceId, filePath));
    }

    if (participant) {
      const participantsList = Array.from(room.participants.values()).map(
        ({ socket: _s, sessionId: _sess, ...p }) => p
      );
      this.broadcastToRoom(
        room,
        createWsMessage(WsMessageType.COLLAB_AWARENESS, {
          workspaceId: room.workspaceId,
          filePath: room.filePath,
          leftUserId: participant.id,
          participants: participantsList,
        })
      );

      this.publishMilestone(DomainEventType.COLLAB_PARTICIPANT_LEFT, {
        workspaceId: room.workspaceId,
        filePath: room.filePath,
        userId: participant.id,
        participantCount: room.participants.size,
      });
    }
  }

  public handleDisconnect(socket: WebSocket): void {
    const userRooms = this.socketToRooms.get(socket);
    if (!userRooms) return;

    for (const key of Array.from(userRooms)) {
      const room = this.rooms.get(key);
      if (room) {
        this.handleLeave(socket, room.workspaceId, room.filePath);
      }
    }
    this.socketToRooms.delete(socket);
  }

  public broadcastToRoom(room: CollabRoom, message: unknown, excludeSocket?: WebSocket): void {
    const serialized = typeof message === "string" ? message : JSON.stringify(message);
    for (const [ws] of room.participants.entries()) {
      if (ws !== excludeSocket && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(serialized);
        } catch (err) {
          logger.warn({ err }, "Failed to send message to collaborative participant");
        }
      }
    }
  }

  /**
   * Publishes durable collaborative milestone events to Kafka.
   * (CRDT character keystrokes are never published to Kafka, only high-level milestones).
   */
  private publishMilestone(type: string, data: Record<string, unknown>): void {
    try {
      const event: DurableEvent = {
        id: "evt-" + Math.random().toString(36).slice(2, 10),
        version: 1,
        type,
        hostId: "gateway",
        workspaceId: (data.workspaceId as string) || "global",
        actorId: "collab",
        timestamp: new Date().toISOString(),
        payload: data,
      };

      void this.kafkaService.publishEvent(KafkaTopic.WORKSPACE_EVENTS, event);
    } catch (err) {
      logger.warn({ err, type }, "Failed to publish collaborative milestone to Kafka");
    }
  }
}

export const collabRelayService = new CollabRelayService();
