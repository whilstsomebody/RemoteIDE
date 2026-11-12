import { FastifyPluginAsync } from "fastify";
import { createSuccessResponse } from "@remote-ide/shared";
import { collectHostCapabilities } from "../capabilities/collector.js";

export const capabilitiesRoutes: FastifyPluginAsync<{ allowedPaths: string[] }> = async (
  fastify,
  opts
) => {
  fastify.get("/api/v1/capabilities", async () => {
    const caps = collectHostCapabilities(opts.allowedPaths);
    return createSuccessResponse(caps);
  });
};
