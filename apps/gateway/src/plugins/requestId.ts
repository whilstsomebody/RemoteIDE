import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { generateCorrelationId, generateRequestId } from "@remote-ide/shared";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
    correlationId: string;
  }
}

const requestIdPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    const rawReqId = request.headers["x-request-id"];
    const rawCorrId = request.headers["x-correlation-id"];

    const requestId =
      typeof rawReqId === "string" && rawReqId.length > 0 ? rawReqId : generateRequestId();
    const correlationId =
      typeof rawCorrId === "string" && rawCorrId.length > 0 ? rawCorrId : generateCorrelationId();

    request.requestId = requestId;
    request.correlationId = correlationId;

    reply.header("x-request-id", requestId);
    reply.header("x-correlation-id", correlationId);
  });
};

export const requestIdPlugin = fp(requestIdPluginImpl, {
  name: "requestIdPlugin",
});
