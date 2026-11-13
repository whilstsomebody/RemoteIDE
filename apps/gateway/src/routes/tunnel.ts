import { FastifyPluginAsync } from "fastify";
import { createSuccessEnvelope, TunnelMessageType } from "@remote-ide/shared";
import { tunnelRelayService } from "../services/tunnel-relay.service.js";

export const tunnelRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Host Agent Outbound Tunnel WebSocket Endpoint
  fastify.get("/api/v1/tunnel/agent", { websocket: true }, (socket, req) => {
    fastify.log.info({ ip: req.ip }, "Host agent establishing reverse tunnel connection");

    let hostId = "local-host-agent";

    socket.on("message", (raw: Buffer | string) => {
      try {
        const text = raw.toString();
        const msg = JSON.parse(text);

        if (msg.type === TunnelMessageType.AGENT_REGISTER) {
          hostId = msg.payload?.hostId || hostId;
          tunnelRelayService.registerAgentSocket(hostId, socket, msg.payload?.capabilities);

          socket.send(
            JSON.stringify({
              type: TunnelMessageType.AGENT_REGISTERED,
              payload: {
                hostId,
                gatewayTime: new Date().toISOString(),
                status: "active",
              },
            })
          );
          fastify.log.info({ hostId }, "Host agent registered and ready for reverse tunnel RPC");
        }
      } catch (err) {
        fastify.log.error({ err }, "Error in agent tunnel handshake");
      }
    });

    socket.on("close", () => {
      fastify.log.info({ hostId }, "Host agent reverse tunnel closed");
    });
  });

  // 2. Tunnel Status Query
  fastify.get("/api/v1/tunnel/status", async (_req, reply) => {
    const status = tunnelRelayService.getHostStatus("local-host-agent");
    return reply.send(createSuccessEnvelope(status));
  });
};
