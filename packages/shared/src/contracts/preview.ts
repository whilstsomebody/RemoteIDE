import { z } from "zod";

export const ForwardedPortSchema = z.object({
  port: z.number().int().min(1024).max(65535),
  label: z.string().default("Web Preview"),
  protocol: z.enum(["http", "https", "ws"]).default("http"),
  enabled: z.boolean().default(true),
  targetHost: z.string().default("127.0.0.1"),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  sessionRestricted: z.boolean().default(false),
  activeConnections: z.number().int().default(0),
  detectedService: z.string().optional(),
});
export type ForwardedPort = z.infer<typeof ForwardedPortSchema>;

export const DetectedPortSchema = z.object({
  port: z.number().int().min(1024).max(65535),
  processName: z.string().optional(),
  pid: z.number().int().optional(),
});
export type DetectedPort = z.infer<typeof DetectedPortSchema>;

export const ForwardPortDtoSchema = z.object({
  port: z.number().int().min(1024).max(65535),
  label: z.string().max(64).optional().default("Web Preview"),
  protocol: z.enum(["http", "https", "ws"]).optional().default("http"),
  expiresInSeconds: z.number().int().min(60).max(86400).optional(),
});
export type ForwardPortDto = z.infer<typeof ForwardPortDtoSchema>;

export const TogglePortForwardDtoSchema = z.object({
  enabled: z.boolean(),
});
export type TogglePortForwardDto = z.infer<typeof TogglePortForwardDtoSchema>;
