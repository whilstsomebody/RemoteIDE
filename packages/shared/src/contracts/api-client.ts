import { z } from "zod";

export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const ApiAuthTypeSchema = z.enum(["none", "bearer", "basic", "apiKey"]);
export type ApiAuthType = z.infer<typeof ApiAuthTypeSchema>;

export const ApiRequestBodyTypeSchema = z.enum([
  "none",
  "json",
  "text",
  "form-data",
  "x-www-form-urlencoded",
]);
export type ApiRequestBodyType = z.infer<typeof ApiRequestBodyTypeSchema>;

export const ApiKeyValueSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().default(true),
});
export type ApiKeyValue = z.infer<typeof ApiKeyValueSchema>;

export const ExecuteApiRequestDtoSchema = z.object({
  method: HttpMethodSchema.default("GET"),
  url: z.string().min(1, "URL is required"),
  headers: z.array(ApiKeyValueSchema).default([]),
  params: z.array(ApiKeyValueSchema).default([]),
  bodyType: ApiRequestBodyTypeSchema.default("none"),
  bodyRaw: z.string().optional(),
  bodyFormData: z.array(ApiKeyValueSchema).optional(),
  authType: ApiAuthTypeSchema.default("none"),
  authToken: z.string().optional(),
  authUsername: z.string().optional(),
  authPassword: z.string().optional(),
  authKey: z.string().optional(),
  authValue: z.string().optional(),
  authAddTo: z.enum(["header", "query"]).optional().default("header"),
  variables: z.record(z.string()).optional(),
  timeoutMs: z.number().int().min(100).max(60000).default(30000),
});
export type ExecuteApiRequestDto = z.infer<typeof ExecuteApiRequestDtoSchema>;

export const ApiClientResponseSchema = z.object({
  status: z.number().int(),
  statusText: z.string(),
  headers: z.record(z.string()),
  body: z.string(),
  durationMs: z.number().int(),
  sizeBytes: z.number().int(),
  isJson: z.boolean(),
  curlCommand: z.string(),
});
export type ApiClientResponse = z.infer<typeof ApiClientResponseSchema>;

export const ApiCollectionItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  request: ExecuteApiRequestDtoSchema,
});
export type ApiCollectionItem = z.infer<typeof ApiCollectionItemSchema>;

export const ApiCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(ApiCollectionItemSchema).default([]),
});
export type ApiCollection = z.infer<typeof ApiCollectionSchema>;
