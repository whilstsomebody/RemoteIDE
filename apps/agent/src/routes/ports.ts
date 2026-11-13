import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
  ForwardPortDtoSchema,
  TogglePortForwardDtoSchema,
} from "@remote-ide/shared";
import {
  PortForwardingService,
  portForwardingService as defaultPortForwardingService,
} from "../services/port-forwarding.service.js";

export const portRoutes: FastifyPluginAsync<{
  portForwardingService?: PortForwardingService;
}> = async (fastify, opts) => {
  const service = opts.portForwardingService || defaultPortForwardingService;

  // Detect listening ports on host
  fastify.get("/api/v1/ports/detected", async () => {
    const ports = await service.detectListeningPorts();
    return createSuccessResponse(ports);
  });

  // List forwarded ports
  fastify.get("/api/v1/ports", async () => {
    const ports = service.listForwardedPorts();
    return createSuccessResponse(ports);
  });

  // Forward a port
  fastify.post("/api/v1/ports/forward", async (req, reply) => {
    const parse = ForwardPortDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    const forwarded = service.forwardPort(parse.data);
    return createSuccessResponse(forwarded);
  });

  // Toggle port forwarding
  fastify.post("/api/v1/ports/:port/toggle", async (req, reply) => {
    const port = parseInt((req.params as any).port, 10);
    const parse = TogglePortForwardDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    const updated = service.togglePortForward(port, parse.data.enabled);
    return createSuccessResponse(updated);
  });

  // Unforward a port
  fastify.delete("/api/v1/ports/:port", async (req) => {
    const port = parseInt((req.params as any).port, 10);
    service.unforwardPort(port);
    return createSuccessResponse({ success: true });
  });

  // Preview Reverse Proxy endpoint
  fastify.all("/api/v1/preview/:port*", async (req, reply) => {
    const port = parseInt((req.params as any).port, 10);
    const url = req.raw.url || "";
    // Strip /api/v1/preview/:port
    const prefix = `/api/v1/preview/${port}`;
    const subpath = url.startsWith(prefix) ? url.substring(prefix.length) || "/" : "/";

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) {
        headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
      }
    }

    const res = await service.proxyHttpRequest(port, subpath, req.method, headers, req.body);

    for (const [k, v] of Object.entries(res.headers)) {
      reply.header(k, v);
    }

    return reply.status(res.statusCode).send(res.body);
  });
};
