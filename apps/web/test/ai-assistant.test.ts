import { describe, it, expect } from "vitest";
import { AiAssistantPanel } from "../src/components/ai/ai-assistant-panel";
import { AgentPanel } from "../src/components/agent/agent-panel";
import {
  DEFAULT_GEMINI_MODEL,
  SUPPORTED_GEMINI_MODELS,
  GEMINI_READ_ONLY_SYSTEM_PROMPT,
  GEMINI_PRIVACY_DISCLAIMER,
  redactSecrets,
  AiMessageContext,
} from "@remote-ide/shared";

describe("Phase 12 — Web AI Assistant & Client Integration", () => {
  it("exports AiAssistantPanel and backward-compatible AgentPanel", () => {
    expect(AiAssistantPanel).toBeDefined();
    expect(AgentPanel).toBeDefined();
  });

  it("verifies documented Gemini models with confirmed free-tier support", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(SUPPORTED_GEMINI_MODELS).toContain("gemini-2.5-flash");
    expect(SUPPORTED_GEMINI_MODELS).toContain("gemini-1.5-flash");
  });

  it("enforces strict read-only constraints in system instruction", () => {
    expect(GEMINI_READ_ONLY_SYSTEM_PROMPT).toContain("strictly a read-only conversational assistant");
    expect(GEMINI_READ_ONLY_SYSTEM_PROMPT).toContain("You do NOT have any tools");
    expect(GEMINI_READ_ONLY_SYSTEM_PROMPT).toContain("CANNOT create, edit, save, or delete files");
    expect(GEMINI_READ_ONLY_SYSTEM_PROMPT).toContain("CANNOT run terminal commands");
  });

  it("includes third-party processing notice and explicit selection requirement", () => {
    expect(GEMINI_PRIVACY_DISCLAIMER).toContain("sent to Google's Gemini API");
    expect(GEMINI_PRIVACY_DISCLAIMER).toContain("Google AI Studio terms");
    expect(GEMINI_PRIVACY_DISCLAIMER).toContain("No unselected workspace files");
  });

  it("redacts sensitive tokens in client context before transmission", () => {
    const context: AiMessageContext = {
      type: "selection",
      filePath: "src/config.ts",
      codeSnippet: `const key = "AIzaSyD-FakeTestKey_1234567890abcdef";\nconst token = "ghp_123456789012345678901234567890123456";`,
    };

    const redacted = redactSecrets(context.codeSnippet!);
    expect(redacted).not.toContain("AIzaSyD-FakeTestKey_1234567890abcdef");
    expect(redacted).not.toContain("ghp_123456789012345678901234567890123456");
    expect(redacted).toContain("AIza[REDACTED_GOOGLE_API_KEY]");
    expect(redacted).toContain("[REDACTED");
  });
});
