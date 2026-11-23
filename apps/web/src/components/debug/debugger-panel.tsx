"use client";

import React, { useState, useEffect } from "react";
import {
  Bug,
  Play,
  Pause,
  Square,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Layers,
  Variable as VariableIcon,
  Eye,
  Terminal,
  Circle,
} from "lucide-react";
import { cn } from "@remote-ide/ui";
import { DebugSession, DebugSessionStatus, StackFrame, Scope, Variable } from "@remote-ide/shared";

export interface DebuggerPanelProps {
  gatewayUrl?: string;
  workspaceId?: string;
  currentFilePath?: string;
  onNavigateToFile?: (path: string, line: number, col?: number) => void;
}

export const DebuggerPanel: React.FC<DebuggerPanelProps> = ({
  gatewayUrl = "",
  workspaceId = "default",
  currentFilePath = "",
  onNavigateToFile,
}) => {
  const baseUrl = gatewayUrl.replace(/\/+$/, "");

  const [activeSession, setActiveSession] = useState<DebugSession | null>(null);
  const [debugTarget, setDebugTarget] = useState<"current" | "custom" | "attach">("current");
  const [customPath, setCustomPath] = useState<string>("index.js");
  const [attachPort, setAttachPort] = useState<number>(9229);
  const [stopOnEntry] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [callStack, setCallStack] = useState<StackFrame[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [expandedScopes, setExpandedScopes] = useState<Record<string, boolean>>({ Local: true });
  const [variablesByScope, setVariablesByScope] = useState<Record<number, Variable[]>>({});
  const [breakpoints, setBreakpoints] = useState<
    Array<{ filePath: string; line: number; enabled: boolean }>
  >([]);
  const [newBpLine, setNewBpLine] = useState<string>("");

  const [watchExprs, setWatchExprs] = useState<Array<{ expr: string; val?: string }>>([
    { expr: "typeof process" },
  ]);
  const [newWatchInput, setNewWatchInput] = useState<string>("");

  const [consoleInput, setConsoleInput] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<
    Array<{ id: string; type: "input" | "output" | "error"; text: string }>
  >([]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(
        `${baseUrl}/api/v1/debug/sessions?workspaceId=${encodeURIComponent(workspaceId)}`
      );
      if (res.ok) {
        const json = await res.json();
        const list: DebugSession[] = json.data || [];
        if (list.length > 0) {
          const current = list.find((s) => s.id === activeSession?.id) || list[0]!;
          setActiveSession(current);
        } else {
          setActiveSession(null);
        }
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, baseUrl]);

  // When session state changes (e.g. paused), fetch callstack and scopes
  useEffect(() => {
    if (!activeSession || activeSession.status !== DebugSessionStatus.PAUSED) {
      setCallStack([]);
      setScopes([]);
      setVariablesByScope({});
      return;
    }

    const fetchStackAndScopes = async () => {
      try {
        const stackRes = await fetch(`${baseUrl}/api/v1/debug/${activeSession.id}/stack-trace`);
        if (stackRes.ok) {
          const json = await stackRes.json();
          const frames: StackFrame[] = json.data || [];
          setCallStack(frames);

          if (frames.length > 0 && frames[0]) {
            const topFrame = frames[0];
            if (topFrame.source?.path) {
              onNavigateToFile?.(topFrame.source.path, topFrame.line, topFrame.column);
            }
          }
        }

        const scopesRes = await fetch(
          `${baseUrl}/api/v1/debug/${activeSession.id}/scopes?frameId=0`
        );
        if (scopesRes.ok) {
          const json = await scopesRes.json();
          const sc: Scope[] = json.data || [];
          setScopes(sc);

          for (const s of sc) {
            if (s.variablesReference > 0) {
              fetchVariables(s.variablesReference);
            }
          }
        }

        evaluateAllWatch();
      } catch {
        // Ignore
      }
    };

    fetchStackAndScopes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, activeSession?.status]);

  const fetchVariables = async (refId: number) => {
    if (!activeSession) return;
    try {
      const res = await fetch(
        `${baseUrl}/api/v1/debug/${activeSession.id}/variables?variablesReference=${refId}`
      );
      if (res.ok) {
        const json = await res.json();
        setVariablesByScope((prev) => ({ ...prev, [refId]: json.data || [] }));
      }
    } catch {
      // Ignore
    }
  };

  const evaluateAllWatch = async () => {
    if (!activeSession) return;
    for (let i = 0; i < watchExprs.length; i++) {
      const w = watchExprs[i]!;
      try {
        const res = await fetch(`${baseUrl}/api/v1/debug/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            sessionId: activeSession.id,
            expression: w.expr,
            context: "watch",
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setWatchExprs((prev) => {
            const next = [...prev];
            if (next[i]) next[i] = { ...next[i]!, val: json.data?.result || "undefined" };
            return next;
          });
        }
      } catch {
        // Ignore
      }
    }
  };

  const handleLaunch = async () => {
    setIsLoading(true);
    try {
      const programTarget = debugTarget === "current" ? currentFilePath : customPath;

      if (!programTarget && debugTarget !== "attach") {
        alert("Please open or specify a file to debug.");
        setIsLoading(false);
        return;
      }

      if (debugTarget === "attach") {
        const res = await fetch(`${baseUrl}/api/v1/debug/attach`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: `Attach :${attachPort}`,
            type: "node",
            port: attachPort,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setActiveSession(json.data);
          await fetchSessions();
        }
      } else {
        const res = await fetch(`${baseUrl}/api/v1/debug/launch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: `Node: ${programTarget.split("/").pop()}`,
            type: "node",
            program: programTarget,
            stopOnEntry,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const sess: DebugSession = json.data;
          setActiveSession(sess);

          // Push existing breakpoints to the session
          if (breakpoints.length > 0) {
            const targetBps = breakpoints
              .filter((b) => b.enabled && b.filePath === programTarget)
              .map((b) => ({ line: b.line }));

            if (targetBps.length > 0) {
              await fetch(`${baseUrl}/api/v1/debug/breakpoints`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  workspaceId,
                  sessionId: sess.id,
                  path: programTarget,
                  breakpoints: targetBps,
                }),
              });
            }
          }

          await fetchSessions();
        }
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!activeSession) return;
    await fetch(`${baseUrl}/api/v1/debug/${activeSession.id}/continue`, { method: "POST" });
    await fetchSessions();
  };

  const handlePause = async () => {
    if (!activeSession) return;
    await fetch(`${baseUrl}/api/v1/debug/${activeSession.id}/pause`, { method: "POST" });
    await fetchSessions();
  };

  const handleStepOver = async () => {
    if (!activeSession) return;
    await fetch(`${baseUrl}/api/v1/debug/${activeSession.id}/step-over`, { method: "POST" });
    await fetchSessions();
  };

  const handleStepIn = async () => {
    if (!activeSession) return;
    await fetch(`${baseUrl}/api/v1/debug/${activeSession.id}/step-in`, { method: "POST" });
    await fetchSessions();
  };

  const handleStepOut = async () => {
    if (!activeSession) return;
    await fetch(`${baseUrl}/api/v1/debug/${activeSession.id}/step-out`, { method: "POST" });
    await fetchSessions();
  };

  const handleStop = async () => {
    if (!activeSession) return;
    await fetch(`${baseUrl}/api/v1/debug/${activeSession.id}/stop`, { method: "POST" });
    setActiveSession(null);
    await fetchSessions();
  };

  const handleAddBreakpoint = async () => {
    const lineNum = parseInt(newBpLine, 10);
    if (isNaN(lineNum) || lineNum <= 0 || !currentFilePath) return;

    const newBp = { filePath: currentFilePath, line: lineNum, enabled: true };
    const updated = [...breakpoints, newBp];
    setBreakpoints(updated);
    setNewBpLine("");

    if (activeSession) {
      await fetch(`${baseUrl}/api/v1/debug/breakpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          sessionId: activeSession.id,
          path: currentFilePath,
          breakpoints: updated
            .filter((b) => b.enabled && b.filePath === currentFilePath)
            .map((b) => ({ line: b.line })),
        }),
      });
    }
  };

  const handleConsoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim() || !activeSession) return;

    const expr = consoleInput.trim();
    setConsoleInput("");
    setConsoleLogs((prev) => [...prev, { id: String(Date.now()), type: "input", text: expr }]);

    try {
      const res = await fetch(`${baseUrl}/api/v1/debug/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          sessionId: activeSession.id,
          expression: expr,
          context: "repl",
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setConsoleLogs((prev) => [
          ...prev,
          { id: String(Date.now()), type: "output", text: json.data?.result || "undefined" },
        ]);
      } else {
        setConsoleLogs((prev) => [
          ...prev,
          { id: String(Date.now()), type: "error", text: "Evaluation failed" },
        ]);
      }
    } catch (err: any) {
      setConsoleLogs((prev) => [
        ...prev,
        { id: String(Date.now()), type: "error", text: err.message || "Error" },
      ]);
    }
  };

  const isPaused = activeSession?.status === DebugSessionStatus.PAUSED;
  const hasActive = Boolean(
    activeSession && activeSession.status !== DebugSessionStatus.TERMINATED
  );

  return (
    <div className="h-full flex flex-col bg-[#121214] text-zinc-200 text-xs font-sans select-none overflow-hidden">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-[#18181b]">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-rose-400" />
          <span className="font-semibold text-zinc-100 uppercase tracking-wider text-[11px]">
            Run & Debug (DAP)
          </span>
        </div>
        {hasActive && (
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
              isPaused
                ? "bg-amber-950/50 text-amber-300 border border-amber-800/50"
                : "bg-emerald-950/50 text-emerald-300 border border-emerald-800/50"
            )}
          >
            {activeSession?.status}
          </span>
        )}
      </div>

      <div className="p-2 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between shrink-0">
        {!hasActive ? (
          <div className="flex items-center gap-2 w-full">
            <select
              value={debugTarget}
              onChange={(e) => setDebugTarget(e.target.value as any)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-2 py-1 text-[11px] flex-1 outline-none font-sans"
            >
              <option value="current">Node.js (Current File)</option>
              <option value="custom">Node.js (Custom Path)</option>
              <option value="attach">Attach to Node Inspector</option>
            </select>

            <button
              onClick={handleLaunch}
              disabled={isLoading}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] flex items-center gap-1.5 transition-colors shadow"
              title="Start Debugging (F5)"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1">
              {isPaused ? (
                <button
                  onClick={handleContinue}
                  className="p-1.5 rounded hover:bg-zinc-800 text-emerald-400 transition-colors"
                  title="Continue (F5)"
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="p-1.5 rounded hover:bg-zinc-800 text-amber-400 transition-colors"
                  title="Pause (F6)"
                >
                  <Pause className="w-4 h-4 fill-current" />
                </button>
              )}

              <button
                onClick={handleStepOver}
                disabled={!isPaused}
                className="p-1.5 rounded hover:bg-zinc-800 text-sky-400 disabled:opacity-30 transition-colors"
                title="Step Over (F10)"
              >
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleStepIn}
                disabled={!isPaused}
                className="p-1.5 rounded hover:bg-zinc-800 text-indigo-400 disabled:opacity-30 transition-colors"
                title="Step Into (F11)"
              >
                <ArrowDown className="w-4 h-4" />
              </button>

              <button
                onClick={handleStepOut}
                disabled={!isPaused}
                className="p-1.5 rounded hover:bg-zinc-800 text-violet-400 disabled:opacity-30 transition-colors"
                title="Step Out (Shift+F11)"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleStop}
              className="p-1.5 rounded hover:bg-rose-950/60 text-rose-400 transition-colors"
              title="Stop Debugging (Shift+F5)"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          </div>
        )}
      </div>

      {!hasActive && debugTarget === "custom" && (
        <div className="p-2 border-b border-zinc-800 bg-zinc-900/30 flex items-center gap-2">
          <input
            type="text"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="e.g. src/index.ts or dist/server.js"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 text-[11px] font-mono outline-none"
          />
        </div>
      )}

      {!hasActive && debugTarget === "attach" && (
        <div className="p-2 border-b border-zinc-800 bg-zinc-900/30 flex items-center gap-2">
          <span className="text-zinc-500 font-mono text-[11px]">Port:</span>
          <input
            type="number"
            value={attachPort}
            onChange={(e) => setAttachPort(parseInt(e.target.value, 10))}
            className="w-24 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 text-[11px] font-mono outline-none"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
        <div className="p-2 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">
            <Layers className="w-3.5 h-3.5" />
            <span>Call Stack</span>
            {callStack.length > 0 && <span className="text-zinc-500">({callStack.length})</span>}
          </div>

          {callStack.length === 0 ? (
            <div className="text-zinc-600 text-[11px] italic py-1 px-1">
              {hasActive ? (isPaused ? "No call stack available" : "Running...") : "Not debugging"}
            </div>
          ) : (
            <div className="space-y-0.5">
              {callStack.map((frame, idx) => (
                <div
                  key={frame.id}
                  onClick={() => {
                    if (frame.source?.path) {
                      onNavigateToFile?.(frame.source.path, frame.line, frame.column);
                    }
                  }}
                  className={cn(
                    "px-2 py-1 rounded cursor-pointer transition-colors text-[11px] flex items-center justify-between",
                    idx === 0
                      ? "bg-indigo-950/40 text-indigo-200 font-medium"
                      : "hover:bg-zinc-800/60 text-zinc-300"
                  )}
                >
                  <span className="truncate flex-1 font-mono">{frame.name}</span>
                  <span className="text-[10px] text-zinc-500 font-mono shrink-0 ml-2">
                    {frame.source?.name || "file"}:{frame.line}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-2 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">
            <VariableIcon className="w-3.5 h-3.5" />
            <span>Variables</span>
          </div>

          {scopes.length === 0 ? (
            <div className="text-zinc-600 text-[11px] italic py-1 px-1">
              Variables available when paused.
            </div>
          ) : (
            <div className="space-y-1">
              {scopes.map((s) => {
                const isOpen = expandedScopes[s.name] ?? false;
                const vars = variablesByScope[s.variablesReference] || [];

                return (
                  <div key={s.name} className="space-y-0.5">
                    <button
                      onClick={() => setExpandedScopes((prev) => ({ ...prev, [s.name]: !isOpen }))}
                      className="w-full flex items-center gap-1 px-1 py-0.5 text-zinc-400 hover:text-zinc-200 text-[11px] font-semibold"
                    >
                      {isOpen ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      <span>{s.name}</span>
                    </button>

                    {isOpen && (
                      <div className="pl-4 space-y-0.5">
                        {vars.length === 0 ? (
                          <div className="text-zinc-600 text-[10px] italic">Empty scope</div>
                        ) : (
                          vars.map((v) => (
                            <div
                              key={v.name}
                              className="flex items-baseline gap-1.5 text-[11px] font-mono"
                            >
                              <span className="text-sky-300 shrink-0">{v.name}:</span>
                              <span className="text-emerald-300 truncate" title={v.value}>
                                {v.value}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-2 space-y-1.5">
          <div className="flex items-center justify-between font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">
            <div className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              <span>Watch</span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newWatchInput.trim()) return;
              setWatchExprs((prev) => [...prev, { expr: newWatchInput.trim() }]);
              setNewWatchInput("");
              evaluateAllWatch();
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              value={newWatchInput}
              onChange={(e) => setNewWatchInput(e.target.value)}
              placeholder="Add expression..."
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-[11px] text-zinc-300 font-mono outline-none"
            />
            <button
              type="submit"
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              title="Add expression"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="space-y-1">
            {watchExprs.map((w, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-1.5 py-1 rounded bg-zinc-900/50 hover:bg-zinc-900 text-[11px] font-mono group"
              >
                <div className="flex items-baseline gap-1.5 truncate">
                  <span className="text-indigo-300">{w.expr}:</span>
                  <span className="text-zinc-200 truncate">{w.val ?? "undefined"}</span>
                </div>
                <button
                  onClick={() => setWatchExprs((prev) => prev.filter((_, i) => i !== idx))}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-rose-400 transition-opacity"
                  title="Remove watch"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-2 space-y-1.5">
          <div className="flex items-center justify-between font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">
            <div className="flex items-center gap-1.5">
              <Circle className="w-3.5 h-3.5 text-rose-500 fill-current" />
              <span>Breakpoints</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <input
              type="number"
              placeholder="Line #"
              value={newBpLine}
              onChange={(e) => setNewBpLine(e.target.value)}
              className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-[11px] text-zinc-300 font-mono outline-none"
            />
            <button
              onClick={handleAddBreakpoint}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Add Line</span>
            </button>
          </div>

          <div className="space-y-1">
            {breakpoints.length === 0 ? (
              <div className="text-zinc-600 text-[11px] italic py-1 px-1">No breakpoints set.</div>
            ) : (
              breakpoints.map((bp, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-1.5 py-1 rounded bg-zinc-900/50 hover:bg-zinc-900 text-[11px] font-mono group"
                >
                  <div
                    onClick={() => onNavigateToFile?.(bp.filePath, bp.line)}
                    className="flex items-center gap-1.5 truncate cursor-pointer flex-1"
                  >
                    <Circle
                      className={cn(
                        "w-2.5 h-2.5 shrink-0",
                        bp.enabled ? "text-rose-500 fill-current" : "text-zinc-600"
                      )}
                    />
                    <span className="text-zinc-400 truncate">{bp.filePath.split("/").pop()}</span>
                    <span className="text-zinc-500">:{bp.line}</span>
                  </div>
                  <button
                    onClick={() => setBreakpoints((prev) => prev.filter((_, i) => i !== idx))}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-rose-400 transition-opacity"
                    title="Remove Breakpoint"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">
            <Terminal className="w-3.5 h-3.5" />
            <span>Debug Console</span>
          </div>

          <div className="h-32 bg-zinc-950 border border-zinc-800/80 rounded p-1.5 overflow-y-auto space-y-1 font-mono text-[10px]">
            {consoleLogs.length === 0 ? (
              <div className="text-zinc-600 italic">REPL output and console logs...</div>
            ) : (
              consoleLogs.map((log) => (
                <div
                  key={log.id}
                  className={cn(
                    "leading-relaxed whitespace-pre-wrap break-all",
                    log.type === "input"
                      ? "text-sky-400 font-semibold"
                      : log.type === "error"
                        ? "text-rose-400"
                        : "text-zinc-300"
                  )}
                >
                  {log.type === "input" ? `> ${log.text}` : log.text}
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleConsoleSubmit} className="flex items-center gap-1">
            <input
              type="text"
              value={consoleInput}
              onChange={(e) => setConsoleInput(e.target.value)}
              placeholder={hasActive ? "Evaluate in context..." : "Start debug session first"}
              disabled={!hasActive}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 font-mono outline-none disabled:opacity-50"
            />
          </form>
        </div>
      </div>
    </div>
  );
};
