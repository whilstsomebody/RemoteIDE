"use client";

import React from "react";
import { Folder, Code2, Terminal, GitBranch, Activity } from "lucide-react";
import { cn } from "@remote-ide/ui";

export type MobileTab = "files" | "editor" | "terminal" | "git" | "dashboard";

export interface MobileNavBarProps {
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  hasDirtyFiles?: boolean;
  uncommittedCount?: number;
  activeFileName?: string | null;
}

export const MobileNavBar: React.FC<MobileNavBarProps> = ({
  activeTab,
  onSelectTab,
  hasDirtyFiles = false,
  uncommittedCount = 0,
  activeFileName,
}) => {
  const tabs: Array<{
    id: MobileTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | boolean;
  }> = [
    { id: "files", label: "Files", icon: Folder },
    {
      id: "editor",
      label: activeFileName ? activeFileName.split("/").pop() || "Editor" : "Editor",
      icon: Code2,
      badge: hasDirtyFiles,
    },
    { id: "terminal", label: "Terminal", icon: Terminal },
    {
      id: "git",
      label: "Git",
      icon: GitBranch,
      badge: uncommittedCount > 0 ? uncommittedCount : undefined,
    },
    { id: "dashboard", label: "Status", icon: Activity },
  ];

  return (
    <nav className="h-14 bg-zinc-950 border-t border-zinc-800 flex items-center justify-around px-2 z-40 shrink-0 select-none pb-[env(safe-area-inset-bottom,0px)]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-1 relative rounded-md transition-colors min-h-[44px]",
              isActive
                ? "text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <div className="relative">
              <Icon className={cn("w-5 h-5", isActive ? "text-zinc-100" : "text-zinc-400")} />
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span className="absolute -top-1 -right-2 bg-zinc-800 border border-zinc-700 text-zinc-200 text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center">
                  {tab.badge}
                </span>
              )}
              {typeof tab.badge === "boolean" && tab.badge && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-zinc-950" />
              )}
            </div>
            <span className="text-[10px] mt-0.5 truncate max-w-[64px]">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
