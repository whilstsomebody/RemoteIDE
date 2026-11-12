import * as React from "react";
import { cn } from "../lib/utils.js";

export interface StatusIndicatorProps {
  status: "connected" | "connecting" | "disconnected" | "error";
  label?: string;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label, className }) => {
  const dotColor = {
    connected: "bg-emerald-500",
    connecting: "bg-amber-500 animate-pulse",
    disconnected: "bg-zinc-500",
    error: "bg-rose-500",
  }[status];

  const defaultLabels = {
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
    error: "Error",
  };

  return (
    <div className={cn("inline-flex items-center gap-2 text-xs text-zinc-300", className)}>
      <span className={cn("h-2 w-2 rounded-full", dotColor)} />
      <span>{label ?? defaultLabels[status]}</span>
    </div>
  );
};
