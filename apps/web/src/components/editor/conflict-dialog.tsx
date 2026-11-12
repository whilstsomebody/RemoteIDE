"use client";

import React from "react";
import { AlertTriangle, RefreshCw, UploadCloud } from "lucide-react";
import { Button } from "@remote-ide/ui";

export interface ConflictDialogProps {
  isOpen: boolean;
  filePath: string;
  onOverwriteHost: () => void;
  onReloadFromHost: () => void;
  onCancel: () => void;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  isOpen,
  filePath,
  onOverwriteHost,
  onReloadFromHost,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl p-6 space-y-5 animate-in fade-in-0 zoom-in-95">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-base font-semibold text-zinc-100">
              Host File Modified Concurrently
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              The file <span className="font-mono text-zinc-200">{filePath}</span> has been modified
              on the host computer by another process since you opened it.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Saving your local changes now will overwrite the host file. How would you like to
              proceed?
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="text-xs border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Cancel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onReloadFromHost}
            className="text-xs gap-1.5 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            <span>Reload from Host</span>
          </Button>

          <Button
            variant="danger"
            size="sm"
            onClick={onOverwriteHost}
            className="text-xs gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-medium"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Overwrite Host File</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
