import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
  ExecuteApiRequestDtoSchema,
} from "@remote-ide/shared";
import {
  ApiClientService,
  apiClientService as defaultApiClientService,
} from "../services/api-client.service.js";

export const apiClientRoutes: FastifyPluginAsync<{
  apiClientService?: ApiClientService;
}> = async (fastify, opts) => {
  const service = opts.apiClientService || defaultApiClientService;

  // Execute API Request on the host machine
  fastify.post("/api/v1/api-client/execute", async (req, reply) => {
    const parse = ExecuteApiRequestDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    const response = await service.executeRequest(parse.data);
    return createSuccessResponse(response);
  });
};
