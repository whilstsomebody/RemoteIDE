"use client";

import React from "react";
import { Files, Terminal, Settings, Server } from "lucide-react";
import { cn } from "@remote-ide/ui";

export type ActivityTab = "files" | "terminal" | "agent" | "settings";

export interface ActivityBarProps {
  activeTab: ActivityTab | null;
  onSelectTab: (tab: ActivityTab) => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activeTab, onSelectTab }) => {
  const items: Array<{
    id: ActivityTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "files", label: "Explorer", icon: Files },
    { id: "terminal", label: "Terminal", icon: Terminal },
    { id: "agent", label: "Host Agent", icon: Server },
  ];

  return (
    <div className="w-12 bg-ide-activity border-r border-ide-border flex flex-col justify-between items-center py-2 select-none z-10 shrink-0">
      <div className="flex flex-col gap-1 w-full items-center">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={item.label}
              className={cn(
                "w-10 h-10 flex items-center justify-center rounded transition-colors text-zinc-400 hover:text-zinc-100",
                isActive && "text-white bg-zinc-800/80 border-l-2 border-indigo-500 rounded-l-none"
              )}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1 w-full items-center">
        <button
          onClick={() => onSelectTab("settings")}
          title="Settings"
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded transition-colors text-zinc-400 hover:text-zinc-100",
            activeTab === "settings" &&
              "text-white bg-zinc-800/80 border-l-2 border-indigo-500 rounded-l-none"
          )}
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
