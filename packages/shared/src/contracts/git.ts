import { z } from "zod";

export const GitFileChangeStatusSchema = z.enum([
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "conflicted",
  "untracked",
]);
export type GitFileChangeStatus = z.infer<typeof GitFileChangeStatusSchema>;

export const GitFileChangeSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  status: GitFileChangeStatusSchema,
  staged: z.boolean(),
});
export type GitFileChange = z.infer<typeof GitFileChangeSchema>;

export const GitStatusSchema = z.object({
  branch: z.string(),
  tracking: z.string().optional(),
  ahead: z.number().int().default(0),
  behind: z.number().int().default(0),
  isClean: z.boolean(),
  staged: z.array(GitFileChangeSchema),
  unstaged: z.array(GitFileChangeSchema),
  untracked: z.array(z.string()),
  conflicts: z.array(z.string()),
});
export type GitStatus = z.infer<typeof GitStatusSchema>;

export const GitCommitSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  author: z.string(),
  email: z.string(),
  date: z.string(),
  message: z.string(),
});
export type GitCommit = z.infer<typeof GitCommitSchema>;

export const GitBranchSchema = z.object({
  name: z.string(),
  current: z.boolean(),
  remote: z.boolean(),
  upstream: z.string().optional(),
});
export type GitBranch = z.infer<typeof GitBranchSchema>;

export const GitDiffHunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  header: z.string(),
  lines: z.array(z.string()),
});
export type GitDiffHunk = z.infer<typeof GitDiffHunkSchema>;

export const GitDiffFileSchema = z.object({
  file: z.string(),
  oldPath: z.string().optional(),
  staged: z.boolean(),
  diff: z.string(),
  hunks: z.array(GitDiffHunkSchema),
});
export type GitDiffFile = z.infer<typeof GitDiffFileSchema>;

export const GitBlameLineSchema = z.object({
  lineNumber: z.number(),
  commit: z.string(),
  author: z.string(),
  date: z.string(),
  content: z.string(),
});
export type GitBlameLine = z.infer<typeof GitBlameLineSchema>;

export const GitStashEntrySchema = z.object({
  index: z.number(),
  message: z.string(),
  date: z.string(),
});
export type GitStashEntry = z.infer<typeof GitStashEntrySchema>;

// DTO Schemas
export const GitStageDtoSchema = z.object({
  paths: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});
export type GitStageDto = z.infer<typeof GitStageDtoSchema>;

export const GitUnstageDtoSchema = z.object({
  paths: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});
export type GitUnstageDto = z.infer<typeof GitUnstageDtoSchema>;

export const GitDiscardDtoSchema = z.object({
  paths: z.array(z.string()),
  confirmed: z.boolean().refine((val) => val === true, {
    message: "Confirmation is required to discard changes.",
  }),
});
export type GitDiscardDto = z.infer<typeof GitDiscardDtoSchema>;

export const GitCommitDtoSchema = z.object({
  message: z.string().min(1, "Commit message cannot be empty"),
  amend: z.boolean().optional(),
});
export type GitCommitDto = z.infer<typeof GitCommitDtoSchema>;

export const GitCheckoutDtoSchema = z.object({
  branch: z.string().min(1),
  createNew: z.boolean().optional(),
});
export type GitCheckoutDto = z.infer<typeof GitCheckoutDtoSchema>;

export const GitDeleteBranchDtoSchema = z.object({
  branch: z.string().min(1),
  force: z.boolean().optional(),
  confirmed: z.boolean().refine((val) => val === true, {
    message: "Confirmation is required to delete a branch.",
  }),
});
export type GitDeleteBranchDto = z.infer<typeof GitDeleteBranchDtoSchema>;

export const GitPushDtoSchema = z.object({
  remote: z.string().optional().default("origin"),
  branch: z.string().optional(),
  force: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});
export type GitPushDto = z.infer<typeof GitPushDtoSchema>;

export const GitPullDtoSchema = z.object({
  remote: z.string().optional().default("origin"),
  branch: z.string().optional(),
});
export type GitPullDto = z.infer<typeof GitPullDtoSchema>;

export const GitStashDtoSchema = z.object({
  action: z.enum(["push", "pop", "drop", "list"]),
  message: z.string().optional(),
  index: z.number().int().optional(),
});
export type GitStashDto = z.infer<typeof GitStashDtoSchema>;
