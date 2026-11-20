"use client";

import React from "react";
import { Download, Smartphone } from "lucide-react";
import { cn } from "@remote-ide/ui";

export interface MobileHeaderProps {
  projectName?: string;
  connectionStatus: "connected" | "connecting" | "disconnected" | "error";
  isOnline?: boolean;
  isInstallable?: boolean;
  onInstallPwa?: () => void;
  onOpenHandoff?: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  projectName = "RemoteIDE",
  connectionStatus,
  isOnline = true,
  isInstallable = false,
  onInstallPwa,
  onOpenHandoff,
}) => {
  return (
    <header className="h-11 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-3 z-40 shrink-0 select-none pt-[env(safe-area-inset-top,0px)]">
      {/* Left: Logo & Project Name */}
      <div className="flex items-center gap-2 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="RemoteIDE" className="h-5 w-5 object-contain select-none shrink-0" />
        <span className="font-semibold text-zinc-200 text-xs truncate max-w-[160px]">
          {projectName}
        </span>
      </div>

      {/* Right: Network indicator, PWA install button, and Handoff button */}
      <div className="flex items-center gap-2">
        {/* Network / Connection status dot */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              connectionStatus === "connected" && isOnline
                ? "bg-emerald-500"
                : connectionStatus === "connecting"
                ? "bg-amber-500 animate-pulse"
                : "bg-rose-500"
            )}
          />
          <span className="text-zinc-400 capitalize">
            {!isOnline ? "Offline" : connectionStatus}
          </span>
        </div>

        {/* PWA Install Button */}
        {isInstallable && onInstallPwa && (
          <button
            onClick={onInstallPwa}
            className="p-1.5 text-zinc-300 hover:text-zinc-100 bg-zinc-800 border border-zinc-700 rounded transition-colors"
            title="Install App"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Continue on Another Device (Handoff) */}
        {onOpenHandoff && (
          <button
            onClick={onOpenHandoff}
            className="p-1.5 text-zinc-300 hover:text-zinc-100 bg-zinc-800 border border-zinc-700 rounded transition-colors"
            title="Continue on Another Device"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </header>
  );
};
