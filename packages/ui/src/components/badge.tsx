import * as React from "react";
import { cn } from "../lib/utils.js";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "outline";
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "default",
  children,
  ...props
}) => {
  const variantStyles = {
    default: "bg-zinc-800 text-zinc-300 border-zinc-700",
    success: "bg-emerald-950/80 text-emerald-400 border-emerald-800",
    warning: "bg-amber-950/80 text-amber-400 border-amber-800",
    danger: "bg-rose-950/80 text-rose-400 border-rose-800",
    outline: "border-zinc-700 text-zinc-400 bg-transparent",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

