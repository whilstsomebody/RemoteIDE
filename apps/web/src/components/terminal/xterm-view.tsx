"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import {
  Search,
  ChevronUp,
  ChevronDown,
  X,
  RefreshCw,
  AlertCircle,
  Wifi,
  WifiOff,
} from "lucide-react";

export interface XtermViewProps {
  sessionId: string;
  gatewayUrl?: string;
  onClose?: () => void;
  className?: string;
}

export const XtermView: React.FC<XtermViewProps> = ({
  sessionId,
  gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4000",
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const connectWebSocket = useCallback(() => {
    if (!sessionId || typeof window === "undefined") return;

    setConnectionState("connecting");
    setErrorMessage(null);

    const wsBase = gatewayUrl.replace(/^http/i, "ws");
    const token = localStorage.getItem("remote_ide_token") || "";
    const wsUrl = `${wsBase}/api/v1/terminals/${encodeURIComponent(sessionId)}/stream${
      token ? `?token=${encodeURIComponent(token)}` : ""
    }`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState("connected");
        if (fitAddonRef.current && termRef.current) {
          fitAddonRef.current.fit();
          const { cols, rows } = termRef.current;
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output" && typeof msg.data === "string") {
            termRef.current?.write(msg.data);
          } else if (msg.type === "attached" && typeof msg.buffer === "string") {
            termRef.current?.clear();
            termRef.current?.write(msg.buffer);
          } else if (msg.type === "error") {
            setErrorMessage(msg.message || "Terminal stream error");
          }
        } catch {
          if (typeof event.data === "string") {
            termRef.current?.write(event.data);
          }
        }
      };

      ws.onerror = () => {
        setConnectionState("error");
        setErrorMessage("Connection error communicating with remote terminal stream.");
      };

      ws.onclose = (event) => {
        setConnectionState("disconnected");
        if (event.code === 4403) {
          setErrorMessage(
            "Access denied: Interactive terminal execution is restricted to host owner only."
          );
        } else if (event.code === 4401) {
          setErrorMessage("Unauthorized session. Please authenticate as owner.");
        }
      };
    } catch (err: unknown) {
      setConnectionState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to establish terminal WebSocket"
      );
    }
  }, [gatewayUrl, sessionId]);

  // Dynamically load xterm and addons on client-side only
  useEffect(() => {
    let isMounted = true;
    let inputDisposable: { dispose(): void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

    async function initXterm() {
      if (!containerRef.current || typeof window === "undefined") return;

      const [
        { Terminal: XTerminal },
        { FitAddon: XFitAddon },
        { SearchAddon: XSearchAddon },
        { WebLinksAddon: XWebLinksAddon },
      ] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-search"),
        import("@xterm/addon-web-links"),
      ]);

      if (!isMounted || !containerRef.current) return;

      const term = new XTerminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
        fontSize: 12,
        lineHeight: 1.25,
        theme: {
          background: "#09090b",
          foreground: "#e4e4e7",
          cursor: "#818cf8",
          selectionBackground: "#3730a3",
          black: "#18181b",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#f4f4f5",
          brightBlack: "#52525b",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#fde047",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#38bdf8",
          brightWhite: "#ffffff",
        },
        allowProposedApi: true,
        scrollback: 5000,
      });

      const fitAddon = new XFitAddon();
      const searchAddon = new XSearchAddon();
      const webLinksAddon = new XWebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(searchAddon);
      term.loadAddon(webLinksAddon);

      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      // Handle user keystrokes / input
      inputDisposable = term.onData((data) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "input", data }));
        }
      });

      // Synchronize dimensions on container resize
      resizeObserver = new ResizeObserver(() => {
        if (containerRef.current && fitAddonRef.current && termRef.current) {
          try {
            fitAddonRef.current.fit();
            const { cols, rows } = termRef.current;
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
            }
          } catch {
            // Container unmounted or hidden
          }
        }
      });

      resizeObserver.observe(containerRef.current);
      connectWebSocket();
    }

    void initXterm();

    return () => {
      isMounted = false;
      if (inputDisposable) inputDisposable.dispose();
      if (resizeObserver) resizeObserver.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [connectWebSocket]);

  // Search shortcuts (Cmd+F / Ctrl+F)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setIsSearchOpen(true);
    }
  };

  const handleSearchNext = () => {
    if (searchQuery && searchAddonRef.current) {
      searchAddonRef.current.findNext(searchQuery);
    }
  };

  const handleSearchPrevious = () => {
    if (searchQuery && searchAddonRef.current) {
      searchAddonRef.current.findPrevious(searchQuery);
    }
  };

  return (
    <div
      className={`relative w-full h-full flex flex-col bg-[#09090b] text-zinc-200 select-text ${className}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Top Banner (Status, Reconnect, Search Trigger) */}
      <div className="h-6 bg-[#121215] border-b border-zinc-800/80 px-2 flex items-center justify-between text-[11px] select-none shrink-0">
        <div className="flex items-center gap-2">
          {connectionState === "connected" && (
            <span className="flex items-center gap-1 text-emerald-400">
              <Wifi className="w-3 h-3" />
              <span>Host PTY Connected</span>
            </span>
          )}
          {connectionState === "connecting" && (
            <span className="flex items-center gap-1 text-amber-400">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Connecting to PTY...</span>
            </span>
          )}
          {connectionState === "disconnected" && (
            <span className="flex items-center gap-1 text-zinc-500">
              <WifiOff className="w-3 h-3" />
              <span>Disconnected (Shell persists on host)</span>
            </span>
          )}
          {connectionState === "error" && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertCircle className="w-3 h-3" />
              <span>Error</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {connectionState !== "connected" && (
            <button
              onClick={connectWebSocket}
              className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center gap-1 text-[10px]"
              title="Reconnect to Persistent Session"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Reconnect
            </button>
          )}

          <button
            onClick={() => setIsSearchOpen((prev) => !prev)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Search Output (Cmd+F)"
          >
            <Search className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Floating In-Terminal Search Overlay */}
      {isSearchOpen && (
        <div className="absolute top-7 right-3 z-20 bg-[#18181b] border border-zinc-700 rounded shadow-xl p-1 flex items-center gap-1 text-xs">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchAddonRef.current?.findNext(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) handleSearchPrevious();
                else handleSearchNext();
              } else if (e.key === "Escape") {
                setIsSearchOpen(false);
              }
            }}
            placeholder="Search terminal..."
            className="w-36 bg-[#09090b] text-zinc-200 px-2 py-0.5 rounded border border-zinc-700 text-xs focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          <button
            onClick={handleSearchPrevious}
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded"
            title="Previous Match (Shift+Enter)"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSearchNext}
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded"
            title="Next Match (Enter)"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsSearchOpen(false)}
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded"
            title="Close Search (Escape)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Message Alert */}
      {errorMessage && (
        <div className="bg-red-950/60 border-b border-red-800/80 px-3 py-1.5 flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-0.5 text-red-400 hover:text-red-200"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Terminal Viewport */}
      <div ref={containerRef} className="flex-1 w-full h-full overflow-hidden p-1 bg-[#09090b]" />
    </div>
  );
};
