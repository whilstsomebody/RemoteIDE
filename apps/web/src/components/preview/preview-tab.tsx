"use client";

import React, { useState } from "react";
import {
  Globe,
  RefreshCw,
  ExternalLink,
  Smartphone,
  Tablet,
  Monitor,
  Maximize2,
  Minimize2,
} from "lucide-react";

export interface PreviewTabProps {
  gatewayUrl?: string;
  initialPort?: number;
}

export const PreviewTab: React.FC<PreviewTabProps> = ({ gatewayUrl = "", initialPort = 3000 }) => {
  const [port, setPort] = useState<number>(initialPort);
  const [path, setPath] = useState<string>("/");
  const [deviceMode, setDeviceMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const previewBaseUrl = `${gatewayUrl || (typeof window !== "undefined" ? window.location.origin : "")}/api/v1/preview/${port}`;
  const fullPreviewUrl = `${previewBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const handleReload = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    window.open(fullPreviewUrl, "_blank");
  };

  const getContainerWidth = () => {
    if (deviceMode === "mobile") return "375px";
    if (deviceMode === "tablet") return "768px";
    return "100%";
  };

  return (
    <div
      className={`flex flex-col h-full w-full bg-[#0d0d11] text-zinc-300 text-xs select-none ${
        isFullscreen ? "fixed inset-0 z-50 p-0" : ""
      }`}
    >
      {/* Navigation & Controls Bar */}
      <div className="h-10 px-3 border-b border-ide-border bg-zinc-900/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <button
            onClick={handleReload}
            title="Reload Preview"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Port Input */}
          <div className="flex items-center bg-zinc-800/80 rounded border border-zinc-700/80 px-2 py-1 text-xs font-mono">
            <span className="text-zinc-500 mr-1">:</span>
            <input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value, 10) || 3000)}
              className="w-14 bg-transparent text-zinc-200 focus:outline-none"
            />
          </div>

          {/* Path Bar */}
          <div className="flex items-center flex-1 bg-zinc-800/80 rounded border border-zinc-700/80 px-2 py-1 text-xs">
            <Globe className="w-3 h-3 text-zinc-500 mr-1.5 shrink-0" />
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleReload();
              }}
              placeholder="/"
              className="w-full bg-transparent text-zinc-200 focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Device Mode Switcher & Actions */}
        <div className="flex items-center gap-1">
          <div className="flex items-center bg-zinc-800/60 rounded p-0.5 border border-zinc-700/60">
            <button
              onClick={() => setDeviceMode("desktop")}
              title="Desktop View (100%)"
              className={`p-1 rounded ${deviceMode === "desktop" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeviceMode("tablet")}
              title="Tablet View (768px)"
              className={`p-1 rounded ${deviceMode === "tablet" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeviceMode("mobile")}
              title="Mobile View (375px)"
              className={`p-1 rounded ${deviceMode === "mobile" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleOpenExternal}
            title="Open in New Tab"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Frame Container */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-[#09090b]">
        <div
          style={{ width: getContainerWidth() }}
          className={`h-full bg-white rounded-md shadow-2xl transition-[width] duration-200 overflow-hidden border border-zinc-800 ${
            deviceMode !== "desktop" ? "max-h-[880px]" : ""
          }`}
        >
          <iframe
            key={iframeKey}
            src={fullPreviewUrl}
            title={`Preview on port ${port}`}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups"
          />
        </div>
      </div>
    </div>
  );
};
