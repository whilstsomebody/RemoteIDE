"use client";

import React, { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Sparkles, Minimize2, Copy, Check } from "lucide-react";
import { Button, Badge } from "@remote-ide/ui";

export interface JsonViewerProps {
  content: string;
  onFormat?: (formattedContent: string) => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ content, onFormat }) => {
  const [copied, setCopied] = useState(false);

  const validation = useMemo(() => {
    if (!content.trim()) {
      return { isValid: true, message: "Empty JSON document", parsed: null };
    }
    try {
      const parsed = JSON.parse(content);
      const isArr = Array.isArray(parsed);
      const count = isArr ? parsed.length : Object.keys(parsed || {}).length;
      return {
        isValid: true,
        message: isArr ? `Valid JSON Array (${count} items)` : `Valid JSON Object (${count} keys)`,
        parsed,
      };
    } catch (err: unknown) {
      const msg = (err as Error).message || "Invalid JSON syntax";
      return {
        isValid: false,
        message: msg,
        parsed: null,
      };
    }
  }, [content]);

  const handleFormat = () => {
    if (!validation.isValid || !validation.parsed || !onFormat) return;
    try {
      const formatted = JSON.stringify(validation.parsed, null, 2);
      onFormat(formatted);
    } catch {
      // Ignore
    }
  };

  const handleMinify = () => {
    if (!validation.isValid || !validation.parsed || !onFormat) return;
    try {
      const minified = JSON.stringify(validation.parsed);
      onFormat(minified);
    } catch {
      // Ignore
    }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs">
      <div className="flex items-center gap-2">
        {validation.isValid ? (
          <Badge
            variant="default"
            className="bg-emerald-950/80 text-emerald-400 border-emerald-800/60 gap-1.5 text-[11px]"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{validation.message}</span>
          </Badge>
        ) : (
          <Badge
            variant="danger"
            className="bg-rose-950/80 text-rose-300 border-rose-800/60 gap-1.5 text-[11px]"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="truncate max-w-sm" title={validation.message}>
              {validation.message}
            </span>
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {validation.isValid && onFormat && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFormat}
              className="h-7 text-xs gap-1 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              title="Prettify JSON with 2-space indentation"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Format</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMinify}
              className="h-7 text-xs gap-1 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              title="Compact JSON into single line"
            >
              <Minimize2 className="w-3 h-3 text-zinc-400" />
              <span>Minify</span>
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="h-7 text-xs gap-1 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          title="Copy content"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
    </div>
  );
};
