"use client";

import React from "react";
import { AiAssistantPanel } from "../ai/ai-assistant-panel";
import { AiMessageContext } from "@remote-ide/shared";

export interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  workspaceId?: string;
  workspaceName?: string;
  hostName?: string;
  gatewayUrl?: string;
  token?: string;
  activeFilePath?: string | null;
  cursorLine?: number;
  selectedText?: string;
  activeError?: string;
  activeTerminalOutput?: string;
  initialPrompt?: string;
  initialContext?: AiMessageContext;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  isOpen,
  onClose,
  width,
  onWidthChange,
  workspaceId = "default",
  workspaceName = "Workspace",
  gatewayUrl = "http://localhost:4000",
  token,
  activeFilePath,
  cursorLine,
  selectedText,
  activeError,
  activeTerminalOutput,
  initialPrompt,
  initialContext,
}) => {
  return (
    <AiAssistantPanel
      isOpen={isOpen}
      onClose={onClose}
      width={width}
      onWidthChange={onWidthChange}
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      gatewayUrl={gatewayUrl}
      token={token}
      activeFilePath={activeFilePath}
      cursorLine={cursorLine}
      selectedText={selectedText}
      activeError={activeError}
      activeTerminalOutput={activeTerminalOutput}
      initialPrompt={initialPrompt}
      initialContext={initialContext}
    />
  );
};
