"use client";

import React, { useState, useEffect } from "react";
import { Code2, RefreshCw, Server, Cpu, Info } from "lucide-react";
import { cn, Badge } from "@remote-ide/ui";
import { LanguageServerMetadata, LanguageServerStatus } from "@remote-ide/shared";

export interface LanguageSupportPanelProps {
  gatewayUrl?: string;
  workspacePath?: string;
  workspaceId?: string;
}

export const LanguageSupportPanel: React.FC<LanguageSupportPanelProps> = ({
  gatewayUrl = "",
  workspacePath = "",
  workspaceId = "default",
}) => {
  const baseUrl = gatewayUrl.replace(/\/+$/, "");
  const [servers, setServers] = useState<LanguageServerMetadata[]>([]);
  const [primaryLang, setPrimaryLang] = useState<string>("typescript");
  const [detectedLangs, setDetectedLangs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchServers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `${baseUrl}/api/v1/lsp/servers?workspacePath=${encodeURIComponent(workspacePath)}`
      );
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setServers(json.data.servers || []);
          setPrimaryLang(json.data.projectLanguage || "typescript");
          setDetectedLangs(json.data.detectedLanguages || []);
        }
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath, baseUrl]);

  const handleRestart = async (serverId: string) => {
    setRestartingId(serverId);
    setMessage(null);
    try {
      const res = await fetch(`${baseUrl}/api/v1/lsp/servers/${serverId}/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        setMessage(`Restarted ${serverId} language server.`);
        await fetchServers();
      } else {
        setMessage(`Failed to restart ${serverId}.`);
      }
    } catch {
      setMessage(`Network error restarting ${serverId}.`);
    } finally {
      setRestartingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#121214] text-zinc-200 text-xs font-sans select-none overflow-hidden">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-[#18181b]">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-zinc-100 uppercase tracking-wider text-[11px]">
            Language Support
          </span>
        </div>
        <button
          onClick={fetchServers}
          disabled={isLoading}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Refresh Toolchains"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin text-indigo-400")} />
        </button>
      </div>

      <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/40 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Primary Project Language:</span>
          <Badge
            variant="outline"
            className="text-indigo-300 bg-indigo-950/40 border-indigo-700/50 uppercase font-mono font-bold"
          >
            {primaryLang}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">Detected In Workspace:</span>
          <span className="text-zinc-300 font-mono">
            {detectedLangs.length > 0 ? detectedLangs.join(", ") : "None"}
          </span>
        </div>
        {message && (
          <div className="p-1.5 rounded bg-indigo-950/40 border border-indigo-800/50 text-indigo-300 text-[11px] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
          <Server className="w-3.5 h-3.5" />
          <span>Configured Language Servers</span>
        </div>

        {servers.map((server) => {
          const isRestarting = restartingId === server.id;
          const isRunning = server.status === LanguageServerStatus.RUNNING;
          const isFailed = server.status === LanguageServerStatus.FAILED;

          return (
            <div
              key={server.id}
              className={cn(
                "p-3 rounded-lg border transition-colors space-y-2 bg-[#18181b]/70",
                isRunning
                  ? "border-zinc-800 hover:border-zinc-700"
                  : isFailed
                    ? "border-rose-900/60 bg-rose-950/10"
                    : "border-zinc-800/60 opacity-80"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                    <span>{server.name}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    {server.command} {server.args.join(" ")}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {server.isInstalled ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-950/50 text-emerald-400 border border-emerald-800/50">
                      Installed
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Missing Toolchain
                    </span>
                  )}

                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                      isRunning
                        ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/40"
                        : isFailed
                          ? "bg-rose-950/40 text-rose-400 border-rose-800/40"
                          : "bg-zinc-800/40 text-zinc-400 border-zinc-700/40"
                    )}
                  >
                    {server.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <Cpu className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-zinc-500">Host Runtime:</span>
                <span
                  className={server.runtimeAvailable ? "text-zinc-300 font-mono" : "text-amber-400"}
                >
                  {server.runtimeName}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                  Supported Features
                </span>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(server.supportedFeatures)
                    .filter(([, enabled]) => enabled)
                    .map(([feat]) => (
                      <span
                        key={feat}
                        className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-800/80 text-zinc-300 font-mono"
                      >
                        {feat}
                      </span>
                    ))}
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">
                  {server.crashCount > 0 ? `Restarts: ${server.crashCount}` : "Stable"}
                </span>

                <button
                  onClick={() => handleRestart(server.id)}
                  disabled={isRestarting}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3 h-3", isRestarting && "animate-spin")} />
                  <span>{isRestarting ? "Restarting..." : "Restart Server"}</span>
                </button>
              </div>
            </div>
          );
        })}

        <div className="p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/30 text-[11px] text-zinc-500 leading-relaxed">
          <p className="font-medium text-zinc-400 mb-1">Toolchain Safety Policy</p>
          RemoteIDE detects existing language compilers and language servers on the host machine. It
          never automatically downloads or installs toolchains without explicit owner approval.
        </div>
      </div>
    </div>
  );
};
