import { FastifyPluginAsync } from "fastify";
import {
  WsMessageType,
  WS_PROTOCOL_VERSION,
  createWsMessage,
  WsBaseEnvelopeSchema,
  type WsEnvelope,
} from "@remote-ide/shared";
import { authService } from "../services/auth.service.js";
import { tunnelRelayService } from "../services/tunnel-relay.service.js";

export const wsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/ws", { websocket: true }, (socket, req) => {
    fastify.log.info({ requestId: req.requestId }, "WebSocket connection attempt");

    // Extract session token
    const query = req.query as Record<string, string | undefined>;
    const token =
      query.token ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
      req.headers.cookie?.match(/remoteide_session=([^;]+)/)?.[1];

    let session = token ? authService.getSessionByToken(token) : null;

    if (!session) {
      const isLoopback =
        req.ip === "127.0.0.1" ||
        req.ip === "::1" ||
        req.ip === "::ffff:127.0.0.1" ||
        req.hostname === "localhost";

      if (isLoopback && !authService.isOwnerBootstrapped()) {
        session = {
          id: req.requestId,
          userId: "local-dev",
          hostId: "local-host-agent",
          role: "owner" as any,
          capabilities: [] as any,
          allowedWorkspaceIds: [],
          deviceName: "Local Loopback",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] || "",
          isOwner: true,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          isRevoked: false,
        };
      } else {
        socket.send(
          JSON.stringify(
            createWsMessage(
              WsMessageType.ERROR,
              { code: "UNAUTHORIZED_SESSION", message: "Valid remote session token required" },
              { correlationId: req.correlationId }
            )
          )
        );
        socket.close(4401, "Unauthorized: Valid remote session required");
        return;
      }
    }

    // Register active socket for this session so instant revocation severs it
    tunnelRelayService.registerClientSocket(session.id, socket);

    // Send connection greeting
    socket.send(
      JSON.stringify(
        createWsMessage(
          WsMessageType.CONNECTED,
          {
            gatewayVersion: "0.1.0",
            protocolVersion: WS_PROTOCOL_VERSION,
            sessionId: session.id,
            role: session.role,
          },
          { correlationId: req.correlationId }
        )
      )
    );

    socket.on("message", (rawMessage: Buffer | string) => {
      try {
        // Re-verify session validity on each frame
        if (token && !authService.getSessionByToken(token)) {
          socket.send(
            JSON.stringify(
              createWsMessage(
                WsMessageType.ERROR,
                { code: "SESSION_EXPIRED", message: "Session expired or revoked" },
                { correlationId: req.correlationId }
              )
            )
          );
          socket.close(4401, "Session expired or revoked");
          return;
        }

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
                  { correlationId: msg.correlationId || msg.id }
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
