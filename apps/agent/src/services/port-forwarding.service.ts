import net from "node:net";
import http from "node:http";
import {
  AppError,
  ErrorCode,
  ForwardedPort,
  DetectedPort,
  ForwardPortDto,
  BLOCKED_INTERNAL_INFRA_PORTS,
  logger,
} from "@remote-ide/shared";

const COMMON_DEV_PORTS = [3000, 3001, 3002, 4000, 4200, 5000, 5173, 5174, 8000, 8080, 8888, 9000];

export class PortForwardingService {
  private forwardedPorts = new Map<number, ForwardedPort>();

  /**
   * Scan host machine for listening development ports on 127.0.0.1.
   */
  public async detectListeningPorts(): Promise<DetectedPort[]> {
    const detected: DetectedPort[] = [];

    // Probe common dev ports on localhost
    const checkPort = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(250);

        socket.on("connect", () => {
          socket.destroy();
          resolve(true);
        });

        socket.on("timeout", () => {
          socket.destroy();
          resolve(false);
        });

        socket.on("error", () => {
          socket.destroy();
          resolve(false);
        });

        socket.connect(port, "127.0.0.1");
      });
    };

    const checks = COMMON_DEV_PORTS.map(async (port) => {
      const isListening = await checkPort(port);
      if (isListening) {
        let processName: string | undefined;
        if (port === 3000) processName = "Next.js / React Dev Server";
        else if (port === 5173 || port === 5174) processName = "Vite Dev Server";
        else if (port === 8080 || port === 8000) processName = "HTTP Dev Server";
        else processName = `Local Service (: ${port})`;

        detected.push({ port, processName });
      }
    });

    await Promise.all(checks);
    return detected.sort((a, b) => a.port - b.port);
  }

  /**
   * List all forwarded ports.
   */
  public listForwardedPorts(): ForwardedPort[] {
    const now = new Date().getTime();
    const result: ForwardedPort[] = [];

    for (const portInfo of this.forwardedPorts.values()) {
      // Check expiration
      if (portInfo.expiresAt && new Date(portInfo.expiresAt).getTime() < now) {
        portInfo.enabled = false;
      }
      result.push({ ...portInfo });
    }

    return result;
  }

  /**
   * Authorize and forward a port with strict SSRF validation.
   */
  public forwardPort(dto: ForwardPortDto): ForwardedPort {
    const port = dto.port;

    // Strict Port Range Validation (1024 - 65535)
    if (port < 1024 || port > 65535) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        `Port ${port} is outside valid development range (1024-65535). System ports (<1024) cannot be forwarded.`
      );
    }

    // SSRF Guard: Block access to protected internal service ports
    if (BLOCKED_INTERNAL_INFRA_PORTS.has(port)) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        `Port ${port} is reserved for internal infrastructure and cannot be forwarded for preview.`
      );
    }

    const expiresAt = dto.expiresInSeconds
      ? new Date(Date.now() + dto.expiresInSeconds * 1000).toISOString()
      : undefined;

    const forwarded: ForwardedPort = {
      port,
      label: dto.label || `Port ${port}`,
      protocol: dto.protocol || "http",
      enabled: true,
      targetHost: "127.0.0.1", // Enforce local loopback only
      createdAt: new Date().toISOString(),
      expiresAt,
      sessionRestricted: false,
      activeConnections: 0,
      detectedService: `Dev Service on :${port}`,
    };

    this.forwardedPorts.set(port, forwarded);
    logger.info({ port, label: forwarded.label }, "Port forwarded successfully");
    return forwarded;
  }

  /**
   * Toggle port forwarding enable/disable.
   */
  public togglePortForward(port: number, enabled: boolean): ForwardedPort {
    const record = this.forwardedPorts.get(port);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Forwarded port ${port} not found.`);
    }
    record.enabled = enabled;
    return { ...record };
  }

  /**
   * Remove forwarded port.
   */
  public unforwardPort(port: number): void {
    if (!this.forwardedPorts.has(port)) {
      throw new AppError(ErrorCode.NOT_FOUND, `Forwarded port ${port} not found.`);
    }
    this.forwardedPorts.delete(port);
  }

  /**
   * Check if a port is approved and active for preview proxying.
   */
  public isPortApproved(port: number): boolean {
    const record = this.forwardedPorts.get(port);
    if (!record || !record.enabled) return false;
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      record.enabled = false;
      return false;
    }
    return true;
  }

  /**
   * Proxy an incoming HTTP request to the local forwarded port.
   */
  public async proxyHttpRequest(
    port: number,
    subpath: string,
    method: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<{ statusCode: number; headers: Record<string, string>; body: string | Buffer }> {
    if (!this.isPortApproved(port)) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        `Port ${port} is not authorized for remote preview. Forward it first in the Ports panel.`
      );
    }

    const targetUrl = new URL(`http://127.0.0.1:${port}${subpath}`);

    return new Promise((resolve, reject) => {
      const cleanHeaders = { ...headers };
      delete cleanHeaders["host"];
      delete cleanHeaders["connection"];
      for (const key of Object.keys(cleanHeaders)) {
        if (["authorization", "cookie", "content-length", "transfer-encoding"].includes(key.toLowerCase()) || key.toLowerCase().startsWith("x-remoteide-")) delete cleanHeaders[key];
      }

      const req = http.request(
        targetUrl,
        {
          method,
          headers: {
            ...cleanHeaders,
            host: `127.0.0.1:${port}`,
          },
          timeout: 15000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const resHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v !== undefined) {
                resHeaders[k] = Array.isArray(v) ? v.join(", ") : String(v);
              }
            }

            resolve({
              statusCode: res.statusCode || 200,
              headers: resHeaders,
              body: Buffer.concat(chunks),
            });
          });
        }
      );

      req.on("timeout", () => {
        req.destroy();
        reject(new AppError(ErrorCode.GATEWAY_TIMEOUT, `Connection to port ${port} timed out.`));
      });

      req.on("error", (err) => {
        reject(
          new AppError(
            ErrorCode.SERVICE_UNAVAILABLE,
            `Failed to proxy to localhost:${port}: ${err.message}`
          )
        );
      });

      if (body) {
        if (typeof body === "string" || Buffer.isBuffer(body)) {
          req.write(body);
        } else {
          req.write(JSON.stringify(body));
        }
      }
      req.end();
    });
  }
}

export const portForwardingService = new PortForwardingService();
