import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { AppError, ErrorCode, createErrorResponse } from "@remote-ide/shared";

interface ExtendedError extends Error {
  statusCode?: number;
  validation?: Array<{ message?: string; instancePath?: string }>;
}

const errorHandlerPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.setNotFoundHandler((request, reply) => {
    return reply.status(404).send(
      createErrorResponse(ErrorCode.NOT_FOUND, `Route ${request.method}:${request.url} not found`, {
        requestId: request.requestId,
      })
    );
  });

  fastify.setErrorHandler((rawError, request, reply) => {
    const error = (
      rawError instanceof Error ? rawError : new Error(String(rawError))
    ) as ExtendedError;

    request.log.error(
      {
        err: error,
        requestId: request.requestId,
        correlationId: request.correlationId,
        url: request.raw.url,
        method: request.raw.method,
      },
      "API Error occurred"
    );

    if (rawError instanceof AppError) {
      return reply.status(rawError.statusCode).send(
        createErrorResponse(rawError.code, rawError.message, {
          details: rawError.details,
          requestId: request.requestId,
        })
      );
    }

    // Fastify schema validation errors
    if (error.validation && Array.isArray(error.validation)) {
      const issues = error.validation.map((val) => ({
        field: val.instancePath || "body",
        issue: val.message || "Invalid input",
      }));

      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, error.message || "Validation failed", {
          details: issues,
          requestId: request.requestId,
        })
      );
    }

    const statusCode =
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;
    const errorCode = statusCode === 404 ? ErrorCode.NOT_FOUND : ErrorCode.INTERNAL_SERVER_ERROR;

    return reply.status(statusCode).send(
      createErrorResponse(errorCode, error.message || "Internal server error", {
        requestId: request.requestId,
      })
    );
  });
};

export const errorHandlerPlugin = fp(errorHandlerPluginImpl, {
  name: "errorHandlerPlugin",
});
