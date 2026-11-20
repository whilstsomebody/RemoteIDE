import { z } from "zod";

export const DockerPortMappingSchema = z.object({
  hostIp: z.string().optional(),
  hostPort: z.number().int().optional(),
  containerPort: z.number().int(),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});
export type DockerPortMapping = z.infer<typeof DockerPortMappingSchema>;

export const DockerContainerStateSchema = z.enum([
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
]);
export type DockerContainerState = z.infer<typeof DockerContainerStateSchema>;

export const DockerContainerHealthSchema = z.enum(["healthy", "unhealthy", "starting", "none"]);
export type DockerContainerHealth = z.infer<typeof DockerContainerHealthSchema>;

export const DockerContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  imageId: z.string().optional(),
  command: z.string().optional(),
  state: DockerContainerStateSchema,
  status: z.string(),
  created: z.string(),
  ports: z.array(DockerPortMappingSchema),
  health: DockerContainerHealthSchema.default("none"),
  memoryUsageBytes: z.number().optional(),
  memoryLimitBytes: z.number().optional(),
  cpuPercent: z.number().optional(),
  composeProject: z.string().optional(),
  composeService: z.string().optional(),
});
export type DockerContainer = z.infer<typeof DockerContainerSchema>;

export const DockerImageSchema = z.object({
  id: z.string(),
  repository: z.string(),
  tag: z.string(),
  sizeBytes: z.number(),
  created: z.string(),
});
export type DockerImage = z.infer<typeof DockerImageSchema>;

export const DockerNetworkSchema = z.object({
  id: z.string(),
  name: z.string(),
  driver: z.string(),
  scope: z.string(),
});
export type DockerNetwork = z.infer<typeof DockerNetworkSchema>;

export const DockerVolumeSchema = z.object({
  name: z.string(),
  driver: z.string(),
  mountpoint: z.string(),
});
export type DockerVolume = z.infer<typeof DockerVolumeSchema>;

export const DockerComposeServiceSchema = z.object({
  name: z.string(),
  containerId: z.string().optional(),
  image: z.string().optional(),
  status: z.string(),
  state: DockerContainerStateSchema.optional(),
});
export type DockerComposeService = z.infer<typeof DockerComposeServiceSchema>;

export const DockerComposeProjectSchema = z.object({
  name: z.string(),
  configFile: z.string().optional(),
  status: z.string(),
  services: z.array(DockerComposeServiceSchema),
});
export type DockerComposeProject = z.infer<typeof DockerComposeProjectSchema>;

export const DockerOverviewSchema = z.object({
  isAvailable: z.boolean(),
  error: z.string().optional(),
  dockerVersion: z.string().optional(),
  containerCount: z.number().int(),
  runningCount: z.number().int(),
  imageCount: z.number().int(),
  volumeCount: z.number().int(),
  composeCount: z.number().int(),
});
export type DockerOverview = z.infer<typeof DockerOverviewSchema>;

export const DockerContainerActionDtoSchema = z.object({
  containerId: z.string().min(1),
  action: z.enum(["start", "stop", "restart"]),
});
export type DockerContainerActionDto = z.infer<typeof DockerContainerActionDtoSchema>;

export const DockerLogsDtoSchema = z.object({
  containerId: z.string().min(1),
  tail: z.number().int().min(1).max(5000).default(200),
  timestamps: z.boolean().default(false),
  since: z.string().optional(),
});
export type DockerLogsDto = z.infer<typeof DockerLogsDtoSchema>;

export const DockerExecDtoSchema = z.object({
  containerId: z.string().min(1),
  command: z.array(z.string()).min(1),
});
export type DockerExecDto = z.infer<typeof DockerExecDtoSchema>;

