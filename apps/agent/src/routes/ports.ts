import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
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

  fastify.get("/api/v1/ports/detected", async () => {
    const ports = await service.detectListeningPorts();
    return createSuccessResponse(ports);
  });

  fastify.get("/api/v1/ports", async () => {
    const ports = service.listForwardedPorts();
    return createSuccessResponse(ports);
  });

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

  fastify.delete("/api/v1/ports/:port", async (req) => {
    const port = parseInt((req.params as any).port, 10);
    service.unforwardPort(port);
    return createSuccessResponse({ success: true });
  });

  const handlePreview = async (req: FastifyRequest, reply: FastifyReply) => {
    const rawPort = (req.params as { port: string }).port;
    if (!/^\d{1,5}$/.test(rawPort)) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.BAD_REQUEST, "Invalid preview port"));
    }
    const port = parseInt(rawPort, 10);
    const url = req.raw.url || "";
    const prefix = `/api/v1/preview/${rawPort}`;
    const rest = url.startsWith(prefix) ? url.substring(prefix.length) : "";
    const subpath = rest.startsWith("/") || rest.startsWith("?") ? rest : `/${rest}`;

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) {
        headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
      }
    }

    const res = await service.proxyHttpRequest(port, subpath, req.method, headers, req.body);

    for (const [k, v] of Object.entries(res.headers)) {
      // The body is fully buffered, so upstream framing headers no longer apply.
      if (["transfer-encoding", "connection", "keep-alive", "content-length"].includes(k)) continue;
      reply.header(k, v);
    }

    return reply.status(res.statusCode).send(res.body);
  };

  // A ":port*" pattern names the parameter "port*" and never matches sub-paths, so the
  // root and the wildcard are registered separately.
  fastify.all("/api/v1/preview/:port", handlePreview);
  fastify.all("/api/v1/preview/:port/*", handlePreview);
};
