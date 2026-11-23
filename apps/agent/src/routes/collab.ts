import { FastifyPluginAsync } from "fastify";
import {
  CollabDocManagerService,
} from "../services/collab/collab-doc-manager.service.js";
import {
  createSuccessResponse,
  CollabRole,
} from "@remote-ide/shared";

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
      role,
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
      { id: userId, role }
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
      assignerRole,
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

    collabService.kick(workspaceId, relativePath, kickerRole, targetUserId);
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

    const result = collabService.applyProposal(workspaceId, relativePath, proposalId, userRole);
    return reply.send(createSuccessResponse(result));
  });
};
