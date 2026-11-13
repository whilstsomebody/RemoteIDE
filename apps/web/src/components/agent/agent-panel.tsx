"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Send, X, Bot, FileCode, ShieldCheck, Copy, Check } from "lucide-react";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  fileContext?: string;
}

export interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  activeFilePath: string | null;
  cursorLine?: number;
  workspaceName?: string;
  hostName?: string;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  isOpen,
  onClose,
  width,
  onWidthChange,
  activeFilePath,
  cursorLine,
  workspaceName = "Workspace",
  hostName = "Local Host",
}) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      sender: "assistant",
      text: `Hello! I am your host-connected Coding Agent for **${workspaceName}**. Ask me to explain code, generate features, diagnose errors, or inspect filesystem events on ${hostName}.`,
      timestamp: "Just now",
    },
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Resizing handler on the left border of this panel
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = startXRef.current - e.clientX;
      const newWidth = Math.max(280, Math.min(650, startWidthRef.current + deltaX));
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

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  const handleSend = () => {
    if (!input.trim() || isThinking) return;

    const userText = input.trim();
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: userText,
      timestamp: now,
      fileContext: activeFilePath
        ? `${activeFilePath}${cursorLine ? `:${cursorLine}` : ""}`
        : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    // Realistic assistant response based on host context and active file
    setTimeout(() => {
      let replyText = `I analyzed your request regarding **${workspaceName}**.`;

      const lower = userText.toLowerCase();
      if (lower.includes("explain") && activeFilePath) {
        replyText = `**File Analysis for \`${activeFilePath}\`**:\n\nThis file is loaded from your host computer with active ETag validation. It participates in optimistic concurrency and local draft journal replication. All updates execute atomically on the host agent.`;
      } else if (lower.includes("test")) {
        replyText = `To test this feature across the monorepo, you can run:\n\`\`\`bash\npnpm --filter @remote-ide/web test\n\`\`\`\nAll test suites run in sandboxed Vitest with isolated mock environments.`;
      } else if (lower.includes("bug") || lower.includes("security")) {
        replyText = `No security violations detected in the active buffer. RemoteIDE prevents symlink escapes, path traversals via \`..\`, and unauthorized workspace root boundaries on the host daemon.`;
      } else {
        replyText = `Understood. I have verified your request against the workspace context. Any file updates will be dispatched through the host filesystem service with full journal history.`;
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: "assistant",
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsThinking(false);
    }, 700);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      className="bg-[#18181b] border-l border-[#27272a] flex flex-col h-full text-xs select-none shrink-0 relative transition-[width] duration-75 z-20 shadow-xl"
    >
      {/* Resizer Handle on Left Edge */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 bg-transparent hover:bg-indigo-500/80 cursor-col-resize transition-colors absolute top-0 bottom-0 left-0 z-30"
      />

      {/* Header */}
      <div className="h-9 px-3 border-b border-[#27272a] bg-[#1e1e1e] flex items-center justify-between text-zinc-200">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-xs tracking-tight">Coding Agent</span>
          <span className="px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/40 text-[10px] font-mono">
            Host Connected
          </span>
        </div>

        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800"
          title="Close Agent Panel (Cmd+Shift+A)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Active Context Bar */}
      {activeFilePath && (
        <div className="px-3 py-1.5 bg-zinc-950/70 border-b border-[#27272a] flex items-center gap-2 text-[11px] text-zinc-400 font-mono truncate">
          <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="truncate flex-1">
            {activeFilePath}
            {cursorLine ? `:${cursorLine}` : ""}
          </span>
          <span className="text-[10px] text-zinc-500 font-sans">Active Context</span>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans select-text">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col space-y-1 ${
              msg.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 px-1">
              {msg.sender === "user" ? (
                <>
                  <span>You</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </>
              ) : (
                <>
                  <Bot className="w-3 h-3 text-indigo-400" />
                  <span className="text-indigo-300 font-medium">RemoteIDE Assistant</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </>
              )}
            </div>

            <div
              className={`max-w-[92%] rounded-lg p-3 text-xs leading-relaxed relative group ${
                msg.sender === "user"
                  ? "bg-indigo-600/90 text-white shadow-sm"
                  : "bg-[#252526] text-zinc-200 border border-[#3c3c3c]"
              }`}
            >
              {msg.fileContext && (
                <div className="mb-1 text-[10px] text-indigo-200 bg-indigo-950/40 px-1.5 py-0.5 rounded font-mono inline-block">
                  @{msg.fileContext}
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.text}</div>

              {msg.sender === "assistant" && (
                <button
                  onClick={() => handleCopy(msg.id, msg.text)}
                  className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 p-1 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition-opacity"
                  title="Copy message"
                >
                  {copiedId === msg.id ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 p-2 bg-[#252526]/50 rounded border border-zinc-800 animate-pulse">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            <span>Coding Agent is inspecting context...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-3 py-1.5 border-t border-[#27272a] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        {["Explain active file", "Find potential bugs", "Generate unit tests"].map((prompt) => (
          <button
            key={prompt}
            onClick={() => {
              setInput(prompt);
            }}
            className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-zinc-300 hover:text-white shrink-0 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-[#27272a] bg-[#1e1e1e] shrink-0 space-y-2">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask agent about your workspace, code, or terminal..."
            rows={2}
            className="w-full bg-[#252526] border border-[#3c3c3c] focus:border-indigo-500 rounded p-2 text-xs text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none font-sans"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="absolute bottom-2.5 right-2 p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded transition-colors shadow"
            title="Send (Enter)"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
          <span>Shift+Enter for newline</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="w-3 h-3" /> Host Sandboxed
          </span>
        </div>
      </div>
    </aside>
  );
};
