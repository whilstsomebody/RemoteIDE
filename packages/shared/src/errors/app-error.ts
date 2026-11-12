import { z } from "zod";

export enum ErrorCode {
  // Generic / Client Errors
  BAD_REQUEST = "BAD_REQUEST",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  RATE_LIMITED = "RATE_LIMITED",
  REQUEST_TIMEOUT = "REQUEST_TIMEOUT",

  // Host / Agent Errors
  HOST_DISCONNECTED = "HOST_DISCONNECTED",
  HOST_UNREACHABLE = "HOST_UNREACHABLE",
  CAPABILITY_NOT_SUPPORTED = "CAPABILITY_NOT_SUPPORTED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  PATH_NOT_ALLOWED = "PATH_NOT_ALLOWED",

  // Workspace & Filesystem Errors
  WORKSPACE_NOT_FOUND = "WORKSPACE_NOT_FOUND",
  WORKSPACE_ALREADY_EXISTS = "WORKSPACE_ALREADY_EXISTS",
  INVALID_WORKSPACE_PATH = "INVALID_WORKSPACE_PATH",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  FILE_ALREADY_EXISTS = "FILE_ALREADY_EXISTS",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  FILE_IS_BINARY = "FILE_IS_BINARY",
  SYMLINK_ESCAPE_DETECTED = "SYMLINK_ESCAPE_DETECTED",
  CONCURRENCY_CONFLICT = "CONCURRENCY_CONFLICT",
  CANNOT_DELETE_ROOT = "CANNOT_DELETE_ROOT",
  OPERATION_FAILED = "OPERATION_FAILED",

  // Server / Internal Errors
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  GATEWAY_TIMEOUT = "GATEWAY_TIMEOUT",
  DATABASE_ERROR = "DATABASE_ERROR",
  MESSAGING_ERROR = "MESSAGING_ERROR",
}

export const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.REQUEST_TIMEOUT]: 408,

  [ErrorCode.HOST_DISCONNECTED]: 503,
  [ErrorCode.HOST_UNREACHABLE]: 504,
  [ErrorCode.CAPABILITY_NOT_SUPPORTED]: 400,
  [ErrorCode.PERMISSION_DENIED]: 403,
  [ErrorCode.PATH_NOT_ALLOWED]: 403,

  [ErrorCode.WORKSPACE_NOT_FOUND]: 404,
  [ErrorCode.WORKSPACE_ALREADY_EXISTS]: 409,
  [ErrorCode.INVALID_WORKSPACE_PATH]: 400,
  [ErrorCode.FILE_NOT_FOUND]: 404,
  [ErrorCode.FILE_ALREADY_EXISTS]: 409,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.FILE_IS_BINARY]: 422,
  [ErrorCode.SYMLINK_ESCAPE_DETECTED]: 403,
  [ErrorCode.CONCURRENCY_CONFLICT]: 409,
  [ErrorCode.CANNOT_DELETE_ROOT]: 400,
  [ErrorCode.OPERATION_FAILED]: 500,

  [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.GATEWAY_TIMEOUT]: 504,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.MESSAGING_ERROR]: 500,
};

export interface ErrorDetails {
  field?: string;
  issue?: string;
  code?: string;
  received?: unknown;
  expected?: unknown;
  [key: string]: unknown;
}

export function formatZodIssues(issues: z.ZodIssue[]): ErrorDetails[] {
  return issues.map((issue) => ({
    field: issue.path.join("."),
    issue: issue.message,
    code: issue.code,
  }));
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: ErrorDetails[];
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      details?: ErrorDetails[];
      cause?: unknown;
      isOperational?: boolean;
    }
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = options?.statusCode ?? HTTP_STATUS_BY_ERROR_CODE[code] ?? 500;
    this.details = options?.details;
    this.isOperational = options?.isOperational ?? true;

    if (options?.cause) {
      this.cause = options.cause;
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
