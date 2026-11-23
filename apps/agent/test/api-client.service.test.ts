import dns from "node:dns";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, vi } from "vitest";
import { ApiClientService } from "../src/services/api-client.service.js";
import { AppError } from "@remote-ide/shared";

describe("Phase 5 - Built-in HTTP / API Client Service", () => {
  const service = new ApiClientService();

  it("interpolates variables properly in URL and headers", () => {
    const text = "{{baseUrl}}/api/v1/users?token={{authToken}}";
    const res = service.interpolate(text, {
      baseUrl: "https://api.example.com",
      authToken: "xyz123",
    });
    expect(res).toBe("https://api.example.com/api/v1/users?token=xyz123");
  });

  it("blocks cloud metadata service destinations against SSRF", async () => {
    await expect(
      service.executeRequest({
        method: "GET",
        url: "http://169.254.169.254/latest/meta-data/",
        headers: [],
        params: [],
        bodyType: "none",
        authType: "none",
        authAddTo: "header",
        timeoutMs: 5000,
      })
    ).rejects.toThrow(AppError);
  });
});

describe("API Client SSRF hardening", () => {
  const service = new ApiClientService();
  const baseDto = {
    method: "GET" as const,
    headers: [],
    params: [],
    bodyType: "none" as const,
    authType: "none" as const,
    authAddTo: "header" as const,
    timeoutMs: 5000,
  };

  it("blocks infrastructure ports and IPv4-mapped / trailing-dot metadata hosts", async () => {
    for (const url of [
      "http://127.0.0.1:6379/",
      "http://localhost:2375/containers/json",
      "http://[::ffff:169.254.169.254]/latest/meta-data/",
      "http://metadata.google.internal./computeMetadata/v1/",
    ]) {
      await expect(service.executeRequest({ ...baseDto, url })).rejects.toThrow(AppError);
    }
  });

  it("rejects hostnames that resolve to a blocked metadata address", async () => {
    const spy = vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _opts: unknown,
      cb: (err: null, addrs: Array<{ address: string; family: number }>) => void
    ) => cb(null, [{ address: "169.254.169.254", family: 4 }])) as never);
    try {
      await expect(
        service.executeRequest({ ...baseDto, url: "http://rebind.example.test/" })
      ).rejects.toThrow(/forbidden endpoint/);
    } finally {
      spy.mockRestore();
    }
  });

  it("caps oversized response bodies instead of buffering them", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      const chunk = Buffer.alloc(1024 * 1024, 97);
      let sent = 0;
      const pump = () => {
        while (sent < 12) {
          sent++;
          if (!res.write(chunk)) return res.once("drain", pump);
        }
        res.end();
      };
      pump();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await service.executeRequest({ ...baseDto, url: `http://127.0.0.1:${port}/` });
      expect(res.status).toBe(0);
      expect(res.body).toContain("exceeded");
    } finally {
      server.close();
    }
  });

  it("single-quotes values in the exported cURL command", async () => {
    const server = http.createServer((_req, res) => res.end("ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await service.executeRequest({
        ...baseDto,
        url: `http://127.0.0.1:${port}/?q=$(id)`,
        headers: [{ key: "x-test", value: "`whoami`", enabled: true }],
      });
      expect(res.curlCommand).toContain(`'http://127.0.0.1:${port}/?q=$(id)'`);
      expect(res.curlCommand).toContain("-H 'x-test: `whoami`'");
    } finally {
      server.close();
    }
  });
});
