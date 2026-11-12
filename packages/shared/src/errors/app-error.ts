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

  [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.GATEWAY_TIMEOUT]: 504,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.MESSAGING_ERROR]: 500,
};

export interface ErrorDetails {
  field?: string;
  issue?: string;
  received?: unknown;
  expected?: unknown;
  [key: string]: unknown;
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

