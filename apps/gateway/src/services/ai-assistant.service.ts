import { GoogleGenAI } from "@google/genai";
import { pino, Logger } from "pino";
import {
  AiConversation,
  AiMessage,
  AiMessageContext,
  AiRole,
  AiSettings,
  DEFAULT_GEMINI_MODEL,
  DomainEventType,
  DurableEvent,
  KafkaTopic,
  encryptSecret,
  decryptSecret,
  generateSecureRandomToken,
  GEMINI_READ_ONLY_SYSTEM_PROMPT,
  redactSecrets,
  SUPPORTED_GEMINI_MODELS,
} from "@remote-ide/shared";
import { kafkaService } from "./kafka.service.js";
import { createDatabaseClient, RemoteIdeDatabase, eq, and, desc } from "@remote-ide/db";
import { aiConversations, aiMessages, aiSettings } from "@remote-ide/db/schema";

export interface StreamEvent {
  type: "chunk" | "end" | "error";
  text?: string;
  error?: string;
  code?: string;
  messageId?: string;
}

export type MockGeneratorFn = (
  prompt: string,
  history: Array<{ role: string; content: string }>,
  signal?: AbortSignal
) => AsyncGenerator<string, void, unknown>;

export class AiAssistantService {
  private logger: Logger;
  private db: RemoteIdeDatabase | null = null;
  private activeControllers = new Map<string, AbortController>();
  private mockGenerator: MockGeneratorFn | null = null;

  // In-memory fallback stores for test and offline environments
  private inMemorySettings = new Map<string, { encryptedApiKey: string; maskedKey: string; model: string }>();
  private inMemoryConversations = new Map<string, AiConversation>();
  private inMemoryMessages = new Map<string, AiMessage[]>();

  constructor(logger?: Logger) {
    this.logger = logger || pino({ name: "ai-assistant-service" });
    try {
      const client = createDatabaseClient();
      this.db = client.db;
    } catch (err) {
      this.logger.warn({ err }, "Database client unavailable for AI service, using resilient in-memory storage");
    }
  }

  public setMockGenerator(fn: MockGeneratorFn | null): void {
    this.mockGenerator = fn;
  }

  private publishMilestone(type: string, payload: Record<string, unknown>, correlationId?: string): void {
    try {
      const event: DurableEvent = {
        id: "evt_ai_" + generateSecureRandomToken(8),
        version: 1,
        type,
        hostId: "gateway",
        workspaceId: (payload.workspaceId as string) || "global",
        actorId: (payload.userId as string) || "ai-assistant",
        timestamp: new Date().toISOString(),
        correlationId,
        payload,
      };
      void kafkaService.publishEvent(KafkaTopic.WORKSPACE_EVENTS, event);
    } catch {
      // Non-critical background event
    }
  }

  /**
   * Mask an API key showing only prefix and suffix.
   */
  private maskKey(apiKey: string): string {
    if (!apiKey) return "";
    if (apiKey.length <= 8) return "••••••••";
    const prefix = apiKey.slice(0, 6);
    const suffix = apiKey.slice(-4);
    return `${prefix}...${suffix}`;
  }

  public async getSettings(userId: string): Promise<AiSettings> {
    try {
      if (this.db) {
        const rows = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);
        const row = rows[0];
        if (row && row.encryptedApiKey) {
          return {
            hasKey: true,
            maskedKey: row.maskedApiKey || undefined,
            model: row.model || DEFAULT_GEMINI_MODEL,
            temperature: row.temperature ? parseFloat(row.temperature) : 0.7,
            maxTokens: row.maxTokens || 4096,
            updatedAt: row.updatedAt?.toISOString(),
          };
        }
      }
    } catch (err) {
      this.logger.warn({ err }, "Failed reading AI settings from DB, trying in-memory fallback");
    }

    const mem = this.inMemorySettings.get(userId);
    if (mem && mem.encryptedApiKey) {
      return {
        hasKey: true,
        maskedKey: mem.maskedKey,
        model: mem.model || DEFAULT_GEMINI_MODEL,
        temperature: 0.7,
        maxTokens: 4096,
      };
    }

    const envKey = process.env.GEMINI_API_KEY;
    if (envKey) {
      return {
        hasKey: true,
        maskedKey: this.maskKey(envKey),
        model: DEFAULT_GEMINI_MODEL,
        temperature: 0.7,
        maxTokens: 4096,
      };
    }

    return {
      hasKey: false,
      model: DEFAULT_GEMINI_MODEL,
      temperature: 0.7,
      maxTokens: 4096,
    };
  }

  /**
   * Store user's Gemini API key securely encrypted at rest.
   */
  public async setApiKey(userId: string, rawKey: string, model?: string): Promise<AiSettings> {
    const trimmed = rawKey.trim();
    if (!trimmed) {
      throw new Error("API key cannot be empty");
    }

    const encrypted = encryptSecret(trimmed);
    const masked = this.maskKey(trimmed);
    const selectedModel = model && SUPPORTED_GEMINI_MODELS.includes(model as any) ? model : DEFAULT_GEMINI_MODEL;

    this.inMemorySettings.set(userId, {
      encryptedApiKey: encrypted,
      maskedKey: masked,
      model: selectedModel,
    });

    try {
      if (this.db) {
        const existing = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);
        if (existing.length > 0) {
          await this.db
            .update(aiSettings)
            .set({
              encryptedApiKey: encrypted,
              maskedApiKey: masked,
              model: selectedModel,
              updatedAt: new Date(),
            })
            .where(eq(aiSettings.userId, userId));
        } else {
          await this.db.insert(aiSettings).values({
            id: `ai_set_${generateSecureRandomToken(12)}`,
            userId,
            encryptedApiKey: encrypted,
            maskedApiKey: masked,
            model: selectedModel,
          });
        }
      }
    } catch (err) {
      this.logger.warn({ err }, "Could not persist AI settings to DB, stored in-memory");
    }

    return {
      hasKey: true,
      maskedKey: masked,
      model: selectedModel,
      temperature: 0.7,
      maxTokens: 4096,
      updatedAt: new Date().toISOString(),
    };
  }

  public async clearApiKey(userId: string): Promise<void> {
    this.inMemorySettings.delete(userId);
    try {
      if (this.db) {
        await this.db
          .update(aiSettings)
          .set({
            encryptedApiKey: null,
            maskedApiKey: null,
            updatedAt: new Date(),
          })
          .where(eq(aiSettings.userId, userId));
      }
    } catch (err) {
      this.logger.warn({ err }, "Error clearing AI settings from DB");
    }
  }

  /**
   * Retrieve the plaintext decrypted key for internal execution only.
   * NEVER returns key to frontend.
   */
  private async getDecryptedKey(userId: string): Promise<string | null> {
    try {
      if (this.db) {
        const rows = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);
        const row = rows[0];
        if (row && row.encryptedApiKey) {
          return decryptSecret(row.encryptedApiKey);
        }
      }
    } catch {}

    const mem = this.inMemorySettings.get(userId);
    if (mem && mem.encryptedApiKey) {
      return decryptSecret(mem.encryptedApiKey);
    }

    return process.env.GEMINI_API_KEY || null;
  }

  public async createConversation(
    workspaceId: string,
    userId: string,
    title = "New Chat"
  ): Promise<AiConversation> {
    const id = `conv_${generateSecureRandomToken(12)}`;
    const now = new Date().toISOString();
    const conversation: AiConversation = {
      id,
      workspaceId,
      userId,
      title: title.trim().slice(0, 100),
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };

    this.inMemoryConversations.set(id, conversation);
    this.inMemoryMessages.set(id, []);

    try {
      if (this.db) {
        await this.db.insert(aiConversations).values({
          id,
          workspaceId,
          userId,
          title: conversation.title,
        });
      }
    } catch (err) {
      this.logger.warn({ err }, "Could not persist conversation to DB, cached in-memory");
    }

    this.publishMilestone(
      DomainEventType.AI_CHAT_CREATED,
      { conversationId: id, workspaceId, userId, title: conversation.title },
      id
    );

    return conversation;
  }

  public async listConversations(workspaceId: string, userId: string): Promise<AiConversation[]> {
    try {
      if (this.db) {
        const rows = await this.db
          .select()
          .from(aiConversations)
          .where(and(eq(aiConversations.workspaceId, workspaceId), eq(aiConversations.userId, userId)))
          .orderBy(desc(aiConversations.updatedAt));

        if (rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            workspaceId: r.workspaceId,
            userId: r.userId,
            title: r.title,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }));
        }
      }
    } catch (err) {
      this.logger.warn({ err }, "Failed listing conversations from DB, falling back to memory");
    }

    const list: AiConversation[] = [];
    for (const c of this.inMemoryConversations.values()) {
      if (c.workspaceId === workspaceId && c.userId === userId) {
        const msgs = this.inMemoryMessages.get(c.id) || [];
        list.push({ ...c, messageCount: msgs.length });
      }
    }
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public async getConversation(
    conversationId: string,
    userId: string
  ): Promise<{ conversation: AiConversation; messages: AiMessage[] } | null> {
    let conv: AiConversation | null = null;
    let msgs: AiMessage[] = [];

    try {
      if (this.db) {
        const convRows = await this.db
          .select()
          .from(aiConversations)
          .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
          .limit(1);

        if (convRows[0]) {
          const r = convRows[0];
          conv = {
            id: r.id,
            workspaceId: r.workspaceId,
            userId: r.userId,
            title: r.title,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };

          const msgRows = await this.db
            .select()
            .from(aiMessages)
            .where(eq(aiMessages.conversationId, conversationId))
            .orderBy(aiMessages.createdAt);

          msgs = msgRows.map((m) => ({
            id: m.id,
            conversationId: m.conversationId,
            role: m.role as any,
            content: m.content,
            context: m.context as any,
            tokenCount: m.tokenCount || undefined,
            createdAt: m.createdAt.toISOString(),
          }));
        }
      }
    } catch (err) {
      this.logger.warn({ err }, "Failed retrieving conversation from DB, checking memory");
    }

    if (!conv) {
      const mem = this.inMemoryConversations.get(conversationId);
      if (mem && mem.userId === userId) {
        conv = mem;
        msgs = this.inMemoryMessages.get(conversationId) || [];
      }
    }

    if (!conv) return null;
    return { conversation: conv, messages: msgs };
  }

  public async renameConversation(
    conversationId: string,
    userId: string,
    title: string
  ): Promise<AiConversation | null> {
    const trimmed = title.trim().slice(0, 100);
    const now = new Date().toISOString();

    const mem = this.inMemoryConversations.get(conversationId);
    if (mem && mem.userId === userId) {
      mem.title = trimmed;
      mem.updatedAt = now;
    }

    try {
      if (this.db) {
        await this.db
          .update(aiConversations)
          .set({ title: trimmed, updatedAt: new Date() })
          .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
      }
    } catch (err) {
      this.logger.warn({ err }, "Could not update conversation title in DB");
    }

    if (!mem) return null;

    this.publishMilestone(
      DomainEventType.AI_CHAT_RENAMED,
      { conversationId, userId, title: trimmed },
      conversationId
    );

    return mem;
  }

  public async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const mem = this.inMemoryConversations.get(conversationId);
    if (mem && mem.userId !== userId) return false;

    this.inMemoryConversations.delete(conversationId);
    this.inMemoryMessages.delete(conversationId);

    try {
      if (this.db) {
        await this.db.delete(aiMessages).where(eq(aiMessages.conversationId, conversationId));
        await this.db
          .delete(aiConversations)
          .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
      }
    } catch (err) {
      this.logger.warn({ err }, "Could not delete conversation from DB");
    }

    this.publishMilestone(
      DomainEventType.AI_CHAT_DELETED,
      { conversationId, userId },
      conversationId
    );

    return true;
  }

  public async addMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
    context?: AiMessageContext
  ): Promise<AiMessage> {
    const id = `msg_${generateSecureRandomToken(12)}`;
    const now = new Date().toISOString();

    // Redact any secrets before storing or processing
    const cleanContent = redactSecrets(content);
    const cleanContext: AiMessageContext | undefined = context
      ? {
          ...context,
          codeSnippet: context.codeSnippet ? redactSecrets(context.codeSnippet) : undefined,
          errorMessage: context.errorMessage ? redactSecrets(context.errorMessage) : undefined,
          terminalOutput: context.terminalOutput ? redactSecrets(context.terminalOutput) : undefined,
        }
      : undefined;

    const message: AiMessage = {
      id,
      conversationId,
      role,
      content: cleanContent,
      context: cleanContext,
      createdAt: now,
    };

    const existing = this.inMemoryMessages.get(conversationId) || [];
    existing.push(message);
    this.inMemoryMessages.set(conversationId, existing);

    const conv = this.inMemoryConversations.get(conversationId);
    if (conv) {
      conv.updatedAt = now;
      conv.messageCount = existing.length;
    }

    try {
      if (this.db) {
        await this.db.insert(aiMessages).values({
          id,
          conversationId,
          role,
          content: cleanContent,
          context: cleanContext as any,
        });

        await this.db
          .update(aiConversations)
          .set({ updatedAt: new Date() })
          .where(eq(aiConversations.id, conversationId));
      }
    } catch (err) {
      this.logger.warn({ err }, "Could not write message to DB");
    }

    return message;
  }

  public abortStream(messageId: string): boolean {
    const controller = this.activeControllers.get(messageId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(messageId);
      return true;
    }
    return false;
  }

  /**
   * Stream prompt to Gemini and yield chunks.
   * Guaranteed to be strictly read-only: no tools or execution parameters are passed.
   */
  public async *streamPrompt(
    conversationId: string,
    userId: string,
    userPrompt: string,
    context?: AiMessageContext,
    modelOverride?: string
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const assistantMessageId = `msg_${generateSecureRandomToken(12)}`;
    const controller = new AbortController();
    this.activeControllers.set(assistantMessageId, controller);

    try {
      const apiKey = await this.getDecryptedKey(userId);
      if (!apiKey && !this.mockGenerator) {
        yield {
          type: "error",
          code: "API_KEY_MISSING",
          error: "No Gemini API key configured. Please set your API key in AI Settings to chat with Gemini.",
          messageId: assistantMessageId,
        };
        return;
      }

      // 2. Save user message to DB
      await this.addMessage(conversationId, AiRole.USER, userPrompt, context);

      const historyData = await this.getConversation(conversationId, userId);
      const pastMessages = historyData?.messages || [];

      let contextPrefix = "";
      if (context) {
        if (context.type === "selection" && context.codeSnippet) {
          contextPrefix += `\n[Context: Selected Code from ${context.filePath || "active file"}${
            context.startLine ? ` (lines ${context.startLine}-${context.endLine})` : ""
          }]:\n\`\`\`\n${redactSecrets(context.codeSnippet)}\n\`\`\`\n`;
        } else if (context.type === "error" && context.errorMessage) {
          contextPrefix += `\n[Context: Error Message]:\n${redactSecrets(context.errorMessage)}\n`;
          if (context.codeSnippet) {
            contextPrefix += `[At Code]:\n\`\`\`\n${redactSecrets(context.codeSnippet)}\n\`\`\`\n`;
          }
        } else if (context.type === "terminal" && context.terminalOutput) {
          contextPrefix += `\n[Context: Terminal Output]:\n\`\`\`\n${redactSecrets(context.terminalOutput)}\n\`\`\`\n`;
        }
      }

      const effectivePrompt = contextPrefix
        ? `${contextPrefix}\nUser Question: ${redactSecrets(userPrompt)}`
        : redactSecrets(userPrompt);

      let fullAssistantText = "";

      if (this.mockGenerator) {
        const historyForMock = pastMessages.slice(0, -1).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        for await (const chunk of this.mockGenerator(effectivePrompt, historyForMock, controller.signal)) {
          if (controller.signal.aborted) {
            yield {
              type: "error",
              code: "REQUEST_CANCELLED",
              error: "Generation stopped by user.",
              messageId: assistantMessageId,
            };
            return;
          }
          fullAssistantText += chunk;
          yield { type: "chunk", text: chunk, messageId: assistantMessageId };
        }
      } else {
        const selectedModel = modelOverride || DEFAULT_GEMINI_MODEL;
        const ai = new GoogleGenAI({ apiKey: apiKey! });

        const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

        // Add last 10 messages for context window management
        const windowed = pastMessages.slice(-10);
        for (const m of windowed) {
          if (m.role === AiRole.USER) {
            contents.push({ role: "user", parts: [{ text: m.content }] });
          } else if (m.role === AiRole.ASSISTANT) {
            contents.push({ role: "model", parts: [{ text: m.content }] });
          }
        }

        // STRICT ARCHITECTURAL LIMITATION:
        // Do NOT pass tools, functionDeclarations, or system execution primitives.
        const responseStream = await ai.models.generateContentStream({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: GEMINI_READ_ONLY_SYSTEM_PROMPT,
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        });

        for await (const chunk of responseStream) {
          if (controller.signal.aborted) {
            yield {
              type: "error",
              code: "REQUEST_CANCELLED",
              error: "Generation stopped by user.",
              messageId: assistantMessageId,
            };
            return;
          }
          const chunkText = chunk.text || "";
          if (chunkText) {
            fullAssistantText += chunkText;
            yield { type: "chunk", text: chunkText, messageId: assistantMessageId };
          }
        }
      }

      if (controller.signal.aborted) {
        yield {
          type: "error",
          code: "REQUEST_CANCELLED",
          error: "Generation stopped by user.",
          messageId: assistantMessageId,
        };
        return;
      }

      if (fullAssistantText.trim().length > 0) {
        await this.addMessage(conversationId, AiRole.ASSISTANT, fullAssistantText);

        this.publishMilestone(
          DomainEventType.AI_MESSAGE_COMPLETED,
          {
            conversationId,
            messageId: assistantMessageId,
            userId,
            length: fullAssistantText.length,
          },
          assistantMessageId
        );

        yield { type: "end", text: fullAssistantText, messageId: assistantMessageId };
      }
    } catch (err: any) {
      this.logger.error({ err }, "Error during Gemini stream generation");

      let errorMsg = err?.message || "An error occurred while communicating with Gemini.";
      let errorCode = "GEMINI_ERROR";

      if (err?.status === 429 || errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
        errorCode = "QUOTA_EXCEEDED";
        errorMsg = "Gemini API rate limit or quota exceeded. Please wait a moment or check your Google AI Studio plan.";
      } else if (
        err?.status === 400 &&
        (errorMsg.includes("API_KEY_INVALID") || errorMsg.includes("key not valid"))
      ) {
        errorCode = "INVALID_KEY";
        errorMsg = "The configured Gemini API key is invalid or expired. Please update it in AI Settings.";
      } else if (errorMsg.includes("AbortError") || controller.signal.aborted) {
        errorCode = "REQUEST_CANCELLED";
        errorMsg = "Request was cancelled.";
      } else if (errorMsg.includes("ETIMEDOUT") || errorMsg.includes("timeout")) {
        errorCode = "TIMEOUT";
        errorMsg = "Gemini request timed out. Please try again.";
      }

      yield {
        type: "error",
        code: errorCode,
        error: errorMsg,
        messageId: assistantMessageId,
      };
    } finally {
      this.activeControllers.delete(assistantMessageId);
    }
  }
}

export const aiAssistantService = new AiAssistantService();
