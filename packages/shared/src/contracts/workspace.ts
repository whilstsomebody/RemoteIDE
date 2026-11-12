import { z } from "zod";

export const WorkspaceFolderSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  path: z.string().min(1),
});

export type WorkspaceFolder = z.infer<typeof WorkspaceFolderSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  folders: z.array(WorkspaceFolderSchema).min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  isActive: z.boolean().default(false),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

export const RegisterWorkspaceDtoSchema = z.object({
  name: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1),
});

export type RegisterWorkspaceDto = z.infer<typeof RegisterWorkspaceDtoSchema>;

export const SwitchWorkspaceDtoSchema = z.object({
  workspaceId: z.string().min(1),
});

export type SwitchWorkspaceDto = z.infer<typeof SwitchWorkspaceDtoSchema>;
