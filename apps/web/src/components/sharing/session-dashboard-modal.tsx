"use client";

import { gatewayFetch, GATEWAY_URL } from "../../lib/api/client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  X,
  Laptop,
  Radio,
  Trash2,
  Clock,
  Activity,
  AlertCircle,
  FileText,
  RefreshCw,
} from "lucide-react";
import { RemoteSession, ShareLink, AuditRecord } from "@remote-ide/shared";

export interface SessionDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  gatewayUrl?: string;
}

export const SessionDashboardModal: React.FC<SessionDashboardModalProps> = ({
  isOpen,
  onClose,
  gatewayUrl = GATEWAY_URL,
}) => {
  const [activeTab, setActiveTab] = useState<"sessions" | "links" | "audit">("sessions");
  const [sessions, setSessions] = useState<RemoteSession[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [hostStatus, setHostStatus] = useState<{
    online: boolean;
    connectedAt?: string;
    lastHeartbeatAt?: string;
  }>({ online: false });
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const [sessRes, linksRes, auditRes, tunnelRes] = await Promise.all([
        gatewayFetch(`${gatewayUrl}/api/v1/auth/sessions`, { headers, credentials: "include" }).catch(
          () => null
        ),
        gatewayFetch(`${gatewayUrl}/api/v1/share-links`, { headers, credentials: "include" }).catch(
          () => null
        ),
        gatewayFetch(`${gatewayUrl}/api/v1/auth/audit`, { headers, credentials: "include" }).catch(
          () => null
        ),
        gatewayFetch(`${gatewayUrl}/api/v1/tunnel/status`, { headers, credentials: "include" }).catch(
          () => null
        ),
      ]);

      if (sessRes?.ok) {
        const body = await sessRes.json();
        setSessions(body.data?.sessions || []);
      }
      if (linksRes?.ok) {
        const body = await linksRes.json();
        setLinks(body.data || []);
      }
      if (auditRes?.ok) {
        const body = await auditRes.json();
        setAuditLogs(body.data || []);
      }
      if (tunnelRes?.ok) {
        const body = await tunnelRes.json();
        setHostStatus(body.data || { online: false });
      }
    } catch {
      // Offline / Gateway unreachable
    } finally {
      setIsLoading(false);
    }
  }, [gatewayUrl]);

  useEffect(() => {
    if (!isOpen) return;

    void fetchData();
    const interval = setInterval(() => void fetchData(), 5000);
    return () => clearInterval(interval);
  }, [isOpen, fetchData]);

  if (!isOpen) return null;

  const handleTerminateSession = async (sessionId: string) => {
    if (
      !confirm("Terminate this session immediately? Active WebSocket connections will be dropped.")
    ) {
      return;
    }
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      await gatewayFetch(`${gatewayUrl}/api/v1/auth/sessions/${sessionId}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      void fetchData();
    } catch {
      //
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    if (
      !confirm("Revoke this share link? Any active sessions spawned from it will be disconnected.")
    ) {
      return;
    }
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      await gatewayFetch(`${gatewayUrl}/api/v1/share-links/${linkId}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      void fetchData();
    } catch {
      //
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-14 bg-black/75 backdrop-blur-sm p-4 animate-in fade-in-0 font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1e1e1e] border-b border-[#3c3c3c]">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-sm text-zinc-100">
              Session Control & Security Dashboard
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchData()}
              className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800"
              title="Refresh status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Host Tunnel Presence Indicator */}
        <div className="px-5 py-2.5 bg-zinc-950/60 border-b border-[#3c3c3c] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-3.5 h-3.5 ${
                hostStatus.online ? "text-emerald-400 animate-pulse" : "text-rose-400"
              }`}
            />
            <span className="font-medium text-zinc-300">Host Agent Reverse Tunnel:</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                hostStatus.online
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/40"
                  : "bg-rose-950/80 text-rose-300 border border-rose-800/40"
              }`}
            >
              {hostStatus.online ? "Online & Connected" : "Offline / Unreachable"}
            </span>
          </div>
          {hostStatus.lastHeartbeatAt && (
            <div className="text-[10px] text-zinc-500 font-mono">
              Heartbeat: {new Date(hostStatus.lastHeartbeatAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-4 bg-[#1e1e1e] border-b border-[#3c3c3c]">
          {[
            { id: "sessions", label: `Active Sessions (${sessions.length})`, icon: Laptop },
            { id: "links", label: `Share Links (${links.length})`, icon: Clock },
            { id: "audit", label: `Audit Log (${auditLogs.length})`, icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-indigo-500 text-white font-semibold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body Content */}
        <div className="p-4 max-h-[380px] overflow-y-auto min-h-[200px]">
          {/* Tab 1: Active Sessions */}
          {activeTab === "sessions" && (
            <div className="space-y-3">
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs">
                  No active remote sessions connected.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#3c3c3c] text-zinc-400 font-semibold text-[11px]">
                        <th className="pb-2">Device / Client</th>
                        <th className="pb-2">Role</th>
                        <th className="pb-2">IP Address</th>
                        <th className="pb-2">Expires At</th>
                        <th className="pb-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {sessions.map((sess) => (
                        <tr key={sess.id} className="hover:bg-zinc-800/40">
                          <td className="py-2.5 font-medium text-zinc-200 flex items-center gap-2">
                            <Laptop className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="truncate max-w-[150px]">{sess.deviceName}</span>
                            {sess.isOwner && (
                              <span className="px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 text-[10px]">
                                Owner
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 uppercase text-[10px] text-zinc-400 font-mono">
                            {sess.role}
                          </td>
                          <td className="py-2.5 font-mono text-zinc-400 text-[11px]">
                            {sess.ipAddress}
                          </td>
                          <td className="py-2.5 text-zinc-400 text-[11px]">
                            {new Date(sess.expiresAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-2.5 text-right">
                            {!sess.isOwner && (
                              <button
                                onClick={() => handleTerminateSession(sess.id)}
                                className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 rounded text-[10px] transition-colors"
                              >
                                Terminate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Temporary Share Links */}
          {activeTab === "links" && (
            <div className="space-y-3">
              {links.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs">
                  No share links generated yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#3c3c3c] text-zinc-400 font-semibold text-[11px]">
                        <th className="pb-2">Label</th>
                        <th className="pb-2">Role</th>
                        <th className="pb-2">Single Use</th>
                        <th className="pb-2">PIN</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {links.map((link) => (
                        <tr key={link.id} className="hover:bg-zinc-800/40">
                          <td className="py-2.5 font-medium text-zinc-200">{link.name}</td>
                          <td className="py-2.5 uppercase text-[10px] text-zinc-400 font-mono">
                            {link.role}
                          </td>
                          <td className="py-2.5 text-zinc-400 text-[11px]">
                            {link.oneTimeRedemption ? "Yes" : "No"}
                          </td>
                          <td className="py-2.5 text-zinc-400 text-[11px]">
                            {link.hasPin ? "Protected" : "None"}
                          </td>
                          <td className="py-2.5 text-[11px]">
                            {link.isRevoked ? (
                              <span className="text-rose-400">Revoked</span>
                            ) : new Date(link.expiresAt).getTime() < Date.now() ? (
                              <span className="text-amber-400">Expired</span>
                            ) : (
                              <span className="text-emerald-400">Active</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            {!link.isRevoked && (
                              <button
                                onClick={() => handleRevokeLink(link.id)}
                                className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 rounded transition-colors"
                                title="Revoke Link"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Audit Log */}
          {activeTab === "audit" && (
            <div className="space-y-2 font-mono text-[11px]">
              {auditLogs.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-sans">
                  No security audit records logged.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded bg-zinc-900 border border-zinc-800/80 flex items-start justify-between gap-2"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-zinc-200">{log.eventType}</div>
                        <div className="text-zinc-500 text-[10px]">
                          Actor: {log.actorId} {log.ipAddress ? `• IP: ${log.ipAddress}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#1e1e1e] border-t border-[#3c3c3c] flex justify-between items-center text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-indigo-400" />
            Session revocation instantly severs client WebSockets and invalidates access.
          </span>
          <button
            onClick={onClose}
            className="h-7 px-3 bg-[#2d2d2d] hover:bg-[#383838] text-zinc-200 rounded text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
