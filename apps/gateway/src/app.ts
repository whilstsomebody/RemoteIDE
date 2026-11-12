import fastify, { FastifyInstance, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import websocket from "@fastify/websocket";
import { requestIdPlugin } from "./plugins/requestId.js";
import { errorHandlerPlugin } from "./plugins/errorHandler.js";
import { healthRoutes } from "./routes/health.js";
import { wsRoutes } from "./routes/ws.js";
import { apiV1Routes } from "./routes/api-v1.js";

export async function buildApp(opts: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
          };
        },
      },
    },
    ...opts,
  });

  // Plugins
  await app.register(sensible);
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(websocket);
  await app.register(requestIdPlugin);
  await app.register(errorHandlerPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(apiV1Routes);
  await app.register(wsRoutes);

  return app;
}

