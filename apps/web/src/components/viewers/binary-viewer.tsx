"use client";

import React, { useMemo } from "react";
import { Binary, ShieldAlert, Download } from "lucide-react";
import { Badge, Button } from "@remote-ide/ui";

export interface BinaryViewerProps {
  path: string;
  sizeBytes: number;
  eTag: string;
  base64Content?: string;
  onDownload?: () => void;
}

export function formatHexDump(base64: string, maxBytes = 256): string[] {
  if (!base64) return [];
  try {
    const raw = atob(base64.slice(0, Math.ceil((maxBytes * 4) / 3)));
    const lines: string[] = [];
    const len = Math.min(raw.length, maxBytes);

    for (let offset = 0; offset < len; offset += 16) {
      const offsetHex = offset.toString(16).padStart(8, "0");
      const chunk = raw.slice(offset, offset + 16);
      let hexPart = "";
      let asciiPart = "";

      for (let i = 0; i < 16; i++) {
        if (i < chunk.length) {
          const code = chunk.charCodeAt(i);
          hexPart += code.toString(16).padStart(2, "0") + " ";
          asciiPart += code >= 32 && code <= 126 ? chunk[i] : ".";
        } else {
          hexPart += "   ";
        }
        if (i === 7) hexPart += " ";
      }

      lines.push(`${offsetHex}  ${hexPart} |${asciiPart}|`);
    }

    return lines;
  } catch {
    return ["Could not decode binary preview."];
  }
}

export const BinaryViewer: React.FC<BinaryViewerProps> = ({
  path,
  sizeBytes,
  eTag,
  base64Content,
  onDownload,
}) => {
  const hexDump = useMemo(
    () => (base64Content ? formatHexDump(base64Content) : []),
    [base64Content]
  );
  const filename = path.split("/").pop() || "binary.bin";
  const sizeKb = Math.round((sizeBytes / 1024) * 10) / 10;

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 p-6 overflow-y-auto font-mono">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Banner */}
        <div className="border border-amber-500/30 bg-amber-950/20 rounded-lg p-5 flex items-start gap-4">
          <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-sm font-semibold text-amber-200">Binary or Unsupported Document</h3>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed">
              This file contains non-text or binary data. To prevent corruption, RemoteIDE does not
              allow direct text editing for this file format.
            </p>
          </div>
        </div>

        {/* File Metadata */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-zinc-400">Filename:</span>
            <span className="text-zinc-200 font-semibold">{filename}</span>
          </div>
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-zinc-400">File Size:</span>
            <span className="text-zinc-200">
              {sizeKb} KB ({sizeBytes} bytes)
            </span>
          </div>
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-zinc-400">Host ETag:</span>
            <span className="text-zinc-400 truncate max-w-xs">{eTag}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Type:</span>
            <Badge variant="warning" className="text-[10px] gap-1">
              <Binary className="w-3 h-3" /> Binary Document
            </Badge>
          </div>
        </div>

        {/* Hex Dump Section */}
        {hexDump.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Hexadecimal Header Preview (first 256 bytes):</span>
            </div>
            <pre className="p-4 bg-zinc-900/90 border border-zinc-800 rounded-lg text-[11px] text-zinc-300 overflow-x-auto leading-5 select-text">
              {hexDump.join("\n")}
            </pre>
          </div>
        )}

        {/* Download action */}
        {onDownload && (
          <div className="flex justify-end">
            <Button
              onClick={onDownload}
              variant="outline"
              size="sm"
              className="gap-2 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File from Host</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
