"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Smartphone,
  Tablet,
  Laptop,
  Check,
  Copy,
  Share2,
  X,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { ActiveDevice, CreateHandoffDto } from "@remote-ide/shared";
import { gatewayFetch } from "../../lib/api/client";
import { cn } from "@remote-ide/ui";

export interface DeviceHandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  gatewayUrl?: string;
  currentWorkspaceId?: string;
  activeFilePath?: string | null;
  cursorPosition?: { line: number; col: number };
  openFiles?: string[];
  activeTerminalSessionId?: string | null;
}

export const DeviceHandoffModal: React.FC<DeviceHandoffModalProps> = ({
  isOpen,
  onClose,
  gatewayUrl = "",
  currentWorkspaceId,
  activeFilePath,
  cursorPosition = { line: 1, col: 1 },
  openFiles = [],
  activeTerminalSessionId,
}) => {
  const [activeTab, setActiveTab] = useState<"devices" | "qrcode">("devices");
  const [devices, setDevices] = useState<ActiveDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedHandoff, setStagedHandoff] = useState<{ id: string; url: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const fetchActiveDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await gatewayFetch(`${gatewayUrl}/api/v1/devices/active`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to query active personal devices");
      const data = await res.json();
      if (data.success && data.data) {
        setDevices(data.data);
      }
    } catch {
      setError("Unable to retrieve active devices list.");
    } finally {
      setIsLoading(false);
    }
  }, [gatewayUrl]);

  useEffect(() => {
    if (isOpen) {
      void fetchActiveDevices();
    }
  }, [isOpen, fetchActiveDevices]);

  const handleStageHandoff = async (targetDeviceId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const payload: CreateHandoffDto = {
        targetDeviceId,
        expiresInSeconds: 600,
        layout: {
          activeWorkspaceId: currentWorkspaceId || "default",
          workspaceName: "RemoteIDE Workspace",
          openFilePaths: openFiles,
          activeFilePath: activeFilePath || null,
          cursorPosition,
          activeTab: "editor",
          isSplit: false,
          terminalSessionIds: activeTerminalSessionId ? [activeTerminalSessionId] : [],
        },
      };

      const res = await gatewayFetch(`${gatewayUrl}/api/v1/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to stage workspace handoff");
      }

      const handoffId = data.data.id;
      const url = `${window.location.origin}/?handoff=${encodeURIComponent(handoffId)}`;
      setStagedHandoff({ id: handoffId, url });
    } catch (err: any) {
      setError(err.message || "Failed to create handoff snapshot");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!stagedHandoff) return;
    navigator.clipboard.writeText(stagedHandoff.url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full shadow-2xl flex flex-col overflow-hidden text-zinc-100 select-none">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Continue on Another Device</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-zinc-800 bg-zinc-900/40 text-xs font-mono">
          <button
            onClick={() => setActiveTab("devices")}
            className={cn(
              "flex-1 py-2.5 text-center border-b-2 transition-colors",
              activeTab === "devices"
                ? "border-zinc-200 text-zinc-100 font-semibold bg-zinc-800/40"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            Active Devices
          </button>
          <button
            onClick={() => {
              setActiveTab("qrcode");
              if (!stagedHandoff) {
                void handleStageHandoff();
              }
            }}
            className={cn(
              "flex-1 py-2.5 text-center border-b-2 transition-colors",
              activeTab === "qrcode"
                ? "border-zinc-200 text-zinc-100 font-semibold bg-zinc-800/40"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            QR Code / Link
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/60 border-b border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}

        <div className="p-4 flex-1 overflow-y-auto">
          {activeTab === "devices" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>DETECTED PERSONAL DEVICES</span>
                <button
                  onClick={() => void fetchActiveDevices()}
                  className="hover:text-zinc-200 p-1"
                  title="Refresh Devices"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                </button>
              </div>

              {devices.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 text-xs font-mono border border-zinc-800/80 rounded-md">
                  No other active devices detected. Use the QR Code tab to transfer to your smartphone or tablet.
                </div>
              ) : (
                <div className="space-y-2">
                  {devices.map((device) => {
                    const FormFactorIcon =
                      device.type === "phone"
                        ? Smartphone
                        : device.type === "tablet"
                        ? Tablet
                        : Laptop;

                    return (
                      <div
                        key={device.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
                            <FormFactorIcon className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-mono font-medium text-zinc-200 truncate">
                              {device.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Last active: {new Date(device.lastActiveAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => void handleStageHandoff(device.id)}
                          disabled={isLoading}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-200 rounded text-xs font-mono transition-colors"
                        >
                          Send Handoff
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {stagedHandoff && (
                <div className="mt-4 p-3 bg-zinc-950 border border-zinc-800 rounded-md">
                  <div className="flex items-center justify-between text-xs text-emerald-400 font-mono mb-2">
                    <span>Handoff staged successfully!</span>
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-1 text-zinc-300 hover:text-white"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? "Copied" : "Copy Link"}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={stagedHandoff.url}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[11px] font-mono text-zinc-400"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === "qrcode" && (
            <div className="flex flex-col items-center justify-center p-2 text-center">
              <p className="text-xs text-zinc-400 mb-4 font-mono max-w-xs">
                Scan with your phone or tablet camera to seamlessly resume this workspace session.
              </p>

              <div className="p-4 bg-white rounded-xl shadow-lg border border-zinc-700 flex items-center justify-center mb-4">
                <svg
                  viewBox="0 0 120 120"
                  className="w-48 h-48"
                  shapeRendering="crispEdges"
                >
                  <rect width="120" height="120" fill="white" />
                  <rect x="10" y="10" width="30" height="30" fill="black" />
                  <rect x="15" y="15" width="20" height="20" fill="white" />
                  <rect x="20" y="20" width="10" height="10" fill="black" />

                  <rect x="80" y="10" width="30" height="30" fill="black" />
                  <rect x="85" y="15" width="20" height="20" fill="white" />
                  <rect x="90" y="20" width="10" height="10" fill="black" />

                  <rect x="10" y="80" width="30" height="30" fill="black" />
                  <rect x="15" y="85" width="20" height="20" fill="white" />
                  <rect x="20" y="90" width="10" height="10" fill="black" />

                  <rect x="45" y="15" width="5" height="15" fill="black" />
                  <rect x="55" y="10" width="10" height="5" fill="black" />
                  <rect x="50" y="25" width="15" height="5" fill="black" />
                  <rect x="70" y="20" width="5" height="15" fill="black" />
                  <rect x="45" y="45" width="30" height="30" fill="black" />
                  <rect x="50" y="50" width="20" height="20" fill="white" />
                  <rect x="55" y="55" width="10" height="10" fill="black" />
                  <rect x="15" y="45" width="10" height="5" fill="black" />
                  <rect x="30" y="55" width="5" height="15" fill="black" />
                  <rect x="85" y="50" width="10" height="10" fill="black" />
                  <rect x="100" y="65" width="5" height="15" fill="black" />
                  <rect x="45" y="85" width="15" height="5" fill="black" />
                  <rect x="65" y="95" width="15" height="5" fill="black" />
                  <rect x="50" y="105" width="10" height="5" fill="black" />
                  <rect x="85" y="85" width="20" height="10" fill="black" />
                  <rect x="90" y="100" width="15" height="10" fill="black" />
                </svg>
              </div>

              {stagedHandoff ? (
                <div className="w-full space-y-2">
                  <button
                    onClick={handleCopyLink}
                    className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-100 rounded-md text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{isCopied ? "Link Copied to Clipboard" : "Copy Direct Handoff Link"}</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => void handleStageHandoff()}
                  disabled={isLoading}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-md text-xs font-mono transition-colors"
                >
                  Generate Handoff Link
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>Snapshot excludes authentication secrets.</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
