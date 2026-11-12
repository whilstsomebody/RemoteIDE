"use client";

import React, { useState, useMemo } from "react";
import { Search, Table as TableIcon, Download, Copy, Check } from "lucide-react";
import { Input, Button, Badge } from "@remote-ide/ui";

export interface CsvViewerProps {
  content: string;
  path: string;
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  if (!text.trim()) return { headers: [], rows: [] };

  const delimiter = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++; // handle CRLF
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0] ?? [];
  const rows = lines.slice(1);
  return { headers, rows };
}

export const CsvViewer: React.FC<CsvViewerProps> = ({ content, path }) => {
  const [filterQuery, setFilterQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const { headers, rows } = useMemo(() => parseCsv(content), [content]);

  const filteredRows = useMemo(() => {
    if (!filterQuery.trim()) return rows;
    const q = filterQuery.toLowerCase();
    return rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
  }, [rows, filterQuery]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filename = path.split("/").pop() || "data.csv";

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* CSV Toolbar */}
      <div className="h-10 px-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-3">
          <Badge
            variant="default"
            className="gap-1.5 text-[11px] bg-zinc-800 text-zinc-300 border-zinc-700"
          >
            <TableIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              {rows.length} rows • {headers.length} columns
            </span>
          </Badge>

          <div className="relative w-52">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Filter table rows..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="h-7 pl-8 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 text-xs gap-1 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(content)}`}
            download={filename}
            className="h-7 px-2.5 inline-flex items-center gap-1 text-xs border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>Export</span>
          </a>
        </div>
      </div>

      {/* CSV Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-zinc-900/90 sticky top-0 z-10 border-b border-zinc-800">
            <tr>
              <th className="w-12 px-3 py-2 text-zinc-500 font-mono text-[11px] border-r border-zinc-800 text-center select-none">
                #
              </th>
              {headers.map((h, idx) => (
                <th
                  key={idx}
                  className="px-3 py-2 font-semibold text-zinc-200 border-r border-zinc-800/80 truncate"
                >
                  {h || `Column ${idx + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={headers.length + 1} className="px-4 py-8 text-center text-zinc-500">
                  {filterQuery ? "No matching rows found" : "Empty table"}
                </td>
              </tr>
            ) : (
              filteredRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-zinc-900/50 transition-colors">
                  <td className="px-3 py-1.5 text-zinc-600 border-r border-zinc-800 text-center select-none">
                    {rIdx + 1}
                  </td>
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-3 py-1.5 text-zinc-300 border-r border-zinc-800/60 truncate max-w-xs"
                    >
                      {row[cIdx] ?? ""}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
