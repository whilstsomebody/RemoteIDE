import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { AppError, ErrorCode, ExecuteApiRequestDto, ApiClientResponse, isSsrfDangerousTarget } from "@remote-ide/shared";

export class ApiClientService {
  public interpolate(text: string, variables: Record<string, string> = {}): string {
    return text.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_, key) => {
      return variables[key] !== undefined ? variables[key] : `{{${key}}}`;
    });
  }

  public async executeRequest(dto: ExecuteApiRequestDto): Promise<ApiClientResponse> {
    const variables = dto.variables || {};

    let rawUrl = this.interpolate(dto.url.trim(), variables);
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      rawUrl = `http://${rawUrl}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new AppError(ErrorCode.BAD_REQUEST, `Invalid URL: ${rawUrl}`);
    }

    const ssrfCheck = isSsrfDangerousTarget(parsedUrl.toString());
    if (ssrfCheck.blocked) {
      throw new AppError(ErrorCode.FORBIDDEN, `Access to forbidden endpoint: ${ssrfCheck.reason}`);
    }

    if (dto.params && dto.params.length > 0) {
      for (const param of dto.params) {
        if (param.enabled && param.key) {
          const key = this.interpolate(param.key, variables);
          const val = this.interpolate(param.value, variables);
          parsedUrl.searchParams.append(key, val);
        }
      }
    }

    const headers: Record<string, string> = {};
    if (dto.headers && dto.headers.length > 0) {
      for (const h of dto.headers) {
        if (h.enabled && h.key) {
          const key = this.interpolate(h.key, variables);
          const val = this.interpolate(h.value, variables);
          headers[key.toLowerCase()] = val;
        }
      }
    }

    if (dto.authType === "bearer" && dto.authToken) {
      const token = this.interpolate(dto.authToken, variables);
      headers["authorization"] = `Bearer ${token}`;
    } else if (dto.authType === "basic" && (dto.authUsername || dto.authPassword)) {
      const u = this.interpolate(dto.authUsername || "", variables);
      const p = this.interpolate(dto.authPassword || "", variables);
      const base64 = Buffer.from(`${u}:${p}`).toString("base64");
      headers["authorization"] = `Basic ${base64}`;
    } else if (dto.authType === "apiKey" && dto.authKey && dto.authValue) {
      const k = this.interpolate(dto.authKey, variables);
      const v = this.interpolate(dto.authValue, variables);
      if (dto.authAddTo === "query") {
        parsedUrl.searchParams.append(k, v);
      } else {
        headers[k.toLowerCase()] = v;
      }
    }

    let bodyBuffer: Buffer | null = null;
    if (dto.method !== "GET" && dto.method !== "HEAD") {
      if (dto.bodyType === "json" && dto.bodyRaw) {
        const interpolatedBody = this.interpolate(dto.bodyRaw, variables);
        bodyBuffer = Buffer.from(interpolatedBody, "utf-8");
        if (!headers["content-type"]) {
          headers["content-type"] = "application/json";
        }
      } else if (dto.bodyType === "text" && dto.bodyRaw) {
        const interpolatedBody = this.interpolate(dto.bodyRaw, variables);
        bodyBuffer = Buffer.from(interpolatedBody, "utf-8");
        if (!headers["content-type"]) {
          headers["content-type"] = "text/plain";
        }
      } else if (dto.bodyType === "x-www-form-urlencoded" && dto.bodyFormData) {
        const formParams = new URLSearchParams();
        for (const f of dto.bodyFormData) {
          if (f.enabled && f.key) {
            formParams.append(
              this.interpolate(f.key, variables),
              this.interpolate(f.value, variables)
            );
          }
        }
        bodyBuffer = Buffer.from(formParams.toString(), "utf-8");
        headers["content-type"] = "application/x-www-form-urlencoded";
      }
    }

    if (bodyBuffer) {
      headers["content-length"] = String(bodyBuffer.length);
    }

    const curlCommand = this.generateCurl(dto.method, parsedUrl.toString(), headers, bodyBuffer);

    const startTime = Date.now();
    const isHttps = parsedUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const req = transport.request(
        parsedUrl,
        {
          method: dto.method,
          headers,
          timeout: dto.timeoutMs || 30000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const durationMs = Date.now() - startTime;
            const resBuffer = Buffer.concat(chunks);
            const bodyStr = resBuffer.toString("utf-8");
            const sizeBytes = resBuffer.length;

            const resHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v !== undefined) {
                resHeaders[k] = Array.isArray(v) ? v.join(", ") : String(v);
              }
            }

            let isJson = false;
            try {
              JSON.parse(bodyStr);
              isJson = true;
            } catch {
              // Not JSON
            }

            resolve({
              status: res.statusCode || 200,
              statusText: res.statusMessage || "OK",
              headers: resHeaders,
              body: bodyStr,
              durationMs,
              sizeBytes,
              isJson,
              curlCommand,
            });
          });
        }
      );

      req.on("timeout", () => {
        req.destroy();
        reject(
          new AppError(
            ErrorCode.GATEWAY_TIMEOUT,
            `Request timed out after ${dto.timeoutMs || 30000}ms`
          )
        );
      });

      req.on("error", (err) => {
        const durationMs = Date.now() - startTime;
        resolve({
          status: 0,
          statusText: err.message || "Network Error",
          headers: {},
          body: `Error: ${err.message}`,
          durationMs,
          sizeBytes: 0,
          isJson: false,
          curlCommand,
        });
      });

      if (bodyBuffer) {
        req.write(bodyBuffer);
      }
      req.end();
    });
  }

  private generateCurl(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: Buffer | null
  ): string {
    const parts = [`curl -X ${method} "${url}"`];
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === "authorization") {
        // Safe placeholder for cURL copy if sensitive
        parts.push(`-H "${k}: ${v}"`);
      } else {
        parts.push(`-H "${k}: ${v}"`);
      }
    }
    if (body) {
      parts.push(`-d '${body.toString("utf-8").replace(/'/g, "'\\''")}'`);
    }
    return parts.join(" \\\n  ");
  }
}

export const apiClientService = new ApiClientService();
