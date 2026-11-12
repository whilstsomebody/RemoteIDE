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
import { FileCode, Loader2 } from "lucide-react";

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
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onUpdateContent: (path: string, content: string) => void;
  onCursorChange?: (line: number, col: number, selLen: number) => void;
  onSaveFile: (path: string) => void;
  onSaveAll: () => void;
  onSplitEditor?: () => void;
  isSplit?: boolean;
  showSplitButton?: boolean;
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
  onSelectTab,
  onCloseTab,
  onUpdateContent,
  onCursorChange,
  onSaveFile,
  onSaveAll,
  onSplitEditor,
  isSplit = false,
  showSplitButton = true,
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
    <div className="flex-1 flex flex-col h-full bg-ide-bg overflow-hidden border-r border-zinc-800/80">
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
      />

      {/* Breadcrumbs */}
      {activeTab && <Breadcrumbs path={activeTab} />}

      {/* Editor Body */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Loading file from host...</span>
          </div>
        )}

        {!isLoading && !activeBuffer && (
          <div className="flex-1 flex flex-col items-center justify-center text-xs text-zinc-500 p-8 space-y-3">
            <FileCode className="w-10 h-10 text-zinc-700" />
            <p className="text-zinc-400 font-medium">No open file in this editor pane</p>
            <p className="text-zinc-500 text-[11px]">
              Select a file from the explorer on the left or press{" "}
              <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-zinc-900 border border-zinc-800 rounded text-zinc-300">
                Cmd+K
              </kbd>{" "}
              to open files.
            </p>
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
                    readOnly={activeBuffer.deletedOnDisk}
                    onChange={(newDoc) => onUpdateContent(activeBuffer.path, newDoc)}
                    onCursorChange={onCursorChange}
                    onSave={() => onSaveFile(activeBuffer.path)}
                    onSaveAll={onSaveAll}
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
