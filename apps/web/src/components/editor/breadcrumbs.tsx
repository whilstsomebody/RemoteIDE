"use client";

import React from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";

export interface BreadcrumbsProps {
  path: string;
  onSelectSegment?: (segmentPath: string) => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ path, onSelectSegment }) => {
  if (!path) return null;

  const parts = path.split("/").filter(Boolean);

  return (
    <div className="h-6 px-3 bg-zinc-950/60 border-b border-zinc-800/80 flex items-center text-[11px] text-zinc-400 select-none overflow-x-auto shrink-0 font-mono">
      {parts.map((part, idx) => {
        const isLast = idx === parts.length - 1;
        const segmentPath = parts.slice(0, idx + 1).join("/");

        return (
          <React.Fragment key={segmentPath}>
            {idx > 0 && <ChevronRight className="w-3 h-3 text-zinc-600 mx-1 shrink-0" />}
            <button
              onClick={() => onSelectSegment?.(segmentPath)}
              className={`flex items-center gap-1 hover:text-zinc-200 transition-colors truncate ${
                isLast ? "text-zinc-200 font-medium" : "text-zinc-500"
              }`}
            >
              {isLast ? (
                <FileText className="w-3 h-3 text-indigo-400 shrink-0" />
              ) : (
                <Folder className="w-3 h-3 text-zinc-600 shrink-0" />
              )}
              <span className="truncate">{part}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};
