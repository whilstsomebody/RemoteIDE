"use client";

import React, { useState } from "react";
import {
  Share2,
  X,
  Copy,
  Check,
  Shield,
  Clock,
  Key,
  QrCode,
  FolderCheck,
  AlertTriangle,
} from "lucide-react";
import { Button, Input } from "@remote-ide/ui";
import { UserRole } from "@remote-ide/shared";
import { QrCodeSvg } from "./qr-code";

export interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Array<{ id: string; name: string }>;
  currentWorkspaceId?: string;
  gatewayUrl?: string;
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  isOpen,
  onClose,
  workspaces,
  currentWorkspaceId,
  gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4000",
}) => {
  const [name, setName] = useState("Temporary Collaboration Access");
  const [role, setRole] = useState<UserRole>(UserRole.VIEWER);
  const [expiresInSeconds, setExpiresInSeconds] = useState(3600); // 1 hour
  const [oneTimeRedemption, setOneTimeRedemption] = useState(true);
  const [pin, setPin] = useState("");
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>(
    currentWorkspaceId ? [currentWorkspaceId] : []
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<{
    accessUrl: string;
    rawToken: string;
    expiresAt: string;
  } | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${gatewayUrl}/api/v1/share-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          expiresInSeconds,
          oneTimeRedemption,
          pin: pin.trim() || undefined,
          allowedWorkspaceIds: selectedWorkspaceIds,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message || "Failed to generate share link");
      }

      const fullUrl = `${window.location.origin}${body.data.accessUrl}`;
      setGeneratedLink({
        accessUrl: fullUrl,
        rawToken: body.data.rawToken,
        expiresAt: body.data.shareLink.expiresAt,
      });
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!generatedLink) return;
    void navigator.clipboard.writeText(generatedLink.accessUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/75 backdrop-blur-sm p-4 animate-in fade-in-0 font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1e1e1e] border-b border-[#3c3c3c]">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-sm text-zinc-100">Share Host Computer Access</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {!generatedLink ? (
          <form onSubmit={handleGenerate} className="p-5 space-y-4">
            {/* Description */}
            <p className="text-zinc-400 leading-relaxed text-[11px]">
              Generate a temporary, cryptographically authenticated access link. Remote users can
              safely browse or edit workspaces directly on your host without inbound router port
              forwarding.
            </p>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="font-medium text-zinc-300">Link Label</label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Code Review with Alex"
                className="bg-[#1e1e1e] border-[#3c3c3c] text-zinc-100 h-8 text-xs"
              />
            </div>

            {/* Role / Capabilities */}
            <div className="space-y-1.5">
              <label className="font-medium text-zinc-300 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                <span>Granted Role & Permissions</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: UserRole.VIEWER,
                    title: "Viewer",
                    desc: "Read-only file browsing",
                  },
                  {
                    id: UserRole.EDITOR,
                    title: "Editor",
                    desc: "Read & write files",
                  },
                  {
                    id: UserRole.DEVELOPER,
                    title: "Developer",
                    desc: "Read, write, delete & tasks",
                  },
                  {
                    id: UserRole.OPERATOR,
                    title: "Operator",
                    desc: "Full dev & process control",
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setRole(item.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      role === item.id
                        ? "bg-indigo-950/40 border-indigo-500 text-white"
                        : "bg-[#1e1e1e] border-[#3c3c3c] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    <div className="font-semibold text-xs flex items-center justify-between">
                      <span>{item.title}</span>
                      {role === item.id && <Check className="w-3 h-3 text-indigo-400" />}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{item.desc}</div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-zinc-500 flex items-center gap-1 mt-1">
                <span>Note: Interactive terminal access is strictly reserved for the Owner.</span>
              </div>
            </div>

            {/* Expiry Selector */}
            <div className="space-y-1.5">
              <label className="font-medium text-zinc-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Link Expiration</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "15 Mins", sec: 900 },
                  { label: "1 Hour", sec: 3600 },
                  { label: "24 Hours", sec: 86400 },
                  { label: "7 Days", sec: 604800 },
                ].map((opt) => (
                  <button
                    key={opt.sec}
                    type="button"
                    onClick={() => setExpiresInSeconds(opt.sec)}
                    className={`h-7 rounded border text-[11px] font-medium transition-colors ${
                      expiresInSeconds === opt.sec
                        ? "bg-[#0e639c] border-[#1177bb] text-white"
                        : "bg-[#1e1e1e] border-[#3c3c3c] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Workspace Restrictions */}
            {workspaces.length > 0 && (
              <div className="space-y-1.5">
                <label className="font-medium text-zinc-300 flex items-center gap-1.5">
                  <FolderCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Permitted Workspaces</span>
                </label>
                <div className="max-h-24 overflow-y-auto space-y-1 bg-[#1e1e1e] p-2 rounded border border-[#3c3c3c]">
                  {workspaces.map((ws) => {
                    const isChecked = selectedWorkspaceIds.includes(ws.id);
                    return (
                      <label
                        key={ws.id}
                        className="flex items-center gap-2 cursor-pointer hover:text-zinc-100 text-[11px]"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedWorkspaceIds((prev) => [...prev, ws.id]);
                            } else {
                              setSelectedWorkspaceIds((prev) => prev.filter((id) => id !== ws.id));
                            }
                          }}
                          className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
                        />
                        <span className="truncate">{ws.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Security Options: One-Time & PIN */}
            <div className="pt-2 border-t border-[#3c3c3c] space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={oneTimeRedemption}
                  onChange={(e) => setOneTimeRedemption(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
                />
                <span className="font-medium text-zinc-300">
                  One-Time Redemption (link invalidates after first redemption)
                </span>
              </label>

              <div className="space-y-1">
                <label className="font-medium text-zinc-300 flex items-center gap-1.5 text-[11px]">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Optional Passphrase / PIN</span>
                </label>
                <Input
                  type="password"
                  placeholder="Leave empty or set a 4+ character PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="bg-[#1e1e1e] border-[#3c3c3c] text-zinc-100 h-8 text-xs"
                />
              </div>
            </div>

            {error && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-900/60 rounded text-rose-300 text-xs">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#3c3c3c]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="border-[#3c3c3c] bg-[#1e1e1e] text-zinc-300 hover:bg-zinc-800 text-xs h-8"
              >
                Cancel
              </Button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-8 px-4 bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{isSubmitting ? "Generating..." : "Generate Access Link"}</span>
              </button>
            </div>
          </form>
        ) : (
          /* Link Generated State */
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-900/60 rounded-lg text-emerald-300 text-xs">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Temporary access link generated successfully!</span>
            </div>

            <div className="space-y-2">
              <label className="text-zinc-300 font-medium text-xs">Share Link URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedLink.accessUrl}
                  className="w-full bg-[#1e1e1e] border border-[#3c3c3c] text-indigo-300 p-2 rounded text-xs font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="h-8 px-3 bg-[#0e639c] hover:bg-[#1177bb] text-white rounded text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Only the SHA-256 hash is stored on the server. Copy this link now; you will not be
                able to view the raw link again.
              </span>
            </div>

            {/* QR Code Toggle */}
            <div className="pt-2 border-t border-[#3c3c3c] flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{showQr ? "Hide QR Code" : "Show QR Code for Mobile / Tablet"}</span>
              </button>

              {showQr && (
                <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 text-center space-y-2">
                  <QrCodeSvg value={generatedLink.accessUrl} size={160} />
                  <p className="text-[10px] text-zinc-400">Scan from mobile camera to open IDE</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#3c3c3c]">
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-4 bg-[#2d2d2d] hover:bg-[#383838] text-zinc-200 rounded text-xs font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
