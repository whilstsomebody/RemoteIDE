import { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { parse as parseUrl } from "node:url";
import { logger, TerminalWsMessage } from "@remote-ide/shared";
import { TerminalService } from "./terminal.service.js";

export class TerminalWsServer {
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly server: HttpServer,
    private readonly terminalService: TerminalService
  ) {}

  public init(): void {
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on("upgrade", (request, socket, head) => {
      const { pathname, query } = parseUrl(request.url || "", true);

      // Matches /api/v1/terminals/:id/stream or /api/v1/terminals/stream?sessionId=:id
      const streamMatch = pathname?.match(/^\/api\/v1\/terminals\/([^/]+)\/stream$/);
      const sessionId = streamMatch ? streamMatch[1] : (query.sessionId as string | undefined);

      if (!sessionId) {
        // Not a terminal stream upgrade request; let other handlers process it
        return;
      }

      try {
        this.terminalService.getTerminal(sessionId);
      } catch {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(request, socket, head, (ws) => {
        this.wss?.emit("connection", ws, request, sessionId);
      });
    });

    this.wss.on("connection", (ws: WebSocket, _request: unknown, sessionId: string) => {
      logger.info({ sessionId }, "WebSocket client connected to terminal stream");

      let unsubscribe: (() => void) | null = null;

      try {
        const attachResult = this.terminalService.attach(sessionId, (data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            const outMsg: TerminalWsMessage = {
              type: "output",
              sessionId,
              data,
            };
            ws.send(JSON.stringify(outMsg));
          }
        });

        unsubscribe = attachResult.unsubscribe;

        const attachedMsg: TerminalWsMessage = {
          type: "attached",
          sessionId,
          buffer: attachResult.replayBuffer,
        };
        ws.send(JSON.stringify(attachedMsg));
      } catch (err) {
        logger.error({ err, sessionId }, "Failed to attach to terminal session");
        ws.close(1011, "Session not found or unavailable");
        return;
      }

      ws.on("message", (raw: Buffer | string) => {
        try {
          const text = raw.toString("utf-8");
          const msg = JSON.parse(text) as TerminalWsMessage;

          if (msg.type === "input" && typeof msg.data === "string") {
            this.terminalService.writeTerminal(sessionId, msg.data);
          } else if (
            msg.type === "resize" &&
            typeof msg.cols === "number" &&
            typeof msg.rows === "number"
          ) {
            this.terminalService.resizeTerminal(sessionId, msg.cols, msg.rows);
          } else if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          // If message is plain string keystrokes rather than JSON
          const str = raw.toString("utf-8");
          if (str) {
            try {
              this.terminalService.writeTerminal(sessionId, str);
            } catch {
              // Ignore write error on closed process
            }
          }
        }
      });

      ws.on("close", () => {
        logger.info(
          { sessionId },
          "WebSocket client disconnected from terminal (PTY shell persists)"
        );
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      });

      ws.on("error", (err) => {
        logger.warn({ err, sessionId }, "Terminal WebSocket stream error");
      });
    });
  }

  public close(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
