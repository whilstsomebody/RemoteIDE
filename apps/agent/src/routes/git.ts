import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
  GitStageDtoSchema,
  GitUnstageDtoSchema,
  GitDiscardDtoSchema,
  GitCommitDtoSchema,
  GitCheckoutDtoSchema,
  GitDeleteBranchDtoSchema,
  GitPushDtoSchema,
  GitPullDtoSchema,
  GitStashDtoSchema,
} from "@remote-ide/shared";
import { GitService, gitService as defaultGitService } from "../services/git.service.js";

export const gitRoutes: FastifyPluginAsync<{ gitService?: GitService }> = async (fastify, opts) => {
  const service = opts.gitService || defaultGitService;

  // Helper to extract repo path from query or body
  const getRepoPath = (req: any): string => {
    const p = req.query?.path || req.body?.repoPath || process.cwd();
    return String(p);
  };

  // Status
  fastify.get("/api/v1/git/status", async (req) => {
    const repoPath = getRepoPath(req);
    const status = await service.getStatus(repoPath);
    return createSuccessResponse(status);
  });

  // Diff
  fastify.get("/api/v1/git/diff", async (req) => {
    const repoPath = getRepoPath(req);
    const file = (req.query as any)?.file as string | undefined;
    const staged = (req.query as any)?.staged === "true";
    const diff = await service.getDiff(repoPath, file, staged);
    return createSuccessResponse(diff);
  });

  // History / Log
  fastify.get("/api/v1/git/history", async (req) => {
    const repoPath = getRepoPath(req);
    const limit = parseInt((req.query as any)?.limit || "50", 10);
    const history = await service.getHistory(repoPath, limit);
    return createSuccessResponse(history);
  });

  // Branches
  fastify.get("/api/v1/git/branches", async (req) => {
    const repoPath = getRepoPath(req);
    const branches = await service.getBranches(repoPath);
    return createSuccessResponse(branches);
  });

  // Blame
  fastify.get("/api/v1/git/blame", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const file = (req.query as any)?.file as string;
    if (!file) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.BAD_REQUEST, "File path is required for git blame."));
    }
    const blame = await service.blame(repoPath, file);
    return createSuccessResponse(blame);
  });

  // Stage
  fastify.post("/api/v1/git/stage", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const parse = GitStageDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    await service.stage(repoPath, parse.data.paths, parse.data.all);
    return createSuccessResponse({ success: true });
  });

  // Unstage
  fastify.post("/api/v1/git/unstage", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const parse = GitUnstageDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    await service.unstage(repoPath, parse.data.paths, parse.data.all);
    return createSuccessResponse({ success: true });
  });

  // Discard (Destructive)
  fastify.post("/api/v1/git/discard", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const parse = GitDiscardDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    await service.discard(repoPath, parse.data.paths, parse.data.confirmed);
    return createSuccessResponse({ success: true });
  });

  // Commit
  fastify.post("/api/v1/git/commit", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const parse = GitCommitDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    const commit = await service.commit(repoPath, parse.data.message, parse.data.amend);
    return createSuccessResponse(commit);
  });

  // Checkout / Switch Branch
  fastify.post("/api/v1/git/checkout", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const parse = GitCheckoutDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    await service.checkout(repoPath, parse.data.branch, parse.data.createNew);
    return createSuccessResponse({ success: true });
  });

  // Delete Branch (Destructive)
  fastify.post("/api/v1/git/branch/delete", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const parse = GitDeleteBranchDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    await service.deleteBranch(repoPath, parse.data.branch, parse.data.force, parse.data.confirmed);
    return createSuccessResponse({ success: true });
  });

  // Fetch
  fastify.post("/api/v1/git/fetch", async (req) => {
    const repoPath = getRepoPath(req);
    const remote = (req.body as any)?.remote || "origin";
    await service.fetch(repoPath, remote);
    return createSuccessResponse({ success: true });
  });

  // Pull
  fastify.post("/api/v1/git/pull", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const parse = GitPullDtoSchema.safeParse(req.body || {});
    if (!parse.success) return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    await service.pull(repoPath, parse.data?.remote || "origin", parse.data?.branch);
    return createSuccessResponse({ success: true });
  });

  // Push (Force push requires confirmation)
  fastify.post("/api/v1/git/push", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const parse = GitPushDtoSchema.safeParse(req.body || {});
    if (!parse.success) return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    await service.push(
      repoPath,
      parse.data?.remote || "origin",
      parse.data?.branch,
      parse.data?.force,
      parse.data?.confirmed
    );
    return createSuccessResponse({ success: true });
  });

  // Stash
  fastify.post("/api/v1/git/stash", async (req, reply) => {
    const repoPath = getRepoPath(req);
    const parse = GitStashDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    const entries = await service.stash(
      repoPath,
      parse.data.action,
      parse.data.message,
      parse.data.index
    );
    return createSuccessResponse(entries);
  });
};
