"use client";

import React, { useMemo } from "react";
import { Copy, Check, FileText } from "lucide-react";

export interface MarkdownViewerProps {
  content: string;
}

interface ParsedBlock {
  type: "heading" | "code" | "paragraph" | "list" | "table" | "hr" | "blockquote";
  level?: number;
  text?: string;
  lang?: string;
  items?: { text: string; checked?: boolean }[];
  ordered?: boolean;
  rows?: string[][];
  headers?: string[];
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content }) => {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 bg-zinc-950 text-zinc-200 font-sans leading-relaxed selection:bg-indigo-600/30">
      <div className="max-w-4xl mx-auto space-y-4">
        {blocks.length === 0 ? (
          <div className="text-zinc-500 italic flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>Empty document</span>
          </div>
        ) : (
          blocks.map((block, idx) => <RenderBlock key={idx} block={block} />)
        )}
      </div>
    </div>
  );
};

const RenderBlock: React.FC<{ block: ParsedBlock }> = ({ block }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  switch (block.type) {
    case "heading": {
      const text = renderInline(block.text || "");
      if (block.level === 1) {
        return (
          <h1 className="text-2xl font-bold text-zinc-100 border-b border-zinc-800 pb-2 mt-6 mb-3">
            {text}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2 className="text-xl font-semibold text-zinc-100 border-b border-zinc-800/60 pb-1 mt-5 mb-2">
            {text}
          </h2>
        );
      }
      if (block.level === 3) {
        return <h3 className="text-lg font-medium text-zinc-200 mt-4 mb-2">{text}</h3>;
      }
      return <h4 className="text-base font-medium text-zinc-300 mt-3 mb-1">{text}</h4>;
    }

    case "paragraph":
      return <p className="text-sm text-zinc-300 leading-6">{renderInline(block.text || "")}</p>;

    case "blockquote":
      return (
        <blockquote className="border-l-4 border-indigo-500 bg-zinc-900/50 px-4 py-2 text-sm text-zinc-400 italic rounded-r">
          {renderInline(block.text || "")}
        </blockquote>
      );

    case "code":
      return (
        <div className="relative group rounded-md overflow-hidden bg-zinc-900 border border-zinc-800 my-3">
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-950 border-b border-zinc-800 text-xs font-mono text-zinc-400">
            <span>{block.lang || "code"}</span>
            <button
              onClick={() => handleCopy(block.text || "")}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Copy code"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <pre className="p-3 text-xs font-mono text-zinc-200 overflow-x-auto leading-5">
            <code>{block.text}</code>
          </pre>
        </div>
      );

    case "list":
      if (block.ordered) {
        return (
          <ol className="list-decimal list-inside space-y-1 text-sm text-zinc-300 pl-2">
            {block.items?.map((item, i) => (
              <li key={i}>{renderInline(item.text)}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="space-y-1 text-sm text-zinc-300 pl-2">
          {block.items?.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              {item.checked !== undefined ? (
                <input
                  type="checkbox"
                  checked={item.checked}
                  readOnly
                  className="mt-1 h-3.5 w-3.5 rounded bg-zinc-800 border-zinc-700 text-indigo-500"
                />
              ) : (
                <span className="text-indigo-400 select-none">•</span>
              )}
              <span>{renderInline(item.text)}</span>
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <div className="overflow-x-auto my-3 border border-zinc-800 rounded">
          <table className="w-full text-left text-xs border-collapse">
            {block.headers && block.headers.length > 0 && (
              <thead className="bg-zinc-900 text-zinc-200 border-b border-zinc-800">
                <tr>
                  {block.headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 font-semibold">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-zinc-800/60 bg-zinc-950 text-zinc-300">
              {block.rows?.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-zinc-900/30">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "hr":
      return <hr className="border-t border-zinc-800 my-6" />;

    default:
      return null;
  }
};

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|~~[^~]+~~)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }

    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 bg-zinc-800 text-amber-300 rounded text-xs font-mono"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-bold text-zinc-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={match.index} className="italic text-zinc-200">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      parts.push(
        <del key={match.index} className="line-through text-zinc-400">
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith("[") && token.includes("](")) {
      const endLabel = token.indexOf("]");
      const label = token.slice(1, endLabel);
      const url = token.slice(endLabel + 2, -1);
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 underline hover:text-indigo-300"
        >
          {label}
        </a>
      );
    }

    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
}

export function parseMarkdown(content: string): ParsedBlock[] {
  const lines = content.split("\n");
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;

    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const cur = lines[i];
        if (cur === undefined || cur.trim().startsWith("```")) break;
        codeLines.push(cur);
        i++;
      }
      blocks.push({ type: "code", lang, text: codeLines.join("\n") });
      i++;
      continue;
    }

    if (line.startsWith("#")) {
      const match = /^(#{1,6})\s+(.*)$/.exec(line);
      if (match && match[1] && match[2]) {
        blocks.push({
          type: "heading",
          level: match[1].length,
          text: match[2].trim(),
        });
        i++;
        continue;
      }
    }

    if (line.startsWith(">")) {
      blocks.push({
        type: "blockquote",
        text: line.replace(/^>\s?/, "").trim(),
      });
      i++;
      continue;
    }

    if (/^(---|___|\*\*\*)$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const nextLine = lines[i + 1];
    if (line.includes("|") && nextLine && /^\s*\|?[-:| ]+\|?\s*$/.test(nextLine)) {
      const parseCells = (row: string) =>
        row
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      const headers = parseCells(line);
      i += 2; // skip header and delimiter
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i];
        if (!rowLine || !rowLine.includes("|")) break;
        rows.push(parseCells(rowLine));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: { text: string; checked?: boolean }[] = [];
      while (i < lines.length) {
        const itemRaw = lines[i];
        if (!itemRaw || !/^\s*[-*]\s+/.test(itemRaw)) break;
        const itemLine = itemRaw.trim().replace(/^[-*]\s+/, "");
        const taskMatch = /^\[([ xX])\]\s+(.*)$/.exec(itemLine);
        if (taskMatch && taskMatch[1] && taskMatch[2]) {
          items.push({
            checked: taskMatch[1].toLowerCase() === "x",
            text: taskMatch[2],
          });
        } else {
          items.push({ text: itemLine });
        }
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: { text: string }[] = [];
      while (i < lines.length) {
        const itemRaw = lines[i];
        if (!itemRaw || !/^\s*\d+\.\s+/.test(itemRaw)) break;
        const itemLine = itemRaw.trim().replace(/^\d+\.\s+/, "");
        items.push({ text: itemLine });
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const nextP = lines[i];
      if (
        !nextP ||
        !nextP.trim() ||
        nextP.startsWith("#") ||
        nextP.startsWith(">") ||
        nextP.trim().startsWith("```") ||
        /^\s*[-*]\s+/.test(nextP) ||
        /^\s*\d+\.\s+/.test(nextP)
      ) {
        break;
      }
      paraLines.push(nextP);
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return blocks;
}
