"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles,
  Send,
  X,
  Bot,
  Copy,
  Check,
  RotateCcw,
  Square,
  Key,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ShieldAlert,
  Code2,
  AlertTriangle,
  Terminal,
  ExternalLink,
} from "lucide-react";
import {
  AiConversation,
  AiMessage,
  AiMessageContext,
  AiSettings,
  DEFAULT_GEMINI_MODEL,
  GEMINI_PRIVACY_DISCLAIMER,
  SUPPORTED_GEMINI_MODELS,
} from "@remote-ide/shared";

export interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  workspaceId: string;
  workspaceName?: string;
  gatewayUrl?: string;
  token?: string;
  activeFilePath?: string | null;
  cursorLine?: number;
  selectedText?: string;
  activeError?: string;
  activeTerminalOutput?: string;
  initialPrompt?: string;
  initialContext?: AiMessageContext;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  isOpen,
  onClose,
  width,
  onWidthChange,
  workspaceId,
  workspaceName = "Workspace",
  gatewayUrl = "http://localhost:4000",
  token,
  activeFilePath,
  cursorLine,
  selectedText,
  activeError,
  activeTerminalOutput,
  initialPrompt,
  initialContext,
}) => {
  // Settings & Key state
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Conversations state
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isConversationsDropdownOpen, setIsConversationsDropdownOpen] = useState(false);

  // Streaming / Generation state
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Active attached context
  const [attachedContext, setAttachedContext] = useState<AiMessageContext | null>(null);

  // Renaming chat state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamedTitle, setRenamedTitle] = useState("");

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const abortControllerRef = useRef<AbortController | null>(null);

  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // Load Settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/ai/settings`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success && body.data) {
          setSettings(body.data);
          if (body.data.model) setSelectedModel(body.data.model);
        }
      }
    } catch {
      // Offline fallback
    }
  }, [gatewayUrl, authHeaders]);

  // Load Conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/ai/conversations?workspaceId=${encodeURIComponent(workspaceId)}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success && Array.isArray(body.data)) {
          setConversations(body.data);
          if (body.data.length > 0 && !activeConversationId) {
            setActiveConversationId(body.data[0].id);
          }
        }
      }
    } catch {
      // Offline fallback
    }
  }, [gatewayUrl, workspaceId, activeConversationId, authHeaders]);

  // Load Conversation Messages
  const fetchMessages = useCallback(
    async (convId: string) => {
      setIsLoadingMessages(true);
      setErrorBanner(null);
      try {
        const res = await fetch(`${gatewayUrl}/api/v1/ai/conversations/${encodeURIComponent(convId)}`, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const body = await res.json();
          if (body.success && body.data) {
            setMessages(body.data.messages || []);
          }
        }
      } catch {
        // Offline fallback
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [gatewayUrl, authHeaders]
  );

  useEffect(() => {
    if (isOpen) {
      void fetchSettings();
      void fetchConversations();
    }
  }, [isOpen, fetchSettings, fetchConversations]);

  useEffect(() => {
    if (activeConversationId) {
      void fetchMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, fetchMessages]);

  // Handle incoming initial prompt or context
  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
    }
    if (initialContext) {
      setAttachedContext(initialContext);
    }
  }, [initialPrompt, initialContext]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, isStreaming]);

  // Handle Resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = startXRef.current - e.clientX;
      const newWidth = Math.max(300, Math.min(800, startWidthRef.current + deltaX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onWidthChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  // Create New Chat
  const handleCreateNewChat = async (title = "New Chat") => {
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/ai/conversations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          workspaceId,
          title,
        }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success && body.data) {
          setConversations((prev) => [body.data, ...prev]);
          setActiveConversationId(body.data.id);
          setIsConversationsDropdownOpen(false);
          setMessages([]);
          return body.data.id;
        }
      }
    } catch {
      // Fallback
    }
    return null;
  };

  // Rename Chat
  const handleRenameChat = async () => {
    if (!activeConversationId || !renamedTitle.trim()) return;
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/ai/conversations/${encodeURIComponent(activeConversationId)}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ title: renamedTitle.trim() }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversationId ? { ...c, title: renamedTitle.trim() } : c))
        );
        setIsRenaming(false);
      }
    } catch {
      // Ignore
    }
  };

  // Delete Chat
  const handleDeleteChat = async (convId: string) => {
    if (!window.confirm("Are you sure you want to delete this chat conversation?")) return;
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/ai/conversations/${encodeURIComponent(convId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (activeConversationId === convId) {
          const remaining = conversations.filter((c) => c.id !== convId);
          setActiveConversationId(remaining.length > 0 ? remaining[0]?.id || null : null);
        }
      }
    } catch {
      // Ignore
    }
  };

  // Save API Key
  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setKeyError("Please enter a valid Gemini API key");
      return;
    }
    setIsSavingKey(true);
    setKeyError(null);
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/ai/settings`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          model: selectedModel,
        }),
      });
      const body = await res.json();
      if (res.ok && body.success) {
        setSettings(body.data);
        setIsKeyModalOpen(false);
        setApiKeyInput("");
      } else {
        setKeyError(body.error?.message || "Failed to save API key");
      }
    } catch (err: any) {
      setKeyError(err?.message || "Network error while saving key");
    } finally {
      setIsSavingKey(false);
    }
  };

  // Stop Generation
  const handleStopGeneration = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (activeMessageId) {
      try {
        await fetch(`${gatewayUrl}/api/v1/ai/messages/${encodeURIComponent(activeMessageId)}/cancel`, {
          method: "POST",
          headers: authHeaders(),
        });
      } catch {}
    }
    setIsStreaming(false);
  };

  // Send Prompt (Streaming with SSE)
  const handleSend = async (customPrompt?: string, customContext?: AiMessageContext) => {
    const promptToSend = (customPrompt || input).trim();
    if (!promptToSend || isStreaming) return;

    if (!settings?.hasKey) {
      setIsKeyModalOpen(true);
      return;
    }

    let convId = activeConversationId;
    if (!convId) {
      convId = await handleCreateNewChat(promptToSend.slice(0, 30));
      if (!convId) return;
    }

    const currentContext = customContext || attachedContext || undefined;

    // Create optimistic user message
    const tempUserMsg: AiMessage = {
      id: `u-${Date.now()}`,
      conversationId: convId,
      role: "user",
      content: promptToSend,
      context: currentContext,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setInput("");
    setAttachedContext(null);
    setIsStreaming(true);
    setStreamingText("");
    setErrorBanner(null);

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const res = await fetch(`${gatewayUrl}/api/v1/ai/conversations/${encodeURIComponent(convId)}/messages`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          prompt: promptToSend,
          context: currentContext,
          model: selectedModel,
        }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error?.message || `Request failed with status ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body received from server");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            try {
              const event = JSON.parse(dataStr);
              if (event.messageId) {
                setActiveMessageId(event.messageId);
              }
              if (event.type === "chunk" && event.text) {
                accumulated += event.text;
                setStreamingText(accumulated);
              } else if (event.type === "end" && event.text) {
                accumulated = event.text;
                setStreamingText("");
                const assistantMsg: AiMessage = {
                  id: event.messageId || `a-${Date.now()}`,
                  conversationId: convId!,
                  role: "assistant",
                  content: accumulated,
                  createdAt: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMsg]);
              } else if (event.type === "error") {
                setErrorBanner(event.error || "Generation error");
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setErrorBanner(err.message || "Failed to communicate with Gemini Assistant");
      }
    } finally {
      setIsStreaming(false);
      setStreamingText("");
      abortControllerRef.current = null;
      setActiveMessageId(null);
    }
  };

  // Quick Action Handlers
  const handleExplainSelection = () => {
    if (!selectedText) return;
    const ctx: AiMessageContext = {
      type: "selection",
      filePath: activeFilePath || undefined,
      startLine: cursorLine,
      codeSnippet: selectedText,
    };
    void handleSend("Explain this code selection in detail, including its purpose, potential edge cases, and performance considerations.", ctx);
  };

  const handleSuggestFix = () => {
    if (!activeError && !selectedText) return;
    const ctx: AiMessageContext = {
      type: "fix",
      filePath: activeFilePath || undefined,
      errorMessage: activeError || undefined,
      codeSnippet: selectedText || undefined,
    };
    void handleSend("Analyze this error or code and suggest a fix. Provide the corrected code in a code block for me to review.", ctx);
  };

  const handleExplainTerminal = () => {
    if (!activeTerminalOutput) return;
    const ctx: AiMessageContext = {
      type: "terminal",
      terminalOutput: activeTerminalOutput,
    };
    void handleSend("Explain this terminal output / stack trace and what steps I should take next.", ctx);
  };

  if (!isOpen) return null;

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  return (
    <aside
      style={{ width: `${width}px` }}
      className="h-full bg-zinc-950 border-l border-zinc-800 flex flex-col relative z-20 select-none overflow-hidden shrink-0 transition-[width] duration-75"
    >
      {/* Drag handle for resizing */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 transition-colors z-30"
      />

      {/* Top Header */}
      <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 bg-zinc-900/80 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 text-indigo-400" />
          </div>
          <span className="text-xs font-semibold text-zinc-100 font-sans truncate">
            Gemini Assistant
          </span>
          <span className="text-[10px] text-zinc-500 font-mono truncate hidden sm:inline">
            ({workspaceName})
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono hidden sm:inline">
            Read-Only
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Key Settings Button */}
          <button
            onClick={() => setIsKeyModalOpen(true)}
            title="Configure Gemini API Key & Model"
            className={`p-1.5 rounded transition-colors ${
              settings?.hasKey
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                : "text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-800/60"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
          </button>

          {/* New Chat Button */}
          <button
            onClick={() => void handleCreateNewChat()}
            title="New Conversation"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Close Sidebar */}
          <button
            onClick={onClose}
            title="Close Assistant"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Conversation Selector & Title Bar */}
      <div className="px-3 py-2 border-b border-zinc-850 bg-zinc-900/40 flex items-center justify-between text-xs gap-2 shrink-0">
        <div className="relative flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={renamedTitle}
                onChange={(e) => setRenamedTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleRenameChat()}
                className="w-full bg-zinc-900 border border-indigo-500 rounded px-2 py-0.5 text-xs text-zinc-200 outline-none"
                autoFocus
              />
              <button
                onClick={() => void handleRenameChat()}
                className="p-1 text-emerald-400 hover:bg-zinc-800 rounded"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => setIsRenaming(false)}
                className="p-1 text-zinc-400 hover:bg-zinc-800 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsConversationsDropdownOpen((prev) => !prev)}
              className="w-full flex items-center justify-between gap-1 text-left px-2 py-1 bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800 rounded text-xs text-zinc-300 font-medium truncate transition-colors"
            >
              <span className="truncate">{activeConv?.title || "Conversations"}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            </button>
          )}

          {/* Dropdown Menu */}
          {isConversationsDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded shadow-xl py-1 z-40 max-h-56 overflow-y-auto">
              <button
                onClick={() => void handleCreateNewChat()}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-indigo-400 hover:bg-zinc-800/80 transition-colors border-b border-zinc-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Start New Conversation</span>
              </button>
              {conversations.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-zinc-500 italic">No past chats</div>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setActiveConversationId(c.id);
                      setIsConversationsDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs transition-colors ${
                      c.id === activeConversationId
                        ? "bg-indigo-600/20 text-indigo-300 font-medium"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    <span className="truncate">{c.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteChat(c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Rename & Delete for Active Chat */}
        {activeConv && !isRenaming && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                setRenamedTitle(activeConv.title);
                setIsRenaming(true);
              }}
              title="Rename Chat"
              className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-850"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => void handleDeleteChat(activeConv.id)}
              title="Delete Chat"
              className="p-1 text-zinc-500 hover:text-rose-400 rounded hover:bg-zinc-850"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Warning / Setup Banner if Key Missing */}
      {!settings?.hasKey && (
        <div className="px-3 py-2 bg-amber-950/40 border-b border-amber-800/40 flex items-start gap-2 text-xs text-amber-300">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Gemini API Key Required</p>
            <p className="text-[11px] text-amber-400/80 mt-0.5">
              Enter your Google Gemini API key to activate chat.
            </p>
            <button
              onClick={() => setIsKeyModalOpen(true)}
              className="mt-1.5 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold text-[11px] transition-colors"
            >
              Configure API Key
            </button>
          </div>
        </div>
      )}

      {/* Error Alert Banner */}
      {errorBanner && (
        <div className="px-3 py-2 bg-rose-950/50 border-b border-rose-800/60 flex items-start gap-2 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] leading-relaxed">{errorBanner}</div>
          <button onClick={() => setErrorBanner(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Messages List Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 select-text">
        {isLoadingMessages ? (
          <div className="text-center py-8 text-xs text-zinc-500 italic">Loading messages...</div>
        ) : messages.length === 0 && !streamingText ? (
          <div className="flex flex-col items-center justify-center text-center py-10 space-y-4">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Bot className="w-6 h-6 text-zinc-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-200">Ask Gemini anything</p>
              <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                Code explanations, debugging suggestions, programming queries, and syntax help.
              </p>
            </div>

            {/* Quick Context Action Prompts */}
            <div className="w-full space-y-2 pt-2">
              {selectedText && (
                <button
                  onClick={handleExplainSelection}
                  className="w-full flex items-center gap-2 p-2 rounded bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800 text-left text-xs text-zinc-300 transition-colors"
                >
                  <Code2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="truncate">Explain selected code</span>
                </button>
              )}

              {activeError && (
                <button
                  onClick={handleSuggestFix}
                  className="w-full flex items-center gap-2 p-2 rounded bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800 text-left text-xs text-zinc-300 transition-colors"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">Suggest fix for current error</span>
                </button>
              )}

              {activeTerminalOutput && (
                <button
                  onClick={handleExplainTerminal}
                  className="w-full flex items-center gap-2 p-2 rounded bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800 text-left text-xs text-zinc-300 transition-colors"
                >
                  <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">Explain terminal output</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <ChatMessageItem
              key={m.id}
              message={m}
              onRetry={
                m.role === "assistant" && messages[messages.length - 1]?.id === m.id
                  ? () => {
                      const userMsg = messages[messages.length - 2];
                      if (userMsg && userMsg.role === "user") {
                        void handleSend(userMsg.content, userMsg.context);
                      }
                    }
                  : undefined
              }
            />
          ))
        )}

        {/* Real-time Streaming Bubble */}
        {isStreaming && streamingText && (
          <div className="flex flex-col gap-1.5 items-start">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-sans">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              <span>Gemini</span>
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            </div>
            <div className="bg-zinc-900 border border-zinc-800/80 rounded-lg p-3 text-xs text-zinc-200 leading-relaxed max-w-full overflow-hidden">
              <RenderMarkdown text={streamingText} />
              <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Attached Context Preview Pill */}
      {attachedContext && (
        <div className="px-3 py-1.5 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between text-[11px] text-indigo-300 shrink-0">
          <div className="flex items-center gap-1.5 truncate">
            <Code2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-mono truncate">
              {attachedContext.type === "selection"
                ? `Attached code: ${attachedContext.filePath || "selected text"}`
                : attachedContext.type === "error"
                ? `Attached error`
                : "Attached context"}
            </span>
          </div>
          <button
            onClick={() => setAttachedContext(null)}
            className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Composer Input Area */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 shrink-0 space-y-2">
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              settings?.hasKey
                ? "Ask a question about your code or architecture..."
                : "Configure API Key above to chat..."
            }
            disabled={!settings?.hasKey || isStreaming}
            rows={2}
            className="w-full resize-none bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-md p-2.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none leading-relaxed font-sans pr-10"
          />

          {isStreaming ? (
            <button
              onClick={handleStopGeneration}
              title="Stop Generation"
              className="absolute right-2.5 p-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || !settings?.hasKey}
              title="Send Message"
              className="absolute right-2.5 p-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Footer Disclaimer */}
        <p className="text-[10px] text-zinc-500 text-center select-none font-sans">
          RemoteIDE Assistant is read-only. Generated suggestions must be applied manually.
        </p>
      </div>

      {/* API Key & Model Configuration Modal */}
      {isKeyModalOpen && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-zinc-100 font-sans">Gemini API Settings</h3>
              </div>
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Google Gemini API Key
                </label>
                <input
                  type="password"
                  placeholder={settings?.maskedKey || "AIzaSy..."}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Get a key from{" "}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 underline inline-flex items-center gap-0.5"
                  >
                    Google AI Studio <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Gemini Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-indigo-500 font-sans"
                >
                  {SUPPORTED_GEMINI_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m} {m === DEFAULT_GEMINI_MODEL ? "(Recommended)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {keyError && <p className="text-xs text-rose-400">{keyError}</p>}

              {/* Privacy Notice */}
              <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                <p className="font-semibold text-zinc-300">Third-Party Processing Notice</p>
                <p className="text-[10px] leading-relaxed">{GEMINI_PRIVACY_DISCLAIMER}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              {settings?.hasKey && (
                <button
                  onClick={async () => {
                    await fetch(`${gatewayUrl}/api/v1/ai/settings`, {
                      method: "DELETE",
                      headers: authHeaders(),
                    });
                    setSettings(null);
                    setIsKeyModalOpen(false);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300"
                >
                  Remove Key
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setIsKeyModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveApiKey}
                  disabled={isSavingKey}
                  className="px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                >
                  {isSavingKey ? "Saving..." : "Save Key"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

// Render Individual Chat Message
const ChatMessageItem: React.FC<{
  message: AiMessage;
  onRetry?: () => void;
}> = ({ message, onRetry }) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-sans">
        {isUser ? (
          <span>You</span>
        ) : (
          <div className="flex items-center gap-1 text-indigo-400">
            <Bot className="w-3.5 h-3.5" />
            <span>Gemini</span>
          </div>
        )}
        <span className="text-[10px] text-zinc-600">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Message Context Attached */}
      {message.context && (
        <div className="max-w-[85%] px-2.5 py-1 rounded bg-zinc-900/60 border border-zinc-800 text-[10px] text-indigo-300 font-mono truncate">
          {message.context.filePath ? `Context: ${message.context.filePath}` : "Context attached"}
        </div>
      )}

      {/* Content Bubble */}
      <div
        className={`rounded-lg p-3 text-xs leading-relaxed max-w-[92%] overflow-hidden ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-none"
            : "bg-zinc-900 border border-zinc-800/80 text-zinc-200 rounded-bl-none"
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap font-sans">{message.content}</div>
        ) : (
          <RenderMarkdown text={message.content} />
        )}
      </div>

      {/* Retry Button for Assistant Messages */}
      {!isUser && onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 mt-0.5 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Retry response</span>
        </button>
      )}
    </div>
  );
};

// Simple, Safe Markdown and Code Block Renderer
const RenderMarkdown: React.FC<{ text: string }> = ({ text }) => {
  // Split on triple backticks for fenced code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 font-sans">
      {parts.map((part, idx) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const firstLineEnd = part.indexOf("\n");
          const lang = part.slice(3, firstLineEnd).trim() || "code";
          const code = part.slice(firstLineEnd + 1, -3);
          return <CodeBlock key={idx} language={lang} code={code} />;
        }

        // Inline formatting for non-code block text
        return (
          <div key={idx} className="whitespace-pre-wrap leading-relaxed text-zinc-200">
            {renderInlineMarkdown(part)}
          </div>
        );
      })}
    </div>
  );
};

// Code block with Copy button
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden my-2 font-mono">
      <div className="flex items-center justify-between px-3 py-1 bg-zinc-900/80 border-b border-zinc-800 text-[11px] text-zinc-400">
        <span className="text-zinc-400 font-semibold">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copied" : "Copy code"}</span>
        </button>
      </div>
      <pre className="p-3 text-[11px] text-zinc-200 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// Inline Markdown formatter (bold, inline code, links)
function renderInlineMarkdown(raw: string): React.ReactNode {
  // Bold **text**
  const boldParts = raw.split(/(\*\*.*?\*\*)/g);
  return boldParts.map((bPart, bIdx) => {
    if (bPart.startsWith("**") && bPart.endsWith("**")) {
      return (
        <strong key={bIdx} className="font-semibold text-zinc-100">
          {bPart.slice(2, -2)}
        </strong>
      );
    }

    // Inline `code`
    const codeParts = bPart.split(/(`.*?`)/g);
    return codeParts.map((cPart, cIdx) => {
      if (cPart.startsWith("`") && cPart.endsWith("`")) {
        return (
          <code
            key={cIdx}
            className="px-1 py-0.5 rounded bg-zinc-800 text-indigo-300 font-mono text-[11px]"
          >
            {cPart.slice(1, -1)}
          </code>
        );
      }
      return cPart;
    });
  });
}
