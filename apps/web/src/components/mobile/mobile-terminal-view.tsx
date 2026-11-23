"use client";

import React from "react";
import { TerminalContainer } from "../terminal/terminal-container";

export interface MobileTerminalViewProps {
  gatewayUrl?: string;
  onSendInput?: (input: string) => void;
}

export const MobileTerminalView: React.FC<MobileTerminalViewProps> = ({
  gatewayUrl,
  onSendInput,
}) => {
  const terminalShortcuts = [
    { label: "ESC", val: "\x1b" },
    { label: "CTRL+C", val: "\x03" },
    { label: "TAB", val: "\t" },
    { label: "↑", val: "\x1b[A" },
    { label: "↓", val: "\x1b[B" },
    { label: "←", val: "\x1b[D" },
    { label: "→", val: "\x1b[C" },
    { label: "CLEAR", val: "clear\r" },
  ];

  return (
    <div className="flex flex-col h-full bg-zinc-950 select-none overflow-hidden">
      <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 gap-1.5 overflow-x-auto shrink-0 select-none">
        <span className="text-[10px] uppercase font-mono text-zinc-500 px-1 font-bold shrink-0">
          Keys:
        </span>
        {terminalShortcuts.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              if (onSendInput) {
                onSendInput(item.val);
              }
            }}
            className="min-h-[32px] px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-200 rounded text-xs font-mono font-medium transition-colors shrink-0"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden relative">
        <TerminalContainer gatewayUrl={gatewayUrl} className="h-full border-none" />
      </div>
    </div>
  );
};

