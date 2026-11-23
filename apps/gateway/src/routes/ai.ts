import { FastifyPluginAsync } from "fastify";
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  GEMINI_PRIVACY_DISCLAIMER,
  SetAiKeySchema,
  CreateAiConversationSchema,
  RenameAiConversationSchema,
  SendAiPromptSchema,
} from "@remote-ide/shared";
import { authenticateClient } from "../services/request-auth.js";
import { aiAssistantService } from "../services/ai-assistant.service.js";

export const aiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/ai/settings", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    const settings = await aiAssistantService.getSettings(session.userId);
    return createSuccessResponse(
      {
        ...settings,
        disclaimer: GEMINI_PRIVACY_DISCLAIMER,
      },
      { requestId: request.requestId, correlationId: request.correlationId }
    );
  });

  fastify.post("/api/v1/ai/settings", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    const parseResult = SetAiKeySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid API key format", {
          details: [{ error: parseResult.error.message }],
          requestId: request.requestId,
        })
      );
    }

    const updated = await aiAssistantService.setApiKey(
      session.userId,
      parseResult.data.apiKey,
      parseResult.data.model
    );

    return createSuccessResponse(
      {
        ...updated,
        disclaimer: GEMINI_PRIVACY_DISCLAIMER,
      },
      { requestId: request.requestId, correlationId: request.correlationId }
    );
  });

  fastify.delete("/api/v1/ai/settings", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    await aiAssistantService.clearApiKey(session.userId);
    return createSuccessResponse({ cleared: true }, { requestId: request.requestId });
  });

  fastify.get("/api/v1/ai/conversations", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    const query = request.query as { workspaceId?: string };
    const workspaceId = query.workspaceId || "default";

    const list = await aiAssistantService.listConversations(workspaceId, session.userId);
    return createSuccessResponse(list, {
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
  });

  fastify.post("/api/v1/ai/conversations", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    const parseResult = CreateAiConversationSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid conversation parameters", {
          details: [{ error: parseResult.error.message }],
          requestId: request.requestId,
        })
      );
    }

    const conversation = await aiAssistantService.createConversation(
      parseResult.data.workspaceId,
      session.userId,
      parseResult.data.title
    );

    if (parseResult.data.initialMessage) {
      await aiAssistantService.addMessage(
        conversation.id,
        "user",
        parseResult.data.initialMessage,
        parseResult.data.context
      );
    }

    return reply
      .code(201)
      .send(createSuccessResponse(conversation, { requestId: request.requestId }));
  });

  fastify.get("/api/v1/ai/conversations/:id", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    const params = request.params as { id: string };
    const result = await aiAssistantService.getConversation(params.id, session.userId);

    if (!result) {
      return reply.code(404).send(
        createErrorResponse(ErrorCode.NOT_FOUND, "Conversation not found", {
          requestId: request.requestId,
        })
      );
    }

    return createSuccessResponse(result, {
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
  });

  fastify.patch("/api/v1/ai/conversations/:id", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    const params = request.params as { id: string };
    const parseResult = RenameAiConversationSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid title", {
          details: [{ error: parseResult.error.message }],
          requestId: request.requestId,
        })
      );
    }

    const updated = await aiAssistantService.renameConversation(
      params.id,
      session.userId,
      parseResult.data.title
    );

    if (!updated) {
      return reply.code(404).send(
        createErrorResponse(ErrorCode.NOT_FOUND, "Conversation not found", {
          requestId: request.requestId,
        })
      );
    }

    return createSuccessResponse(updated, { requestId: request.requestId });
  });

  fastify.delete("/api/v1/ai/conversations/:id", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    const params = request.params as { id: string };
    const success = await aiAssistantService.deleteConversation(params.id, session.userId);

    if (!success) {
      return reply.code(404).send(
        createErrorResponse(ErrorCode.NOT_FOUND, "Conversation not found", {
          requestId: request.requestId,
        })
      );
    }

    return createSuccessResponse({ deleted: true }, { requestId: request.requestId });
  });

  fastify.post("/api/v1/ai/conversations/:id/messages", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    const params = request.params as { id: string };
    const parseResult = SendAiPromptSchema.safeParse({
      conversationId: params.id,
      ...(request.body as any),
    });

    if (!parseResult.success) {
      return reply.code(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid prompt parameters", {
          details: [{ error: parseResult.error.message }],
          requestId: request.requestId,
        })
      );
    }

    const { prompt, context, model } = parseResult.data;

    const acceptsSse = request.headers.accept?.includes("text/event-stream");

    if (acceptsSse) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      try {
        for await (const event of aiAssistantService.streamPrompt(
          params.id,
          session.userId,
          prompt,
          context,
          model
        )) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.type === "end" || event.type === "error") {
            break;
          }
        }
      } catch (err: any) {
        reply.raw.write(
          `data: ${JSON.stringify({
            type: "error",
            error: err?.message || "Stream failed",
          })}\n\n`
        );
      } finally {
        reply.raw.end();
      }
      return reply;
    }

    // Non-streaming fallback: consume stream and return full response
    let fullText = "";
    let errorObj: any = null;

    for await (const event of aiAssistantService.streamPrompt(
      params.id,
      session.userId,
      prompt,
      context,
      model
    )) {
      if (event.type === "chunk" && event.text) {
        fullText += event.text;
      } else if (event.type === "end" && event.text) {
        fullText = event.text;
      } else if (event.type === "error") {
        errorObj = event;
      }
    }

    if (errorObj) {
      return reply.code(500).send(
        createErrorResponse(
          errorObj.code || ErrorCode.INTERNAL_SERVER_ERROR,
          errorObj.error || "Generation error",
          { requestId: request.requestId }
        )
      );
    }

    return createSuccessResponse(
      { content: fullText },
      { requestId: request.requestId, correlationId: request.correlationId }
    );
  });

  fastify.post("/api/v1/ai/messages/:id/cancel", async (request, reply) => {
    const session = authenticateClient(request);
    if (!session) {
      return reply.code(401).send(
        createErrorResponse(ErrorCode.UNAUTHORIZED, "Valid session required", {
          requestId: request.requestId,
        })
      );
    }

    const params = request.params as { id: string };
    const stopped = aiAssistantService.abortStream(params.id);
    return createSuccessResponse({ stopped }, { requestId: request.requestId });
  });
};
