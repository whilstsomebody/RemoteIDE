import { z } from "zod";

export const Pm2ProcessSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  pid: z.number().int().optional(),
  status: z.enum(["online", "stopping", "stopped", "launching", "errored", "one-launch-status"]),
  cpuPercent: z.number(),
  memoryBytes: z.number(),
  uptimeSeconds: z.number(),
  restarts: z.number().int(),
});
export type Pm2Process = z.infer<typeof Pm2ProcessSchema>;

export const Pm2OverviewSchema = z.object({
  isAvailable: z.boolean(),
  error: z.string().optional(),
  processes: z.array(Pm2ProcessSchema),
});
export type Pm2Overview = z.infer<typeof Pm2OverviewSchema>;

export const SshProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number().int().default(22),
  username: z.string(),
  authType: z.enum(["key", "agent", "password"]).default("key"),
  status: z.enum(["configured", "connected", "error"]).default("configured"),
  lastTestedAt: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type SshProfile = z.infer<typeof SshProfileSchema>;

export const KubernetesContextSchema = z.object({
  name: z.string(),
  cluster: z.string(),
  user: z.string(),
  namespace: z.string().optional(),
  isCurrent: z.boolean().default(false),
});
export type KubernetesContext = z.infer<typeof KubernetesContextSchema>;

export const KubernetesOverviewSchema = z.object({
  isAvailable: z.boolean(),
  error: z.string().optional(),
  currentContext: z.string().optional(),
  contexts: z.array(KubernetesContextSchema),
});
export type KubernetesOverview = z.infer<typeof KubernetesOverviewSchema>;

export const DevOpsOverviewSchema = z.object({
  pm2: Pm2OverviewSchema,
  kubernetes: KubernetesOverviewSchema,
  sshProfiles: z.array(SshProfileSchema),
  composeCount: z.number().int(),
});
export type DevOpsOverview = z.infer<typeof DevOpsOverviewSchema>;

