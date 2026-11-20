import fastify, { FastifyInstance, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import websocket from "@fastify/websocket";
import { requestIdPlugin } from "./plugins/requestId.js";
import { errorHandlerPlugin } from "./plugins/errorHandler.js";
import { healthRoutes } from "./routes/health.js";
import { wsRoutes } from "./routes/ws.js";
import { apiV1Routes } from "./routes/api-v1.js";
import { authRoutes } from "./routes/auth.js";
import { shareLinkRoutes } from "./routes/share-links.js";
import { tunnelRoutes } from "./routes/tunnel.js";
import { proxyRoutes } from "./routes/proxy.js";
import { syncRoutes } from "./routes/sync.js";
import { catchupRoutes } from "./routes/catchup.js";
import { redisService } from "./services/redis.service.js";
import { kafkaService } from "./services/kafka.service.js";
import { outboxService } from "./services/outbox.service.js";
import { tunnelRelayService } from "./services/tunnel-relay.service.js";
import { REDIS_CHANNELS } from "@remote-ide/shared";

export async function buildApp(opts: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    disableRequestLogging: true,
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
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return cb(null, true);
      const allowed = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        process.env.CORS_ORIGIN,
      ].filter(Boolean);
      let localOrigin = false;
      try {
        const url = new URL(origin);
        localOrigin = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
      } catch {}
      if (allowed.includes(origin) || localOrigin) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });
  // CORS only controls response visibility; reject untrusted browser origins
  // before side effects and WebSocket upgrades can occur.
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin) return;
    let allowed = origin === process.env.CORS_ORIGIN;
    try {
      const url = new URL(origin);
      allowed ||= url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    } catch {}
    if (!allowed)
      return reply
        .code(403)
        .send({
          success: false,
          error: { code: "FORBIDDEN", message: "Browser origin is not allowed" },
        });
  });
  await app.register(websocket);
  await app.register(requestIdPlugin);
  await app.register(errorHandlerPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(apiV1Routes);
  await app.register(wsRoutes);
  await app.register(authRoutes);
  await app.register(shareLinkRoutes);
  await app.register(tunnelRoutes);
  await app.register(proxyRoutes);
  await app.register(syncRoutes);
  await app.register(catchupRoutes);

  // Background Outbox Worker & Distributed Fan-Out
  outboxService.start(500);

  void redisService.connect();

  // Subscribe to Redis Broadcast Channel for multi-gateway WebSocket fan-out
  void redisService.subscribe(REDIS_CHANNELS.GATEWAY_BROADCAST, (messageStr) => {
    try {
      const payload = JSON.parse(messageStr);
      if (payload && payload.workspaceId) {
        tunnelRelayService.broadcastWorkspaceEvent(payload.workspaceId, payload);
      }
    } catch {
      // Ignore malformed broadcast message
    }
  });

  app.addHook("onClose", async () => {
    outboxService.stop();
    await redisService.close();
    await kafkaService.close();
  });

  return app;
}
