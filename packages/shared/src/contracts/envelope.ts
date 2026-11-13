import { z } from "zod";
import { ErrorCode } from "../errors/app-error.js";

export const ErrorDetailsSchema = z.record(z.unknown());

export const ApiErrorPayloadSchema = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.array(ErrorDetailsSchema).optional(),
  requestId: z.string().optional(),
  timestamp: z.string(),
});

export type ApiErrorPayload = z.infer<typeof ApiErrorPayloadSchema>;

export const ApiSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z
      .object({
        requestId: z.string().optional(),
        correlationId: z.string().optional(),
        timestamp: z.string(),
        pagination: z
          .object({
            total: z.number().int().nonnegative(),
            page: z.number().int().positive(),
            pageSize: z.number().int().positive(),
            hasMore: z.boolean(),
          })
          .optional(),
      })
      .optional(),
  });

export const ApiErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: ApiErrorPayloadSchema,
});

export type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    correlationId?: string;
    timestamp: string;
    pagination?: {
      total: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
    };
  };
};

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export type ApiResponse<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export function createSuccessResponse<T>(
  data: T,
  meta?: {
    requestId?: string;
    correlationId?: string;
    pagination?: {
      total: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
    };
  }
): ApiSuccessEnvelope<T> {
  return {
    success: true,
    data,
    meta: {
      ...meta,
      timestamp: new Date().toISOString(),
    },
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  options?: {
    details?: Record<string, unknown>[];
    requestId?: string;
  }
): ApiErrorEnvelope {
  return {
    success: false,
    error: {
      code,
      message,
      details: options?.details,
      requestId: options?.requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export const createSuccessEnvelope = createSuccessResponse;
export const createErrorEnvelope = createErrorResponse;
