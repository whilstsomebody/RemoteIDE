import { FastifyPluginAsync } from "fastify";
import { createSuccessResponse } from "@remote-ide/shared";

export const apiV1Routes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1", async (request) => {
    return createSuccessResponse(
      {
        name: "RemoteIDE Gateway API",
        version: "v1",
        documentation: "/docs",
        endpoints: {
          health: "/api/v1/health",
          websocket: "/api/v1/ws",
        },
      },
      {
        requestId: request.requestId,
        correlationId: request.correlationId,
      }
    );
  });
};
