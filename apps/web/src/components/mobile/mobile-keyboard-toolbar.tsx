"use client";

import React from "react";
import {
  Save,
  Undo2,
  Redo2,
  Indent,
  Outdent,
  Search,
} from "lucide-react";

export interface MobileKeyboardToolbarProps {
  onInsertSymbol: (symbol: string) => void;
  onIndent?: () => void;
  onOutdent?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onOpenQuickLauncher?: () => void;
  isDirty?: boolean;
}

export const MobileKeyboardToolbar: React.FC<MobileKeyboardToolbarProps> = ({
  onInsertSymbol,
  onIndent,
  onOutdent,
  onUndo,
  onRedo,
  onSave,
  onOpenQuickLauncher,
  isDirty = false,
}) => {
  const symbols = [
    "{",
    "}",
    "(",
    ")",
    "[",
    "]",
    ";",
    "=",
    "=>",
    ":",
    ".",
    ",",
    "\"",
    "'",
    "`",
    "<",
    ">",
    "!",
    "?",
    "|",
    "&",
    "+",
    "-",
    "*",
    "/",
    "\\",
    "_",
    "$",
  ];

  return (
    <div className="bg-zinc-900 border-t border-b border-zinc-800 flex items-center h-10 px-1 gap-1 z-30 shrink-0 select-none overflow-hidden">
      <div className="flex items-center gap-0.5 border-r border-zinc-800 pr-1 shrink-0">
        {onSave && (
          <button
            onClick={onSave}
            title="Save File"
            className={`p-1.5 rounded text-xs font-mono transition-colors flex items-center justify-center ${
              isDirty
                ? "bg-zinc-800 text-amber-300 font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Save className="w-4 h-4" />
          </button>
        )}

        {onIndent && (
          <button
            onClick={onIndent}
            title="Indent (Tab)"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Indent className="w-4 h-4" />
          </button>
        )}

        {onOutdent && (
          <button
            onClick={onOutdent}
            title="Outdent (Shift+Tab)"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Outdent className="w-4 h-4" />
          </button>
        )}

        {onUndo && (
          <button
            onClick={onUndo}
            title="Undo"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
        )}

        {onRedo && (
          <button
            onClick={onRedo}
            title="Redo"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        )}

        {onOpenQuickLauncher && (
          <button
            onClick={onOpenQuickLauncher}
            title="Search and Open File"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
        {symbols.map((sym) => (
          <button
            key={sym}
            onClick={() => onInsertSymbol(sym)}
            className="h-8 min-w-[32px] px-2 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 font-mono text-xs flex items-center justify-center shrink-0 active:bg-zinc-600 transition-colors"
          >
            {sym}
          </button>
        ))}
      </div>
    </div>
  );
};

