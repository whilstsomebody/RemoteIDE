import { z } from "zod";

export enum UserRole {
  OWNER = "owner",
  COLLABORATOR = "collaborator",
  VIEWER = "viewer",
}

export enum Permission {
  FS_READ = "fs:read",
  FS_WRITE = "fs:write",
  FS_DELETE = "fs:delete",
  TERMINAL_READ = "terminal:read",
  TERMINAL_WRITE = "terminal:write",
  PROCESS_SPAWN = "process:spawn",
  PROCESS_KILL = "process:kill",
  PORT_FORWARD = "port:forward",
  SETTINGS_WRITE = "settings:write",
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.OWNER]: [
    Permission.FS_READ,
    Permission.FS_WRITE,
    Permission.FS_DELETE,
    Permission.TERMINAL_READ,
    Permission.TERMINAL_WRITE,
    Permission.PROCESS_SPAWN,
    Permission.PROCESS_KILL,
    Permission.PORT_FORWARD,
    Permission.SETTINGS_WRITE,
  ],
  [UserRole.COLLABORATOR]: [
    Permission.FS_READ,
    Permission.FS_WRITE,
    Permission.TERMINAL_READ,
    Permission.TERMINAL_WRITE,
    Permission.PROCESS_SPAWN,
  ],
  [UserRole.VIEWER]: [Permission.FS_READ, Permission.TERMINAL_READ],
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
