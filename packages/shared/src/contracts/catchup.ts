import { z } from "zod";

// 1. Device Registration & Identification

export enum DeviceType {
  DESKTOP = "desktop",
  LAPTOP = "laptop",
  TABLET = "tablet",
  MOBILE = "mobile",
  BROWSER = "browser",
}

export const RegisteredDeviceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  deviceName: z.string(),
  deviceType: z.nativeEnum(DeviceType).default(DeviceType.BROWSER),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RegisteredDevice = z.infer<typeof RegisteredDeviceSchema>;

export const RegisterDeviceDtoSchema = z.object({
  deviceId: z.string().min(1).max(128),
  deviceName: z.string().min(1).max(128).default("Remote Device"),
  deviceType: z.nativeEnum(DeviceType).default(DeviceType.BROWSER),
});
export type RegisterDeviceDto = z.infer<typeof RegisterDeviceDtoSchema>;

// 2. Inactivity & Presence States

export enum DevicePresenceState {
  ACTIVE = "active",
  INACTIVE = "inactive",
  BACKGROUND = "background",
  DISCONNECTED = "disconnected",
}

export const DevicePresenceDtoSchema = z.object({
  deviceId: z.string(),
  workspaceId: z.string().optional(),
  state: z.nativeEnum(DevicePresenceState),
  timestamp: z.string().optional(),
});
export type DevicePresenceDto = z.infer<typeof DevicePresenceDtoSchema>;

// 3. Compacted Changelog Entities

export interface FileCreatedChange {
  path: string;
  revision: number;
  timestamp: string;
  sizeBytes?: number;
}

export interface FileModifiedChange {
  path: string;
  count: number;
  firstRevision: number;
  lastRevision: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

export interface FileRenamedChange {
  fromPath: string;
  toPath: string;
  revision: number;
  timestamp: string;
}

export interface FileDeletedChange {
  path: string;
  revision: number;
  timestamp: string;
}

export interface GitChangelogItem {
  commitHash?: string;
  branch?: string;
  message?: string;
  author?: string;
  revision: number;
  timestamp: string;
}

export interface JobChangelogItem {
  jobId: string;
  jobName?: string;
  command?: string;
  finalStatus: "running" | "completed" | "failed" | "stopped";
  exitCode?: number;
  revision: number;
  timestamp: string;
}

export interface ProcessChangelogItem {
  processId: string;
  processName?: string;
  finalStatus: "running" | "stopped" | "crashed" | "restarted";
  exitCode?: number;
  revision: number;
  timestamp: string;
}

export interface SessionChangelogItem {
  type: string;
  description: string;
  actorId: string;
  revision: number;
  timestamp: string;
}

export interface ActivityHistoryItem {
  eventId: string;
  revision: number;
  eventType: string;
  timestamp: string;
  actorId: string;
  description: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface NetChangeSummary {
  filesCreated: FileCreatedChange[];
  filesModified: FileModifiedChange[];
  filesRenamed: FileRenamedChange[];
  filesDeleted: FileDeletedChange[];
  gitChanges: GitChangelogItem[];
  jobs: JobChangelogItem[];
  processes: ProcessChangelogItem[];
  sessionEvents: SessionChangelogItem[];
}

export const CatchupSummarySchema = z.object({
  deliveryId: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string().optional(),
  deviceId: z.string(),
  fromRevision: z.number().int().nonnegative(),
  toRevision: z.number().int().nonnegative(),
  timeWindow: z.object({
    from: z.string(),
    to: z.string(),
  }),
  totalEvents: z.number().int().nonnegative(),
  totalFilesAffected: z.number().int().nonnegative(),
  historyExpired: z.boolean().default(false),
  reconciliationRequired: z.boolean().default(false),
  netChanges: z.object({
    filesCreated: z.array(z.any()),
    filesModified: z.array(z.any()),
    filesRenamed: z.array(z.any()),
    filesDeleted: z.array(z.any()),
    gitChanges: z.array(z.any()),
    jobs: z.array(z.any()),
    processes: z.array(z.any()),
    sessionEvents: z.array(z.any()),
  }),
  activityHistory: z.array(z.any()),
});
export type CatchupSummary = {
  deliveryId: string;
  workspaceId: string;
  workspaceName?: string;
  deviceId: string;
  fromRevision: number;
  toRevision: number;
  timeWindow: {
    from: string;
    to: string;
  };
  totalEvents: number;
  totalFilesAffected: number;
  historyExpired: boolean;
  reconciliationRequired?: boolean;
  netChanges: NetChangeSummary;
  activityHistory: ActivityHistoryItem[];
};

// 4. Acknowledgement & Cursors

export const CatchupAckDtoSchema = z.object({
  deliveryId: z.string().min(1),
  workspaceId: z.string().min(1),
  deviceId: z.string().min(1),
});
export type CatchupAckDto = z.infer<typeof CatchupAckDtoSchema>;

export const CatchupAckResultSchema = z.object({
  acknowledged: z.boolean(),
  success: z.boolean().optional(),
  deliveryId: z.string(),
  acknowledgedRevision: z.number().int().nonnegative(),
  currentRevision: z.number().int().nonnegative(),
});
export type CatchupAckResult = z.infer<typeof CatchupAckResultSchema>;

// 5. Retention Configuration

export enum EventRetentionDuration {
  DAY_1 = 1,
  DAYS_3 = 3,
  DAYS_7 = 7,
  DAYS_30 = 30,
}

export const EventRetentionPolicySchema = z.object({
  workspaceId: z.string(),
  retentionDays: z.number().int().min(1).max(365).default(7),
  auditRetentionDays: z.number().int().min(30).max(3650).default(90),
  oldestRetainedRevision: z.number().int().nonnegative().default(0),
  updatedAt: z.string(),
});
export type EventRetentionPolicy = z.infer<typeof EventRetentionPolicySchema>;

export const UpdateRetentionDtoSchema = z.object({
  workspaceId: z.string().min(1),
  retentionDays: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(30)]),
});
export type UpdateRetentionDto = z.infer<typeof UpdateRetentionDtoSchema>;

// 6. File Diff Inspection

export const FileDiffQuerySchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  fromRevision: z.coerce.number().int().nonnegative().optional(),
  toRevision: z.coerce.number().int().nonnegative().optional(),
});
export type FileDiffQuery = z.infer<typeof FileDiffQuerySchema>;

export interface FileDiffResult {
  path: string;
  workspaceId: string;
  fromRevision?: number;
  toRevision?: number;
  originalContent: string;
  currentContent: string;
  diffHunks: string[];
  isBinary: boolean;
}
