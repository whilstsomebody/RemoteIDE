import { FastifyPluginAsync } from "fastify";
import {
  WsMessageType,
  WS_PROTOCOL_VERSION,
  createWsMessage,
  WsBaseEnvelopeSchema,
  type WsEnvelope,
} from "@remote-ide/shared";

export const wsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/ws", { websocket: true }, (socket, req) => {
    fastify.log.info({ requestId: req.requestId }, "WebSocket connection established");

    // Send connection greeting
    socket.send(
      JSON.stringify(
        createWsMessage(
          WsMessageType.CONNECTED,
          {
            gatewayVersion: "0.1.0",
            protocolVersion: WS_PROTOCOL_VERSION,
            sessionId: req.requestId,
          },
          { correlationId: req.correlationId }
        )
      )
    );

    socket.on("message", (rawMessage: Buffer | string) => {
      try {
        const text = rawMessage.toString();
        const parsedJson = JSON.parse(text);
        const validation = WsBaseEnvelopeSchema.safeParse(parsedJson);

        if (!validation.success) {
          socket.send(
            JSON.stringify(
              createWsMessage(
                WsMessageType.ERROR,
                {
                  code: "INVALID_WS_FRAME",
                  message: "Message does not match standard RemoteIDE WS envelope",
                  details: validation.error.issues,
                },
                { correlationId: req.correlationId }
              )
            )
          );
          return;
        }

        const msg = validation.data as WsEnvelope;

        // Handle standard message types
        switch (msg.type) {
          case WsMessageType.PING:
            socket.send(
              JSON.stringify(
                createWsMessage(
                  WsMessageType.PONG,
                  { received: msg.timestamp },
                  {
                    correlationId: msg.correlationId || msg.id,
                  }
                )
              )
            );
            break;

          case WsMessageType.AGENT_HEARTBEAT:
            socket.send(
              JSON.stringify(
                createWsMessage(
                  WsMessageType.AGENT_STATUS,
                  { acknowledged: true, serverTime: new Date().toISOString() },
                  { correlationId: msg.id }
                )
              )
            );
            break;

          default:
            socket.send(
              JSON.stringify(
                createWsMessage(
                  WsMessageType.RPC_RESPONSE,
                  { status: "received", handledType: msg.type },
                  { correlationId: msg.id }
                )
              )
            );
            break;
        }
      } catch (err) {
        fastify.log.error({ err }, "Error parsing WebSocket message");
        socket.send(
          JSON.stringify(
            createWsMessage(
              WsMessageType.ERROR,
              { code: "MALFORMED_JSON", message: "Failed to parse JSON payload" },
              { correlationId: req.correlationId }
            )
          )
        );
      }
    });

    socket.on("close", () => {
      fastify.log.info({ requestId: req.requestId }, "WebSocket connection closed");
    });
  });
};
