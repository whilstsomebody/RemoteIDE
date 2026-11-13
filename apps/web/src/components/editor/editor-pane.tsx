"use client";

import React, { useState } from "react";
import { TabBar, TabItem } from "./tab-bar";
import { Breadcrumbs } from "./breadcrumbs";
import { CodeEditor } from "./code-editor";
import { MarkdownViewer } from "../viewers/markdown-viewer";
import { JsonViewer } from "../viewers/json-viewer";
import { CsvViewer } from "../viewers/csv-viewer";
import { ImageViewer } from "../viewers/image-viewer";
import { BinaryViewer } from "../viewers/binary-viewer";
import { getLanguageDefinition } from "../../lib/editor/language-registry";
import { EditorSettings } from "../../lib/storage/settings-storage";
import { Loader2 } from "lucide-react";

export interface FileBuffer {
  path: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  eTag: string;
  mtime: number;
  isBinary: boolean;
  encoding: "utf-8" | "base64";
  size: number;
  deletedOnDisk?: boolean;
  hasExternalConflict?: boolean;
}

export interface EditorPaneProps {
  paneId: "primary" | "secondary";
  tabs: string[];
  activeTab: string | null;
  buffers: Record<string, FileBuffer>;
  loadingPaths: Set<string>;
  settings: EditorSettings;
  agentUrl: string;
  activeWorkspaceId: string | null;
  readOnly?: boolean;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onUpdateContent: (path: string, content: string) => void;
  onCursorChange?: (line: number, col: number, selLen: number) => void;
  onSaveFile: (path: string) => void;
  onSaveAll: () => void;
  onSplitEditor?: () => void;
  isSplit?: boolean;
  showSplitButton?: boolean;
  onNewUntitledFile?: () => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  paneId: _paneId,
  tabs,
  activeTab,
  buffers,
  loadingPaths,
  settings,
  agentUrl,
  activeWorkspaceId,
  readOnly = false,
  onSelectTab,
  onCloseTab,
  onUpdateContent,
  onCursorChange,
  onSaveFile,
  onSaveAll,
  onSplitEditor,
  isSplit = false,
  showSplitButton = true,
  onNewUntitledFile,
}) => {
  const [markdownPreviewModes, setMarkdownPreviewModes] = useState<Record<string, boolean>>({});

  const tabItems: TabItem[] = tabs.map((p) => {
    const buf = buffers[p];
    return {
      path: p,
      isDirty: buf?.isDirty,
      deletedOnDisk: buf?.deletedOnDisk,
    };
  });

  const activeBuffer = activeTab ? buffers[activeTab] : null;
  const isLoading = activeTab ? loadingPaths.has(activeTab) : false;
  const language = activeTab ? getLanguageDefinition(activeTab) : null;
  const isMarkdownPreview = activeTab ? !!markdownPreviewModes[activeTab] : false;

  const toggleMarkdownPreview = () => {
    if (!activeTab) return;
    setMarkdownPreviewModes((prev) => ({
      ...prev,
      [activeTab]: !prev[activeTab],
    }));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e] overflow-hidden border-r border-zinc-800/80">
      {/* Tabs */}
      <TabBar
        tabs={tabItems}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onCloseTab={(path, e) => {
          e.stopPropagation();
          onCloseTab(path);
        }}
        onSplitEditor={onSplitEditor}
        isSplit={isSplit}
        isMarkdownPreview={isMarkdownPreview}
        onToggleMarkdownPreview={toggleMarkdownPreview}
        showSplitButton={showSplitButton}
        onNewUntitledFile={onNewUntitledFile}
      />

      {/* Breadcrumbs */}
      {activeTab && (
        <div className="flex items-center justify-between border-b border-[#252526] bg-[#1e1e1e] pr-3">
          <Breadcrumbs path={activeTab} />
          {readOnly && (
            <span className="text-[10px] font-semibold tracking-wider text-amber-400 bg-amber-950/40 border border-amber-800/60 px-1.5 py-0.5 rounded font-mono select-none">
              READ-ONLY (VIEWER)
            </span>
          )}
        </div>
      )}

      {/* Editor Body */}
      <div
        onDoubleClick={!activeBuffer ? onNewUntitledFile : undefined}
        className="flex-1 overflow-hidden relative flex flex-col bg-[#1e1e1e]"
      >
        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Loading file from host...</span>
          </div>
        )}

        {/* Clean Center Logo & Watermark when empty (covering ~40% of the area at the center) */}
        {!isLoading && !activeBuffer && (
          <div
            className="flex-1 flex flex-col items-center justify-center p-8 select-none"
            title="Double-click anywhere to create a new text file"
          >
            <div className="w-full max-w-sm flex flex-col items-center text-center space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="RemoteIDE Logo"
                className="w-24 h-24 md:w-28 md:h-28 object-contain select-none pointer-events-none drop-shadow-[0_10px_20px_rgba(255,255,255,0.06)]"
              />
              <h1 className="text-2xl font-semibold tracking-wider text-zinc-200 font-sans">
                RemoteIDE
              </h1>
              <p className="text-xs text-zinc-400 font-sans">
                Double-click to create a new untitled file
              </p>
            </div>
          </div>
        )}

        {!isLoading && activeBuffer && language && (
          <>
            {/* Special Viewers */}
            {activeBuffer.isBinary || language.specialViewer === "binary" ? (
              <BinaryViewer
                path={activeBuffer.path}
                sizeBytes={activeBuffer.size}
                eTag={activeBuffer.eTag}
                base64Content={
                  activeBuffer.encoding === "base64" ? activeBuffer.content : undefined
                }
                onDownload={() => {
                  const url = `${agentUrl}/api/v1/workspaces/${activeWorkspaceId}/files/read?path=${encodeURIComponent(
                    activeBuffer.path
                  )}&encoding=base64`;
                  window.open(url, "_blank");
                }}
              />
            ) : language.specialViewer === "image" ? (
              <ImageViewer
                src={
                  activeBuffer.encoding === "base64"
                    ? `data:image/${activeBuffer.path.split(".").pop()};base64,${activeBuffer.content}`
                    : `${agentUrl}/api/v1/workspaces/${activeWorkspaceId}/files/read?path=${encodeURIComponent(
                        activeBuffer.path
                      )}`
                }
                filename={activeBuffer.path}
                sizeBytes={activeBuffer.size}
              />
            ) : language.specialViewer === "csv" ? (
              <CsvViewer content={activeBuffer.content} path={activeBuffer.path} />
            ) : isMarkdownPreview ? (
              <MarkdownViewer content={activeBuffer.content} />
            ) : (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {language.specialViewer === "json" && (
                  <JsonViewer
                    content={activeBuffer.content}
                    onFormat={(formatted) => onUpdateContent(activeBuffer.path, formatted)}
                  />
                )}

                <div className="flex-1 overflow-hidden">
                  <CodeEditor
                    doc={activeBuffer.content}
                    path={activeBuffer.path}
                    language={language}
                    theme={settings.theme}
                    fontSize={settings.fontSize}
                    tabSize={settings.tabSize}
                    wordWrap={settings.wordWrap}
                    readOnly={readOnly || activeBuffer.deletedOnDisk}
                    onChange={(newDoc) => {
                      if (readOnly) return;
                      onUpdateContent(activeBuffer.path, newDoc);
                    }}
                    onCursorChange={onCursorChange}
                    onSave={() => {
                      if (readOnly) return;
                      onSaveFile(activeBuffer.path);
                    }}
                    onSaveAll={() => {
                      if (readOnly) return;
                      onSaveAll();
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
