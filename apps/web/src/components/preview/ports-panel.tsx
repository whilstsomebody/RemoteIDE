"use client";

import { gatewayFetch } from "../../lib/api/client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Globe,
  Plus,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Power,
  Trash2,
  Radio,
  X,
} from "lucide-react";
import { ForwardedPort, DetectedPort } from "@remote-ide/shared";

export interface PortsPanelProps {
  gatewayUrl?: string;
  onOpenPreview?: (port: number) => void;
}

export const PortsPanel: React.FC<PortsPanelProps> = ({ gatewayUrl = "", onOpenPreview }) => {
  const [forwardedPorts, setForwardedPorts] = useState<ForwardedPort[]>([]);
  const [detectedPorts, setDetectedPorts] = useState<DetectedPort[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedPort, setCopiedPort] = useState<number | null>(null);

  // Form
  const [newPort, setNewPort] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [expiresHours, setExpiresHours] = useState("24");

  const fetchPorts = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fRes, dRes] = await Promise.all([
        gatewayFetch(`${gatewayUrl}/api/v1/ports`, { credentials: "include" }),
        gatewayFetch(`${gatewayUrl}/api/v1/ports/detected`, { credentials: "include" }),
      ]);

      if (fRes.ok) {
        const data = await fRes.json();
        if (data.success) setForwardedPorts(data.data);
      }
      if (dRes.ok) {
        const data = await dRes.json();
        if (data.success) setDetectedPorts(data.data);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  }, [gatewayUrl]);

  useEffect(() => {
    fetchPorts();
    const interval = setInterval(fetchPorts, 5000);
    return () => clearInterval(interval);
  }, [fetchPorts]);

  const handleForward = async (port: number, label?: string) => {
    try {
      const res = await gatewayFetch(`${gatewayUrl}/api/v1/ports/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          port,
          label: label || `Port ${port}`,
          expiresInSeconds: 86400, // 24 hours
        }),
      });
      if (res.ok) {
        await fetchPorts();
      }
    } catch {
      // Ignored
    }
  };

  const handleToggle = async (port: number, enabled: boolean) => {
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/ports/${port}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      await fetchPorts();
    } catch {
      // Ignored
    }
  };

  const handleUnforward = async (port: number) => {
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/ports/${port}`, {
        method: "DELETE",
        credentials: "include",
      });
      await fetchPorts();
    } catch {
      // Ignored
    }
  };

  const handleCopyUrl = (port: number) => {
    const url = `${window.location.origin}/api/v1/preview/${port}/`;
    navigator.clipboard.writeText(url);
    setCopiedPort(port);
    setTimeout(() => setCopiedPort(null), 2000);
  };

  const handleManualForwardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(newPort, 10);
    if (isNaN(p) || p < 1024 || p > 65535) return;

    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/ports/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          port: p,
          label: newLabel.trim() || `Port ${p}`,
          expiresInSeconds: parseInt(expiresHours, 10) * 3600,
        }),
      });
      setIsModalOpen(false);
      setNewPort("");
      setNewLabel("");
      await fetchPorts();
    } catch {
      // Ignored
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#141417] text-zinc-300 text-xs select-none p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-ide-border mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-sm text-zinc-200">Forwarded Application Ports</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-2.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Forward a Port
          </button>
          <button
            onClick={fetchPorts}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Detected Local Ports on Host */}
      {detectedPorts.length > 0 && (
        <div className="mb-6 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-2 font-medium text-zinc-300 mb-2">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>Detected Local Dev Servers on Host</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {detectedPorts.map((dp) => {
              const isAlreadyForwarded = forwardedPorts.some((fp) => fp.port === dp.port);
              return (
                <div
                  key={dp.port}
                  className="flex items-center justify-between p-2 rounded bg-zinc-800/60 border border-zinc-700/60 text-xs"
                >
                  <div className="flex flex-col">
                    <span className="font-mono font-bold text-zinc-200">Port {dp.port}</span>
                    <span className="text-[11px] text-zinc-400">{dp.processName}</span>
                  </div>
                  {isAlreadyForwarded ? (
                    <span className="text-[11px] text-emerald-400 font-medium">Forwarded</span>
                  ) : (
                    <button
                      onClick={() => handleForward(dp.port, dp.processName)}
                      className="px-2 py-1 rounded bg-zinc-700 hover:bg-indigo-600 text-white text-[11px] font-medium transition-colors"
                    >
                      Forward
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Forwarded Ports Table */}
      <div className="rounded-lg border border-ide-border overflow-hidden bg-zinc-900/30">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-ide-border bg-zinc-900/70 text-[11px] uppercase tracking-wider text-zinc-400">
              <th className="py-2.5 px-4 font-semibold">Port</th>
              <th className="py-2.5 px-4 font-semibold">Label</th>
              <th className="py-2.5 px-4 font-semibold">Protocol</th>
              <th className="py-2.5 px-4 font-semibold">Status</th>
              <th className="py-2.5 px-4 font-semibold">Expiration</th>
              <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/40 text-xs">
            {forwardedPorts.map((fp) => (
              <tr key={fp.port} className="hover:bg-zinc-800/30 transition-colors">
                <td className="py-2.5 px-4 font-mono font-bold text-zinc-200">{fp.port}</td>
                <td className="py-2.5 px-4 text-zinc-300">{fp.label}</td>
                <td className="py-2.5 px-4 font-mono text-zinc-400 uppercase">{fp.protocol}</td>
                <td className="py-2.5 px-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ${
                      fp.enabled
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                        : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        fp.enabled ? "bg-emerald-400" : "bg-zinc-500"
                      }`}
                    />
                    {fp.enabled ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-zinc-400 text-[11px]">
                  {fp.expiresAt ? new Date(fp.expiresAt).toLocaleTimeString() : "No Expiry"}
                </td>
                <td className="py-2.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => onOpenPreview?.(fp.port)}
                      title="Open in IDE Preview"
                      className="px-2 py-1 rounded bg-indigo-600/80 hover:bg-indigo-600 text-white font-medium text-[11px] flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Preview
                    </button>
                    <button
                      onClick={() => handleCopyUrl(fp.port)}
                      title="Copy Public Preview URL"
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    >
                      {copiedPort === fp.port ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleToggle(fp.port, !fp.enabled)}
                      title={fp.enabled ? "Disable Forwarding" : "Enable Forwarding"}
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    >
                      <Power className={`w-3.5 h-3.5 ${fp.enabled ? "text-emerald-400" : ""}`} />
                    </button>
                    <button
                      onClick={() => handleUnforward(fp.port)}
                      title="Remove Port"
                      className="p-1.5 rounded hover:bg-rose-950 text-zinc-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {forwardedPorts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-600 italic">
                  No forwarded ports configured yet. Click "Forward a Port" or select a detected
                  port above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Forward Port Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleManualForwardSubmit}
            className="bg-ide-sidebar border border-ide-border rounded-lg shadow-xl max-w-sm w-full p-4 flex flex-col gap-3 text-zinc-200"
          >
            <div className="flex items-center justify-between pb-2 border-b border-ide-border">
              <span className="font-semibold text-sm">Forward Application Port</span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">
                Port Number (1024 - 65535)
              </label>
              <input
                type="number"
                min={1024}
                max={65535}
                required
                value={newPort}
                onChange={(e) => setNewPort(e.target.value)}
                placeholder="e.g. 3000"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Label / Service Name</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Frontend Web App"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Expiration</label>
              <select
                value={expiresHours}
                onChange={(e) => setExpiresHours(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="1">1 hour</option>
                <option value="8">8 hours</option>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-ide-border">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-medium"
              >
                Forward Port
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
