"use client";

import React from "react";
import {
  Files,
  Search,
  Terminal,
  Settings,
  Server,
  GitBranch,
  Send,
  Globe,
  Bug,
  FlaskConical,
  Code2,
  Activity,
  Database,
} from "lucide-react";
import { cn } from "@remote-ide/ui";

export type ActivityTab =
  | "files"
  | "search"
  | "git"
  | "debug"
  | "testing"
  | "languages"
  | "devops"
  | "database"
  | "apiclient"
  | "preview"
  | "terminal"
  | "agent"
  | "settings";

export interface ActivityBarProps {
  activeTab: ActivityTab | null;
  onSelectTab: (tab: ActivityTab) => void;
  gitBadgeCount?: number;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeTab,
  onSelectTab,
  gitBadgeCount = 0,
}) => {
  const items: Array<{
    id: ActivityTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: "files", label: "Explorer", icon: Files },
    { id: "search", label: "Search Workspace", icon: Search },
    { id: "git", label: "Source Control", icon: GitBranch, badge: gitBadgeCount },
    { id: "debug", label: "Run & Debug", icon: Bug },
    { id: "testing", label: "Testing", icon: FlaskConical },
    { id: "languages", label: "Language Support", icon: Code2 },
    { id: "devops", label: "DevOps & Monitoring", icon: Activity },
    { id: "database", label: "Database Explorer", icon: Database },
    { id: "apiclient", label: "API Client", icon: Send },
    { id: "preview", label: "App Preview", icon: Globe },
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
                "w-10 h-10 relative flex items-center justify-center rounded transition-colors text-zinc-400 hover:text-zinc-100",
                isActive && "text-white bg-zinc-800/80 border-l-2 border-indigo-500 rounded-l-none"
              )}
            >
              <Icon className="w-5 h-5" />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-1.5 right-1.5 bg-indigo-600 text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center">
                  {item.badge}
                </span>
              )}
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
