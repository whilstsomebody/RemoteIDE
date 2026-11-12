"use client";

import React from "react";
import { Palette, Type, Sliders, Save } from "lucide-react";
import { EditorSettings } from "../../lib/storage/settings-storage";

export interface SettingsPanelProps {
  settings: EditorSettings;
  onUpdateSettings: (newSettings: Partial<EditorSettings>) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdateSettings }) => {
  return (
    <div className="flex flex-col h-full text-xs text-zinc-300 p-4 space-y-6 select-none overflow-y-auto">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Editor Preferences</h3>
        <p className="text-[11px] text-zinc-500">Preferences are stored locally in your browser.</p>
      </div>

      {/* Theme */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-zinc-200 font-medium text-xs">
          <Palette className="w-4 h-4 text-indigo-400" />
          <span>Color Theme</span>
        </label>
        <select
          value={settings.theme}
          onChange={(e) =>
            onUpdateSettings({
              theme: e.target.value as EditorSettings["theme"],
            })
          }
          className="w-full h-8 bg-zinc-950 border border-zinc-800 rounded px-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="remoteide-dark">RemoteIDE Dark (Default)</option>
          <option value="one-dark">One Dark</option>
          <option value="high-contrast">High Contrast Dark</option>
        </select>
      </div>

      {/* Font Size */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-zinc-200 font-medium text-xs">
          <Type className="w-4 h-4 text-indigo-400" />
          <span>Font Size ({settings.fontSize}px)</span>
        </label>
        <div className="grid grid-cols-5 gap-1.5">
          {[12, 13, 14, 16, 18].map((size) => (
            <button
              key={size}
              onClick={() => onUpdateSettings({ fontSize: size })}
              className={`py-1.5 rounded text-xs font-mono border transition-colors ${
                settings.fontSize === size
                  ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 font-semibold"
                  : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {size}px
            </button>
          ))}
        </div>
      </div>

      {/* Tab Size */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-zinc-200 font-medium text-xs">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span>Tab Size & Indentation</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[2, 4].map((size) => (
            <button
              key={size}
              onClick={() => onUpdateSettings({ tabSize: size })}
              className={`py-1.5 rounded text-xs font-mono border transition-colors ${
                settings.tabSize === size
                  ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 font-semibold"
                  : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {size} Spaces
            </button>
          ))}
        </div>
      </div>

      {/* Word Wrap */}
      <div className="flex items-center justify-between py-2 border-t border-zinc-800/80">
        <div>
          <span className="font-medium text-zinc-200">Word Wrap</span>
          <p className="text-[11px] text-zinc-500">Wrap long lines to viewport width</p>
        </div>
        <input
          type="checkbox"
          checked={settings.wordWrap}
          onChange={(e) => onUpdateSettings({ wordWrap: e.target.checked })}
          className="h-4 w-4 rounded bg-zinc-950 border-zinc-700 text-indigo-500 focus:ring-0"
        />
      </div>

      {/* Autosave */}
      <div className="space-y-2 pt-2 border-t border-zinc-800/80">
        <label className="flex items-center gap-2 text-zinc-200 font-medium text-xs">
          <Save className="w-4 h-4 text-indigo-400" />
          <span>Autosave Mode</span>
        </label>
        <select
          value={settings.autosave}
          onChange={(e) =>
            onUpdateSettings({
              autosave: e.target.value as EditorSettings["autosave"],
            })
          }
          className="w-full h-8 bg-zinc-950 border border-zinc-800 rounded px-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="delay">After Delay (2 seconds)</option>
          <option value="focus">On Window Blur / Focus Lost</option>
          <option value="off">Off (Manual Cmd+S only)</option>
        </select>
      </div>
    </div>
  );
};
