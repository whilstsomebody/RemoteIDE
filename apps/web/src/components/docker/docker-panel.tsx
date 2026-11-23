"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Boxes, Play, Square, RotateCw, FileText, AlertCircle, RefreshCw, X } from "lucide-react";
import { cn } from "@remote-ide/ui";
import {
  DockerOverview,
  DockerContainer,
  DockerImage,
  DockerVolume,
  DockerComposeProject,
} from "@remote-ide/shared";

export interface DockerPanelProps {
  agentUrl: string;
}

export const DockerPanel: React.FC<DockerPanelProps> = ({ agentUrl }) => {
  const [overview, setOverview] = useState<DockerOverview | null>(null);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [composeProjects, setComposeProjects] = useState<DockerComposeProject[]>([]);
  const [activeTab, setActiveTab] = useState<"containers" | "images" | "volumes" | "compose">(
    "containers"
  );
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [logsModal, setLogsModal] = useState<{
    containerId: string;
    containerName: string;
    logs: string;
  } | null>(null);

  const fetchDockerData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${agentUrl}/api/v1/docker/overview`);
      if (res.ok) {
        const body = await res.json();
        setOverview(body.data);
      }

      if (activeTab === "containers") {
        const resC = await fetch(`${agentUrl}/api/v1/docker/containers?all=true`);
        if (resC.ok) {
          const bodyC = await resC.json();
          setContainers(bodyC.data || []);
        }
      } else if (activeTab === "images") {
        const resI = await fetch(`${agentUrl}/api/v1/docker/images`);
        if (resI.ok) {
          const bodyI = await resI.json();
          setImages(bodyI.data || []);
        }
      } else if (activeTab === "volumes") {
        const resV = await fetch(`${agentUrl}/api/v1/docker/volumes`);
        if (resV.ok) {
          const bodyV = await resV.json();
          setVolumes(bodyV.data || []);
        }
      } else if (activeTab === "compose") {
        const resP = await fetch(`${agentUrl}/api/v1/docker/compose`);
        if (resP.ok) {
          const bodyP = await resP.json();
          setComposeProjects(bodyP.data || []);
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [agentUrl, activeTab]);

  useEffect(() => {
    void fetchDockerData();
  }, [fetchDockerData]);

  const handleContainerAction = async (
    containerId: string,
    action: "start" | "stop" | "restart"
  ) => {
    setActionInProgress(`${containerId}:${action}`);
    try {
      await fetch(`${agentUrl}/api/v1/docker/containers/${containerId}/${action}`, {
        method: "POST",
      });
      await fetchDockerData();
    } catch {
      // Error
    } finally {
      setActionInProgress(null);
    }
  };

  const handleViewLogs = async (container: DockerContainer) => {
    try {
      const res = await fetch(
        `${agentUrl}/api/v1/docker/containers/${container.id}/logs?tail=300&timestamps=true`
      );
      if (res.ok) {
        const body = await res.json();
        setLogsModal({
          containerId: container.id,
          containerName: container.name,
          logs: body.data?.logs || "No logs available.",
        });
      }
    } catch (err) {
      setLogsModal({
        containerId: container.id,
        containerName: container.name,
        logs: `Failed to load logs: ${(err as Error).message}`,
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b] text-zinc-300 font-sans text-xs select-none">
      <div className="p-3 border-b border-zinc-800 bg-[#121214] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-white">Docker Management</span>
          {overview && (
            <span
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium border",
                overview.isAvailable
                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-800"
                  : "bg-rose-950/40 text-rose-300 border-rose-800"
              )}
            >
              {overview.isAvailable ? overview.dockerVersion || "Online" : "Daemon Offline"}
            </span>
          )}
        </div>
        <button
          onClick={() => void fetchDockerData()}
          disabled={loading}
          className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          title="Refresh"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {overview && !overview.isAvailable && (
        <div className="m-3 p-3 bg-amber-950/30 border border-amber-800/60 rounded text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{overview.error || "Docker is not running on this host."}</span>
        </div>
      )}

      <div className="flex items-center border-b border-zinc-800 bg-zinc-950 px-2 gap-1">
        <button
          onClick={() => setActiveTab("containers")}
          className={cn(
            "px-2.5 py-1.5 border-b-2 text-[11px] font-medium transition-colors",
            activeTab === "containers"
              ? "border-sky-500 text-sky-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          )}
        >
          Containers ({containers.length})
        </button>
        <button
          onClick={() => setActiveTab("images")}
          className={cn(
            "px-2.5 py-1.5 border-b-2 text-[11px] font-medium transition-colors",
            activeTab === "images"
              ? "border-sky-500 text-sky-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          )}
        >
          Images
        </button>
        <button
          onClick={() => setActiveTab("volumes")}
          className={cn(
            "px-2.5 py-1.5 border-b-2 text-[11px] font-medium transition-colors",
            activeTab === "volumes"
              ? "border-sky-500 text-sky-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          )}
        >
          Volumes
        </button>
        <button
          onClick={() => setActiveTab("compose")}
          className={cn(
            "px-2.5 py-1.5 border-b-2 text-[11px] font-medium transition-colors",
            activeTab === "compose"
              ? "border-sky-500 text-sky-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          )}
        >
          Compose Projects
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === "containers" && (
          <div className="space-y-1.5">
            {containers.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 italic">
                No Docker containers found.
              </div>
            ) : (
              containers.map((c) => (
                <div
                  key={c.id}
                  className="p-2.5 rounded bg-[#121214] border border-zinc-800/80 hover:border-zinc-700 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          c.state === "running" ? "bg-emerald-400" : "bg-zinc-600"
                        )}
                      />
                      <span className="font-semibold text-white truncate">{c.name}</span>
                      <span className="text-[10px] text-zinc-500 truncate">({c.image})</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {c.state === "running" ? (
                        <>
                          <button
                            onClick={() => void handleContainerAction(c.id, "restart")}
                            disabled={Boolean(actionInProgress)}
                            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 transition-colors"
                            title="Restart Container"
                          >
                            <RotateCw className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => void handleContainerAction(c.id, "stop")}
                            disabled={Boolean(actionInProgress)}
                            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-rose-300 transition-colors"
                            title="Stop Container"
                          >
                            <Square className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => void handleContainerAction(c.id, "start")}
                          disabled={Boolean(actionInProgress)}
                          className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-300 transition-colors"
                          title="Start Container"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => void handleViewLogs(c)}
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                        title="View Logs"
                      >
                        <FileText className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
                    <span>Status: {c.status}</span>
                    {c.ports.length > 0 && (
                      <span>
                        Ports:{" "}
                        {c.ports
                          .map((p) =>
                            p.hostPort ? `${p.hostPort}:${p.containerPort}` : p.containerPort
                          )
                          .join(", ")}
                      </span>
                    )}
                    {c.composeProject && <span>Compose: {c.composeProject}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "images" && (
          <div className="space-y-1">
            {images.map((img) => (
              <div
                key={img.id}
                className="p-2 rounded bg-[#121214] border border-zinc-800/80 flex items-center justify-between text-xs"
              >
                <div className="truncate">
                  <span className="font-semibold text-zinc-200">{img.repository}</span>
                  <span className="text-zinc-500 ml-1">:{img.tag}</span>
                </div>
                <span className="text-zinc-500 text-[10px] shrink-0">{img.created}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "volumes" && (
          <div className="space-y-1">
            {volumes.map((vol) => (
              <div
                key={vol.name}
                className="p-2 rounded bg-[#121214] border border-zinc-800/80 flex items-center justify-between text-xs"
              >
                <span className="font-mono text-zinc-300">{vol.name}</span>
                <span className="text-zinc-500 text-[10px]">{vol.driver}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "compose" && (
          <div className="space-y-2">
            {composeProjects.map((proj) => (
              <div
                key={proj.name}
                className="p-2.5 rounded bg-[#121214] border border-zinc-800/80 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">{proj.name}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300">
                    {proj.status}
                  </span>
                </div>
                <div className="space-y-1 pl-2 border-l border-zinc-800">
                  {proj.services.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300">{s.name}</span>
                      <span className="text-zinc-500">{s.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {logsModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#121214] border border-zinc-700 rounded-lg w-full max-w-2xl h-[70vh] flex flex-col shadow-2xl">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <span className="font-semibold text-white">Logs: {logsModal.containerName}</span>
              </div>
              <button
                onClick={() => setLogsModal(null)}
                className="p-1 rounded text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-3 bg-black font-mono text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {logsModal.logs}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
