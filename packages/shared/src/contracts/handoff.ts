import { z } from "zod";

export type DeviceFormFactor = "phone" | "tablet" | "desktop";

export const DeviceFormFactorSchema = z.enum(["phone", "tablet", "desktop"]);

export const ActiveDeviceSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  name: z.string(),
  type: DeviceFormFactorSchema,
  ipAddress: z.string(),
  userAgent: z.string(),
  lastActiveAt: z.string(),
  isCurrent: z.boolean(),
});

export type ActiveDevice = z.infer<typeof ActiveDeviceSchema>;

export const WorkspaceLayoutSnapshotSchema = z.object({
  activeWorkspaceId: z.string(),
  workspaceName: z.string(),
  openFilePaths: z.array(z.string()).default([]),
  activeFilePath: z.string().nullable().default(null),
  cursorPosition: z
    .object({
      line: z.number().int().default(1),
      col: z.number().int().default(1),
    })
    .optional(),
  activeTab: z.string().default("editor"),
  isSplit: z.boolean().default(false),
  terminalSessionIds: z.array(z.string()).default([]),
  activeDebugSessionId: z.string().optional(),
});

export type WorkspaceLayoutSnapshot = z.infer<typeof WorkspaceLayoutSnapshotSchema>;

export const CreateHandoffDtoSchema = z.object({
  targetDeviceId: z.string().optional(),
  layout: WorkspaceLayoutSnapshotSchema,
  expiresInSeconds: z.number().int().min(60).max(3600).default(600), // 10 minutes default
});

export type CreateHandoffDto = z.infer<typeof CreateHandoffDtoSchema>;

export const HandoffPayloadSchema = z.object({
  id: z.string(),
  sourceDeviceId: z.string(),
  sourceDeviceName: z.string(),
  sourceDeviceType: DeviceFormFactorSchema,
  targetDeviceId: z.string().optional(),
  userId: z.string(),
  layout: WorkspaceLayoutSnapshotSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
});

export type HandoffPayload = z.infer<typeof HandoffPayloadSchema>;

export function detectDeviceFormFactor(userAgent: string): DeviceFormFactor {
  const ua = userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return "tablet";
  }
  if (
    /mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop|android.*mobile/i.test(ua)
  ) {
    return "phone";
  }
  return "desktop";
}
