"use client";

import React, { useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Download, Image as ImageIcon } from "lucide-react";
import { Button, Badge } from "@remote-ide/ui";

export interface ImageViewerProps {
  src: string; // url or data:image/...;base64,...
  filename: string;
  sizeBytes?: number;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ src, filename, sizeBytes }) => {
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const handleZoomIn = () => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100));
  const handleZoomOut = () => setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100));
  const handleReset = () => setZoom(1);

  const ext = filename.split(".").pop()?.toUpperCase() || "IMAGE";
  const sizeKb = sizeBytes ? Math.round((sizeBytes / 1024) * 10) / 10 : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Image Toolbar */}
      <div className="h-10 px-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-3">
          <Badge
            variant="default"
            className="gap-1.5 text-[11px] bg-zinc-800 text-zinc-300 border-zinc-700"
          >
            <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span>{ext}</span>
          </Badge>
          {dimensions && (
            <span className="text-zinc-400 font-mono text-[11px]">
              {dimensions.width} × {dimensions.height} px
            </span>
          )}
          {sizeKb !== null && (
            <span className="text-zinc-500 font-mono text-[11px]">• {sizeKb} KB</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= 0.25}
            className="h-7 w-7 p-0 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs font-mono w-12 text-center text-zinc-400">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= 4}
            className="h-7 w-7 p-0 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-7 px-2 text-xs border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            title="Reset Zoom to 100%"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            <span>100%</span>
          </Button>
          <a
            href={src}
            download={filename}
            className="h-7 px-2.5 inline-flex items-center gap-1 text-xs border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
            title="Download image"
          >
            <Download className="w-3 h-3" />
            <span>Download</span>
          </a>
        </div>
      </div>

      {/* Image Display Canvas with transparency pattern */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-zinc-950/80 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={filename}
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          className="max-w-full max-h-full object-contain transition-transform duration-100 shadow-2xl rounded border border-zinc-800"
          onLoad={(e) => {
            const img = e.currentTarget;
            setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          }}
        />
      </div>
    </div>
  );
};
