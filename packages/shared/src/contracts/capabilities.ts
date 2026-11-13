import { z } from "zod";

export enum UserRole {
  OWNER = "owner",
  OPERATOR = "operator",
  DEVELOPER = "developer",
  EDITOR = "editor",
  VIEWER = "viewer",
  COLLABORATOR = "editor", // backwards-compatibility alias
}

export enum Permission {
  FS_READ = "fs:read",
  FS_WRITE = "fs:write",
  FS_DELETE = "fs:delete",
  FS_TRANSFER = "fs:transfer",
  GIT_OPERATION = "git:operation",
  TASK_EXECUTE = "task:execute",
  TERMINAL_ACCESS = "terminal:access",
  TERMINAL_EXECUTE = "terminal:execute",
  PROCESS_CONTROL = "process:control",
  PORT_FORWARD = "port:forward",

  // Legacy aliases
  TERMINAL_READ = "terminal:read",
  TERMINAL_WRITE = "terminal:write",
  PROCESS_SPAWN = "process:spawn",
  PROCESS_KILL = "process:kill",
  SETTINGS_WRITE = "settings:write",
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.OWNER]: [
    Permission.FS_READ,
    Permission.FS_WRITE,
    Permission.FS_DELETE,
    Permission.FS_TRANSFER,
    Permission.GIT_OPERATION,
    Permission.TASK_EXECUTE,
    Permission.TERMINAL_ACCESS,
    Permission.TERMINAL_EXECUTE,
    Permission.PROCESS_CONTROL,
    Permission.PORT_FORWARD,
    Permission.TERMINAL_READ,
    Permission.TERMINAL_WRITE,
    Permission.PROCESS_SPAWN,
    Permission.PROCESS_KILL,
    Permission.SETTINGS_WRITE,
  ],
  [UserRole.OPERATOR]: [
    Permission.FS_READ,
    Permission.FS_WRITE,
    Permission.FS_DELETE,
    Permission.FS_TRANSFER,
    Permission.GIT_OPERATION,
    Permission.TASK_EXECUTE,
    Permission.PROCESS_CONTROL,
    Permission.PORT_FORWARD,
    Permission.PROCESS_SPAWN,
    Permission.PROCESS_KILL,
  ],
  [UserRole.DEVELOPER]: [
    Permission.FS_READ,
    Permission.FS_WRITE,
    Permission.FS_DELETE,
    Permission.FS_TRANSFER,
    Permission.GIT_OPERATION,
    Permission.TASK_EXECUTE,
  ],
  [UserRole.EDITOR]: [Permission.FS_READ, Permission.FS_WRITE, Permission.FS_TRANSFER],
  [UserRole.VIEWER]: [Permission.FS_READ],
};

export const HostAgentCapabilitiesSchema = z.object({
  version: z.string(),
  os: z.object({
    platform: z.enum(["darwin", "linux", "win32"]),
    arch: z.string(),
    release: z.string(),
    hostname: z.string(),
  }),
  runtime: z.object({
    nodeVersion: z.string(),
    shellPath: z.string(),
  }),
  features: z.object({
    fileWatching: z.boolean(),
    terminalPty: z.boolean(),
    processManagement: z.boolean(),
    gitIntegration: z.boolean(),
    sqliteJournal: z.boolean(),
    reverseTunnel: z.boolean(),
  }),
  limits: z.object({
    maxOpenFiles: z.number().int().positive(),
    maxFileSizeMb: z.number().int().positive(),
    maxTerminals: z.number().int().positive(),
    allowedPaths: z.array(z.string()),
    deniedPaths: z.array(z.string()),
  }),
});

export type HostAgentCapabilities = z.infer<typeof HostAgentCapabilitiesSchema>;

export const SessionAuthorizationContractSchema = z.object({
  sessionId: z.string(),
  hostId: z.string(),
  userId: z.string(),
  role: z.nativeEnum(UserRole),
  permissions: z.array(z.nativeEnum(Permission)),
  projectRoot: z.string(),
  allowedPaths: z.array(z.string()),
  expiresAt: z.string(),
});

export type SessionAuthorizationContract = z.infer<typeof SessionAuthorizationContractSchema>;

export function hasPermission(required: Permission, granted: Permission[]): boolean {
  return granted.includes(required);
}

export function roleHasPermission(role: UserRole, required: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(required);
}
