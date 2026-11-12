"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Search, FileText, CaseSensitive, Regex, Loader2 } from "lucide-react";
import { Input, Button } from "@remote-ide/ui";
import { SearchFilesResponse, SearchResultItem } from "@remote-ide/shared";

export interface SearchPanelProps {
  workspaceId: string | null;
  agentUrl: string;
  onOpenFile: (path: string, line?: number) => void;
}

interface GroupedFileResults {
  path: string;
  items: SearchResultItem[];
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ workspaceId, agentUrl, onOpenFile }) => {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"content" | "filename">("content");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchFilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!workspaceId || !query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        query: query.trim(),
        type: searchType,
        caseSensitive: caseSensitive ? "true" : "false",
        isRegex: isRegex ? "true" : "false",
        maxResults: "100",
      });

      const res = await fetch(
        `${agentUrl}/api/v1/workspaces/${workspaceId}/files/search?${params}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || "Search failed");
      }

      const body = await res.json();
      setResults(body.data as SearchFilesResponse);
    } catch (err: unknown) {
      setError((err as Error).message || "Search failed");
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [workspaceId, query, searchType, caseSensitive, isRegex, agentUrl]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      void handleSearch();
    }
  };

  const groupedResults = useMemo<GroupedFileResults[]>(() => {
    if (!results || !results.results) return [];
    const map = new Map<string, SearchResultItem[]>();

    for (const item of results.results) {
      const existing = map.get(item.path) || [];
      existing.push(item);
      map.set(item.path, existing);
    }

    const grouped: GroupedFileResults[] = [];
    map.forEach((items, path) => {
      grouped.push({ path, items });
    });
    return grouped;
  }, [results]);

  return (
    <div className="flex flex-col h-full text-xs select-none">
      {/* Search Header Controls */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="relative flex items-center">
          <Input
            type="text"
            placeholder={
              searchType === "content" ? "Search text across workspace..." : "Search file names..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 pl-3 pr-16 text-xs bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
          />
          <div className="absolute right-1 flex items-center gap-0.5">
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={`p-1 rounded text-[10px] transition-colors ${
                caseSensitive
                  ? "bg-indigo-600/30 text-indigo-300"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Match Case (Aa)"
            >
              <CaseSensitive className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsRegex(!isRegex)}
              className={`p-1 rounded text-[10px] transition-colors ${
                isRegex ? "bg-indigo-600/30 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Use Regular Expression (.*)"
            >
              <Regex className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search Mode Toggles & Action */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded border border-zinc-800">
            <button
              onClick={() => setSearchType("content")}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                searchType === "content"
                  ? "bg-zinc-800 text-zinc-200 font-medium"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Content
            </button>
            <button
              onClick={() => setSearchType("filename")}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                searchType === "filename"
                  ? "bg-zinc-800 text-zinc-200 font-medium"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Files
            </button>
          </div>

          <Button
            size="sm"
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
            className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1 px-3"
          >
            {isSearching ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Search className="w-3 h-3" />
            )}
            <span>Search</span>
          </Button>
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 font-mono">
        {error && (
          <div className="p-3 text-xs text-rose-400 bg-rose-950/20 border border-rose-900/40 rounded">
            {error}
          </div>
        )}

        {results && (
          <div className="px-2 py-1 text-[11px] text-zinc-400 border-b border-zinc-800 flex items-center justify-between font-sans">
            <span>
              {results.totalMatches} results in {groupedResults.length} files
            </span>
          </div>
        )}

        {results && results.totalMatches === 0 && (
          <div className="text-zinc-500 text-center py-8 text-xs font-sans">
            No matches found for &quot;{query}&quot;
          </div>
        )}

        {groupedResults.map((group) => (
          <div key={group.path} className="space-y-1">
            {/* File Header */}
            <div
              onClick={() => onOpenFile(group.path)}
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-800/60 cursor-pointer text-zinc-200 font-medium text-[11px] group"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">{group.path}</span>
              <span className="text-zinc-500 text-[10px] ml-auto">{group.items.length}</span>
            </div>

            {/* Line Snippets */}
            <div className="pl-4 space-y-0.5 border-l border-zinc-800 ml-3">
              {group.items.map((m, mIdx) => (
                <div
                  key={mIdx}
                  onClick={() => onOpenFile(group.path, m.line)}
                  className="flex items-start gap-2 px-2 py-0.5 rounded hover:bg-zinc-800 cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  {m.line !== undefined && (
                    <span className="text-zinc-600 select-none text-[10px] w-6 shrink-0 text-right">
                      {m.line}:
                    </span>
                  )}
                  <span className="truncate">{m.preview || m.match}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
