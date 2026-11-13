"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Terminal as TerminalIcon,
  Plus,
  X,
  Columns,
  Square,
  RefreshCw,
  AlertCircle,
  Cpu,
} from "lucide-react";
import { TerminalSession } from "@remote-ide/shared";
import { XtermView } from "./xterm-view";

export interface TerminalContainerProps {
  gatewayUrl?: string;
  className?: string;
}

export const TerminalContainer: React.FC<TerminalContainerProps> = ({
  gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4000",
  className = "",
}) => {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [secondarySessionId, setSecondarySessionId] = useState<string | null>(null);
  const [isSplit, setIsSplit] = useState(false);
  const [availableShells, setAvailableShells] = useState<string[]>([]);
  const [selectedShell, setSelectedShell] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch host available shells and running sessions
  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const [sessRes, shellRes] = await Promise.all([
        fetch(`${gatewayUrl}/api/v1/terminals`, { headers }).catch(() => null),
        fetch(`${gatewayUrl}/api/v1/terminals/shells`, { headers }).catch(() => null),
      ]);

      if (sessRes && sessRes.ok) {
        const data = await sessRes.json();
        const list: TerminalSession[] = data.data || [];
        setSessions(list);
        if (list.length > 0 && !activeSessionId && list[0]) {
          setActiveSessionId(list[0].id);
        }
      }

      if (shellRes && shellRes.ok) {
        const sdata = await shellRes.json();
        const shells = sdata.data?.shells || [];
        setAvailableShells(shells);
        if (shells.length > 0 && !selectedShell) {
          setSelectedShell(shells[0]);
        }
      }
    } catch {
      setError("Failed to query terminal sessions from host agent.");
    } finally {
      setIsLoading(false);
    }
  }, [gatewayUrl, activeSessionId, selectedShell]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  // Create a new terminal tab
  const handleCreateTerminal = async (shellOverride?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${gatewayUrl}/api/v1/terminals`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          shell: shellOverride || selectedShell || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to create terminal session");
      }

      const newSession: TerminalSession = data.data;
      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(newSession.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error creating terminal");
    } finally {
      setIsLoading(false);
    }
  };

  // Close a terminal tab
  const handleCloseTerminal = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      await fetch(`${gatewayUrl}/api/v1/terminals/${sessionId}`, {
        method: "DELETE",
        headers,
      });

      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        if (activeSessionId === sessionId) {
          setActiveSessionId(next.length > 0 && next[0] ? next[0].id : null);
        }
        if (secondarySessionId === sessionId) {
          setSecondarySessionId(null);
        }
        return next;
      });
    } catch {
      // Offline fallback
    }
  };

  return (
    <div className={`w-full h-full flex flex-col bg-[#09090b] text-zinc-300 ${className}`}>
      {/* Tab Bar Header */}
      <div className="h-7 bg-[#141417] border-b border-zinc-800 flex items-center justify-between px-2 text-xs select-none shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {sessions.map((sess, idx) => {
            const isActive = sess.id === activeSessionId;
            return (
              <div
                key={sess.id}
                onClick={() => setActiveSessionId(sess.id)}
                className={`h-6 px-2 flex items-center gap-1.5 rounded-t border-t border-x text-xs cursor-pointer transition-colors ${
                  isActive
                    ? "bg-[#09090b] border-zinc-700 text-zinc-100 font-medium"
                    : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                }`}
              >
                <TerminalIcon className="w-3 h-3 text-indigo-400" />
                <span className="truncate max-w-[120px] font-mono text-[11px]">
                  {sess.name || `bash ${idx + 1}`}
                </span>
                <button
                  onClick={(e) => void handleCloseTerminal(sess.id, e)}
                  className="p-0.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 ml-1"
                  title="Close Terminal"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}

          {/* Plus Button to spawn new terminal */}
          <button
            onClick={() => void handleCreateTerminal()}
            disabled={isLoading}
            className="h-5 px-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center gap-1 text-[11px] transition-colors"
            title="Create New Terminal"
          >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">New Terminal</span>
          </button>
        </div>

        {/* Right Tools (Shell selector, Split toggle, Refresh) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {availableShells.length > 1 && (
            <select
              value={selectedShell}
              onChange={(e) => setSelectedShell(e.target.value)}
              className="bg-[#18181b] border border-zinc-700 rounded text-[10px] text-zinc-300 px-1 py-0.5 focus:outline-none"
              title="Select Shell Type"
            >
              {availableShells.map((s) => (
                <option key={s} value={s}>
                  {s.split("/").pop()}
                </option>
              ))}
            </select>
          )}

          {sessions.length > 1 && (
            <button
              onClick={() => {
                if (!isSplit) {
                  // Pick second terminal
                  const second = sessions.find((s) => s.id !== activeSessionId);
                  if (second) setSecondarySessionId(second.id);
                }
                setIsSplit((prev) => !prev);
              }}
              className={`p-1 rounded transition-colors ${
                isSplit
                  ? "text-indigo-400 bg-indigo-950/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
              title={isSplit ? "Single View" : "Split Terminal View"}
            >
              {isSplit ? <Square className="w-3 h-3" /> : <Columns className="w-3 h-3" />}
            </button>
          )}

          <button
            onClick={() => void fetchSessions()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Refresh Terminals"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div className="p-2 bg-red-950/40 border-b border-red-800/60 flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Terminal Display Canvas */}
      <div className="flex-1 w-full h-full overflow-hidden flex">
        {sessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
            <Cpu className="w-10 h-10 text-indigo-400/50 mb-3" />
            <p className="text-xs font-medium text-zinc-300">No Active Terminal Sessions</p>
            <p className="text-[11px] text-zinc-500 max-w-sm mt-1">
              Interactive terminal sessions run natively on your host machine and persist across
              browser disconnections.
            </p>
            <button
              onClick={() => void handleCreateTerminal()}
              className="mt-4 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Launch Host Terminal
            </button>
          </div>
        ) : (
          <>
            {/* Primary Terminal */}
            {activeSessionId && (
              <div className="flex-1 h-full min-w-0">
                <XtermView
                  key={activeSessionId}
                  sessionId={activeSessionId}
                  gatewayUrl={gatewayUrl}
                  onClose={() => void handleCloseTerminal(activeSessionId)}
                />
              </div>
            )}

            {/* Split Secondary Terminal */}
            {isSplit && secondarySessionId && (
              <div className="flex-1 h-full min-w-0 border-l border-zinc-800">
                <XtermView
                  key={secondarySessionId}
                  sessionId={secondarySessionId}
                  gatewayUrl={gatewayUrl}
                  onClose={() => {
                    setIsSplit(false);
                    setSecondarySessionId(null);
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
