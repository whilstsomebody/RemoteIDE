import { z } from "zod";

export type CollabRole = "owner" | "editor" | "viewer";

export interface CollabParticipant {
  id: string;
  name: string;
  color: string;
  role: CollabRole;
  deviceId?: string;
  joinedAt: string;
  cursor?: {
    line: number;
    col: number;
    selectionLength?: number;
    anchor?: number;
    head?: number;
  };
  followingParticipantId?: string;
}

export interface CollabComment {
  id: string;
  workspaceId: string;
  filePath: string;
  line: number;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  resolved?: boolean;
}

export interface CollabProposedChange {
  id: string;
  workspaceId: string;
  filePath: string;
  authorId: string;
  authorName: string;
  originalText: string;
  proposedText: string;
  status: "pending" | "applied" | "rejected";
  createdAt: string;
}

export interface CollabConflictStatus {
  workspaceId: string;
  filePath: string;
  conflictDetected: boolean;
  diskMtime: string;
  crdtMtime: string;
  diskContent?: string;
  crdtContent?: string;
}

export const CollabJoinPayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  clientStateVector: z.string().optional(), // base64
});

export const CollabSyncStep1PayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  stateVector: z.string(), // base64
});

export const CollabSyncStep2PayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  update: z.string(), // base64
  participants: z.array(z.any()),
  eTag: z.string().optional(),
});

export const CollabUpdatePayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  update: z.string(), // base64
});

export const CollabAwarenessPayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  cursor: z
    .object({
      line: z.number(),
      col: z.number(),
      selectionLength: z.number().optional(),
      anchor: z.number().optional(),
      head: z.number().optional(),
    })
    .optional(),
  followingParticipantId: z.string().optional(),
});

export const CollabRoleRequestPayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  requestedRole: z.enum(["editor"]),
});

export const CollabRoleAssignPayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  targetUserId: z.string(),
  newRole: z.enum(["owner", "editor", "viewer"]),
});

export const CollabKickPayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  targetUserId: z.string(),
  reason: z.string().optional(),
});

export const CollabResolveConflictPayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  resolution: z.enum(["reload_disk", "force_crdt", "merge"]),
});

export const CollabCommentPayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  line: z.number(),
  text: z.string().min(1),
});

export const CollabProposalPayloadSchema = z.object({
  workspaceId: z.string(),
  filePath: z.string(),
  originalText: z.string(),
  proposedText: z.string(),
});

export const COLLAB_PRESET_COLORS = [
  "#38bdf8", // Sky blue
  "#34d399", // Emerald green
  "#f472b6", // Pink
  "#fbbf24", // Amber
  "#a78bfa", // Purple
  "#fb923c", // Orange
  "#2dd4bf", // Teal
  "#818cf8", // Indigo
  "#f87171", // Coral red
  "#a3e635", // Lime
];

export function getParticipantColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLLAB_PRESET_COLORS.length;
  return COLLAB_PRESET_COLORS[index]!;
}

