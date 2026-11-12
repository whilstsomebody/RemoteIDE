"use client";

import React, { useState } from "react";
import { Header } from "./header";
import { ActivityBar, ActivityTab } from "./activity-bar";
import { Sidebar } from "./sidebar";
import { WorkspaceCanvas } from "./workspace-canvas";
import { StatusBar } from "./status-bar";

export const IdeShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActivityTab | null>("files");
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "disconnected" | "error"
  >("connected");

  const handleSelectTab = (tab: ActivityTab) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  const handleRefresh = () => {
    setConnectionStatus("connecting");
    setTimeout(() => {
      setConnectionStatus("connected");
    }, 500);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-ide-bg text-zinc-100 select-none overflow-hidden">
      <Header
        projectName="RemoteIDE Core"
        connectionStatus={connectionStatus}
        hostName="host-agent-local"
        onRefresh={handleRefresh}
      />

      <div className="flex-1 flex overflow-hidden">
        <ActivityBar activeTab={activeTab} onSelectTab={handleSelectTab} />
        <Sidebar activeTab={activeTab} hostStatus={connectionStatus} />
        <WorkspaceCanvas />
      </div>

      <StatusBar latencyMs={connectionStatus === "connected" ? 14 : 0} />
    </div>
  );
};
