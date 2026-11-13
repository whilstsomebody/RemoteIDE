import { describe, it, expect } from "vitest";
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
        timeoutMs: 5000,
      })
    ).rejects.toThrow(AppError);
  });
});
