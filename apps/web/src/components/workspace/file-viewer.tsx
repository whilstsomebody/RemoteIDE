"use client";

import React, { useState, useEffect } from "react";
import { Save, AlertCircle, Check, FileText, Binary, ShieldCheck } from "lucide-react";
import { Button, Badge } from "@remote-ide/ui";
import { ReadFileResponse, FileStat } from "@remote-ide/shared";

export interface FileViewerProps {
  file: ReadFileResponse | null;
  stat: FileStat | null;
  onSave: (path: string, content: string, expectedETag: string) => Promise<void>;
  isLoading?: boolean;
}

export const FileViewer: React.FC<FileViewerProps> = ({
  file,
  stat,
  onSave,
  isLoading = false,
}) => {
  const [content, setContent] = useState<string>("");
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "conflict" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      setContent(file.content);
      setIsDirty(false);
      setSaveStatus("idle");
      setErrorMessage(null);
    }
  }, [file]);

  const handleSave = async () => {
    if (!file) return;

    setIsSaving(true);
    setSaveStatus("idle");
    setErrorMessage(null);

    try {
      await onSave(file.path, content, file.eTag);
      setIsDirty(false);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      if (errObj.code === "CONCURRENCY_CONFLICT") {
        setSaveStatus("conflict");
        setErrorMessage("File modified on host. Reload before saving.");
      } else {
        setSaveStatus("error");
        setErrorMessage(errObj.message || "Failed to save file");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
        Loading file contents from host...
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-xs text-zinc-500 p-8 space-y-3">
        <FileText className="w-8 h-8 text-zinc-600" />
        <p>Select a file from the explorer on the left to view or edit.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-ide-bg text-zinc-100 overflow-hidden select-text">
      <div className="h-10 bg-zinc-950/80 border-b border-zinc-800 px-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="font-mono font-medium text-zinc-200">{file.path}</span>
          {file.isBinary ? (
            <Badge variant="warning" className="text-[10px] gap-1">
              <Binary className="w-3 h-3" /> Binary
            </Badge>
          ) : (
            <Badge variant="default" className="text-[10px] gap-1">
              <FileText className="w-3 h-3" /> Text ({file.encoding})
            </Badge>
          )}

          {stat && (
            <span className="text-[11px] text-zinc-500 font-mono">
              {Math.round((stat.size / 1024) * 10) / 10} KB • ETag: {stat.eTag.slice(0, 10)}...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {saveStatus === "success" && (
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}

          {saveStatus === "conflict" && (
            <span className="text-[11px] text-rose-400 flex items-center gap-1 font-mono">
              <AlertCircle className="w-3.5 h-3.5" /> Conflict
            </span>
          )}

          {!file.isBinary && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="h-7 text-xs gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Saving..." : "Save (Atomic)"}
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-1.5 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex-1 overflow-hidden p-0 relative">
        {file.isBinary ? (
          <div className="p-6 text-center text-zinc-400 space-y-2">
            <Binary className="w-10 h-10 mx-auto text-zinc-500" />
            <p className="text-sm font-semibold">Binary File</p>
            <p className="text-xs text-zinc-500 font-mono">
              Binary data is preserved on host. Editing binary files in browser is disabled to
              prevent corruption.
            </p>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setIsDirty(true);
            }}
            spellCheck={false}
            className="w-full h-full p-4 bg-ide-bg text-zinc-200 font-mono text-xs leading-relaxed resize-none outline-none border-none focus:ring-0"
            placeholder="File content..."
          />
        )}
      </div>

      <div className="h-6 bg-zinc-950/90 border-t border-zinc-800/80 px-4 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <div className="flex items-center gap-3">
          <span>Lines: {file.isBinary ? 0 : content.split("\n").length}</span>
          <span>Chars: {content.length}</span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400">
          <ShieldCheck className="w-3 h-3" />
          <span>Isolated in Workspace Root</span>
        </div>
      </div>
    </div>
  );
};
