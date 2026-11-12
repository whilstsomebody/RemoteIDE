import { describe, it, expect } from "vitest";
import { users, hostAgents, sessions, auditLogs, createDatabaseClient } from "./index.js";

describe("@remote-ide/db", () => {
  it("exports schemas with defined table columns", () => {
    expect(users).toBeDefined();
    expect(hostAgents).toBeDefined();
    expect(sessions).toBeDefined();
    expect(auditLogs).toBeDefined();

    expect(users.id).toBeDefined();
    expect(users.email).toBeDefined();
    expect(hostAgents.identifier).toBeDefined();
  });

  it("creates a client instance with health check and close methods", () => {
    const client = createDatabaseClient({
      connectionString: "postgresql://mock:mock@localhost:5432/mock",
    });
    expect(client.db).toBeDefined();
    expect(typeof client.checkHealth).toBe("function");
    expect(typeof client.close).toBe("function");
  });
});
