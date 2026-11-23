import { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  CollabDocManagerService,
} from "../services/collab/collab-doc-manager.service.js";
import {
  createSuccessResponse,
  CollabRole,
  UserRole,
} from "@remote-ide/shared";

const COLLAB_ROLE_RANK: Record<CollabRole, number> = { viewer: 0, editor: 1, owner: 2 };

// Tunneled requests carry the gateway session role in x-remoteide-role (set by the tunnel
// transport from the authenticated context); direct loopback callers are the host owner.
function sessionCollabRole(req: FastifyRequest): CollabRole {
  const header = req.headers["x-remoteide-role"];
  if (header === undefined) return "owner";
  if (header === UserRole.OWNER) return "owner";
  if (header === UserRole.VIEWER) return "viewer";
  if (
    header === UserRole.OPERATOR ||
    header === UserRole.DEVELOPER ||
    header === UserRole.EDITOR
  ) {
    return "editor";
  }
  return "viewer";
}

// Body-supplied roles are client assertions, so never let them exceed the session's role.
function effectiveRole(req: FastifyRequest, requested: CollabRole | undefined): CollabRole {
  const sessionRole = sessionCollabRole(req);
  if (!requested || !(requested in COLLAB_ROLE_RANK)) return sessionRole;
  return COLLAB_ROLE_RANK[requested] <= COLLAB_ROLE_RANK[sessionRole] ? requested : sessionRole;
}

export interface CollabRoutesOptions {
  collabService: CollabDocManagerService;
}

export const collabRoutes: FastifyPluginAsync<CollabRoutesOptions> = async (
  fastify,
  opts
) => {
  const { collabService } = opts;

  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/v1/workspaces/:workspaceId/collab/sessions",
    async (_req, reply) => {
      const active = collabService.getActiveSessions();
      return reply.send(createSuccessResponse(active));
    }
  );

  fastify.get<{
    Params: { workspaceId: string };
    Querystring: { path: string };
  }>("/api/v1/workspaces/:workspaceId/collab/status", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath } = req.query;
    const session = collabService.getSession(workspaceId, relativePath);

    if (!session) {
      return reply.send(createSuccessResponse({ active: false }));
    }

    return reply.send(
      createSuccessResponse({
        active: true,
        participantCount: session.participants.size,
        participants: Array.from(session.participants.values()),
        isDirty: session.isDirty,
        conflictDetected: !!session.conflictStatus?.conflictDetected,
        conflictStatus: session.conflictStatus,
      })
    );
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: { path: string; userId: string; name?: string; role?: CollabRole; deviceId?: string };
  }>("/api/v1/workspaces/:workspaceId/collab/join", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, userId, name, role = "editor", deviceId } = req.body;

    const result = await collabService.join(workspaceId, relativePath, {
      id: userId,
      name: name || "Collaborator",
      role: effectiveRole(req, role),
      deviceId,
    });

    return reply.send(
      createSuccessResponse({
        participant: result.participant,
        syncUpdateBase64: result.syncUpdateBase64,
        participants: Array.from(result.session.participants.values()),
        conflictStatus: result.session.conflictStatus,
      })
    );
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: { path: string; userId: string };
  }>("/api/v1/workspaces/:workspaceId/collab/leave", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, userId } = req.body;

    const result = collabService.leave(workspaceId, relativePath, userId);
    return reply.send(createSuccessResponse(result));
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: { path: string; stateVector?: string };
  }>("/api/v1/workspaces/:workspaceId/collab/sync", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, stateVector } = req.body;

    const result = collabService.getSyncStep2(workspaceId, relativePath, stateVector);
    return reply.send(createSuccessResponse(result));
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: { path: string; update: string; userId: string; role: CollabRole };
  }>("/api/v1/workspaces/:workspaceId/collab/update", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, update, userId, role } = req.body;

    const result = collabService.applyClientUpdate(
      workspaceId,
      relativePath,
      update,
      { id: userId, role: effectiveRole(req, role) }
    );

    return reply.send(createSuccessResponse(result));
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: {
      path: string;
      userId: string;
      cursor?: {
        line: number;
        col: number;
        selectionLength?: number;
        anchor?: number;
        head?: number;
      };
      followingParticipantId?: string;
    };
  }>("/api/v1/workspaces/:workspaceId/collab/awareness", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, userId, cursor, followingParticipantId } = req.body;

    const participant = collabService.updateAwareness(
      workspaceId,
      relativePath,
      userId,
      cursor,
      followingParticipantId
    );

    return reply.send(createSuccessResponse({ participant }));
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: {
      path: string;
      assignerRole: CollabRole;
      targetUserId: string;
      newRole: CollabRole;
    };
  }>("/api/v1/workspaces/:workspaceId/collab/role-assign", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, assignerRole, targetUserId, newRole } = req.body;

    const participant = collabService.assignRole(
      workspaceId,
      relativePath,
      effectiveRole(req, assignerRole),
      targetUserId,
      newRole
    );

    return reply.send(createSuccessResponse({ participant }));
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: { path: string; kickerRole: CollabRole; targetUserId: string };
  }>("/api/v1/workspaces/:workspaceId/collab/kick", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, kickerRole, targetUserId } = req.body;

    collabService.kick(workspaceId, relativePath, effectiveRole(req, kickerRole), targetUserId);
    return reply.send(createSuccessResponse({ success: true }));
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: {
      path: string;
      resolution: "reload_disk" | "force_crdt" | "merge";
    };
  }>("/api/v1/workspaces/:workspaceId/collab/resolve-conflict", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, resolution } = req.body;

    const result = collabService.resolveConflict(workspaceId, relativePath, resolution);
    return reply.send(createSuccessResponse(result));
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: {
      path: string;
      line: number;
      text: string;
      userId: string;
      userName: string;
    };
  }>("/api/v1/workspaces/:workspaceId/collab/comments", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, line, text, userId, userName } = req.body;

    const comment = collabService.addComment(
      workspaceId,
      relativePath,
      { id: userId, name: userName },
      line,
      text
    );

    return reply.send(createSuccessResponse({ comment }));
  });

  fastify.get<{
    Params: { workspaceId: string };
    Querystring: { path: string };
  }>("/api/v1/workspaces/:workspaceId/collab/comments", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath } = req.query;

    const comments = collabService.listComments(workspaceId, relativePath);
    return reply.send(createSuccessResponse({ comments }));
  });

  fastify.post<{
    Params: { workspaceId: string };
    Body: {
      path: string;
      originalText: string;
      proposedText: string;
      userId: string;
      userName: string;
    };
  }>("/api/v1/workspaces/:workspaceId/collab/proposals", async (req, reply) => {
    const { workspaceId } = req.params;
    const { path: relativePath, originalText, proposedText, userId, userName } = req.body;

    const proposal = collabService.addProposal(
      workspaceId,
      relativePath,
      { id: userId, name: userName },
      originalText,
      proposedText
    );

    return reply.send(createSuccessResponse({ proposal }));
  });

  fastify.post<{
    Params: { workspaceId: string; proposalId: string };
    Body: { path: string; userRole: CollabRole };
  }>("/api/v1/workspaces/:workspaceId/collab/proposals/:proposalId/apply", async (req, reply) => {
    const { workspaceId, proposalId } = req.params;
    const { path: relativePath, userRole } = req.body;

    const result = collabService.applyProposal(
      workspaceId,
      relativePath,
      proposalId,
      effectiveRole(req, userRole)
    );
    return reply.send(createSuccessResponse(result));
  });
};
