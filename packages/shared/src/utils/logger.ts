export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  hostId?: string;
  service?: string;
  [key: string]: unknown;
}

export interface StructuredLogEntry {
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  time: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export function formatStructuredLog(
  level: StructuredLogEntry["level"],
  message: string,
  context?: LogContext,
  error?: Error
): string {
  const entry: StructuredLogEntry = {
    level,
    time: new Date().toISOString(),
    message,
    context,
    ...(error
      ? {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: (error as { code?: string }).code,
          },
        }
      : {}),
  };
  return JSON.stringify(entry);
}
