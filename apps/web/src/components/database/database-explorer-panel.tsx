"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Database, Table as TableIcon, Play, Plus, Key, Layers, Code } from "lucide-react";
import { cn } from "@remote-ide/ui";
import {
  DatabaseProfile,
  TableMetadata,
  TableDataResult,
  SqlQueryResult,
} from "@remote-ide/shared";

export interface DatabaseExplorerPanelProps {
  agentUrl: string;
}

export const DatabaseExplorerPanel: React.FC<DatabaseExplorerPanelProps> = ({ agentUrl }) => {
  const [profiles, setProfiles] = useState<DatabaseProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [tables, setTables] = useState<TableMetadata[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableDataResult | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [activeTab, setActiveTab] = useState<"schema" | "browser" | "sql">("schema");

  // SQL Runner state
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM users LIMIT 10;");
  const [queryResult, setQueryResult] = useState<SqlQueryResult | null>(null);
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    version?: string;
  } | null>(null);

  // New Profile modal
  const [newProfileModal, setNewProfileModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"sqlite" | "postgres" | "mysql">("sqlite");
  const [newDatabase, setNewDatabase] = useState(":memory:");

  // Fetch Profiles
  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch(`${agentUrl}/api/v1/database/profiles`);
      if (res.ok) {
        const body = await res.json();
        const list: DatabaseProfile[] = body.data || [];
        setProfiles(list);
        if (list.length > 0 && !selectedProfileId) {
          const defaultProf = list.find((p) => p.isDefault) || list[0]!;
          setSelectedProfileId(defaultProf.id);
        }
      }
    } catch {
      // Offline
    }
  }, [agentUrl, selectedProfileId]);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  // Fetch Tables when Profile changes
  const fetchTables = useCallback(async () => {
    if (!selectedProfileId) return;
    try {
      const res = await fetch(`${agentUrl}/api/v1/database/profiles/${selectedProfileId}/tables`);
      if (res.ok) {
        const body = await res.json();
        setTables(body.data || []);
      }
    } catch {
      setTables([]);
    }
  }, [agentUrl, selectedProfileId]);

  useEffect(() => {
    void fetchTables();
  }, [fetchTables]);

  // Fetch Table Data
  const fetchTableData = useCallback(
    async (tableName: string, page = 1) => {
      if (!selectedProfileId) return;
      try {
        const res = await fetch(
          `${agentUrl}/api/v1/database/profiles/${selectedProfileId}/tables/${encodeURIComponent(
            tableName
          )}/data?page=${page}&pageSize=25`
        );
        if (res.ok) {
          const body = await res.json();
          setTableData(body.data);
          setTablePage(page);
        }
      } catch {
        setTableData(null);
      }
    },
    [agentUrl, selectedProfileId]
  );

  const handleSelectTable = (name: string) => {
    setSelectedTable(name);
    setActiveTab("browser");
    void fetchTableData(name, 1);
  };

  const handleTestConnection = async () => {
    if (!selectedProfileId) return;
    try {
      const res = await fetch(`${agentUrl}/api/v1/database/profiles/${selectedProfileId}/test`, {
        method: "POST",
      });
      if (res.ok) {
        const body = await res.json();
        setTestResult(body.data);
      }
    } catch (err) {
      setTestResult({ success: false, latencyMs: 0, version: (err as Error).message });
    }
  };

  const handleRunQuery = async () => {
    if (!selectedProfileId || !sqlQuery.trim()) return;
    setIsExecutingSql(true);
    try {
      const res = await fetch(`${agentUrl}/api/v1/database/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: selectedProfileId,
          query: sqlQuery,
          maxRows: 100,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setQueryResult(body.data);
      } else {
        setQueryResult({
          query: sqlQuery,
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: 0,
          error: body.error?.message || "Query failed",
        });
      }
    } catch (err) {
      setQueryResult({
        query: sqlQuery,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        error: (err as Error).message,
      });
    } finally {
      setIsExecutingSql(false);
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newDatabase) return;
    try {
      await fetch(`${agentUrl}/api/v1/database/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          type: newType,
          database: newDatabase,
        }),
      });
      setNewProfileModal(false);
      setNewName("");
      setNewDatabase(":memory:");
      await fetchProfiles();
    } catch {
      // Error
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b] text-zinc-300 font-sans text-xs select-none">
      {/* Header Toolbar */}
      <div className="p-3 border-b border-zinc-800 bg-[#121214] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-white">Database Explorer</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedProfileId}
            onChange={(e) => {
              setSelectedProfileId(e.target.value);
              setSelectedTable(null);
              setTableData(null);
              setTestResult(null);
            }}
            className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-white"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type})
              </option>
            ))}
          </select>

          <button
            onClick={() => void handleTestConnection()}
            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[11px] text-zinc-200 transition-colors"
          >
            Test Connection
          </button>

          <button
            onClick={() => setNewProfileModal(true)}
            className="p-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white"
            title="Add Database Profile"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Test Connection Banner */}
      {testResult && (
        <div
          className={cn(
            "px-3 py-1.5 border-b text-[11px] flex items-center justify-between",
            testResult.success
              ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-300"
              : "bg-rose-950/40 border-rose-800/80 text-rose-300"
          )}
        >
          <span>
            {testResult.success
              ? `Connected: ${testResult.version || "OK"}`
              : `Failed: ${testResult.version || "Error"}`}
          </span>
          <span className="text-[10px] text-zinc-400">{testResult.latencyMs}ms</span>
        </div>
      )}

      {/* Mode Subtabs */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-950 px-2 gap-1 shrink-0">
        <button
          onClick={() => setActiveTab("schema")}
          className={cn(
            "px-3 py-1.5 border-b-2 text-[11px] font-medium flex items-center gap-1.5 transition-colors",
            activeTab === "schema"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          )}
        >
          <Layers className="w-3 h-3" />
          <span>Tables ({tables.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("browser")}
          disabled={!selectedTable}
          className={cn(
            "px-3 py-1.5 border-b-2 text-[11px] font-medium flex items-center gap-1.5 transition-colors",
            activeTab === "browser"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200",
            !selectedTable && "opacity-50 cursor-not-allowed"
          )}
        >
          <TableIcon className="w-3 h-3" />
          <span>Table Data {selectedTable ? `(${selectedTable})` : ""}</span>
        </button>

        <button
          onClick={() => setActiveTab("sql")}
          className={cn(
            "px-3 py-1.5 border-b-2 text-[11px] font-medium flex items-center gap-1.5 transition-colors",
            activeTab === "sql"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          )}
        >
          <Code className="w-3 h-3" />
          <span>Read-Only SQL Console</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden">
        {/* 1. Schema & Tables Tab */}
        {activeTab === "schema" && (
          <div className="h-full overflow-y-auto p-3 space-y-2">
            {tables.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 italic">No tables or views found.</div>
            ) : (
              tables.map((tbl) => (
                <div
                  key={tbl.name}
                  className="p-2.5 rounded bg-[#121214] border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
                  onClick={() => handleSelectTable(tbl.name)}
                >
                  <div className="flex items-center justify-between pb-1.5">
                    <div className="flex items-center gap-2">
                      <TableIcon className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-semibold text-white">{tbl.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase">{tbl.type}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">~{tbl.rowCountEstimate} rows</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-800/80">
                    {tbl.columns.map((c) => (
                      <span
                        key={c.name}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1",
                          c.isPrimaryKey
                            ? "bg-amber-950/40 border border-amber-800/80 text-amber-300"
                            : "bg-zinc-800/70 text-zinc-400"
                        )}
                      >
                        {c.isPrimaryKey && <Key className="w-2.5 h-2.5" />}
                        <span>{c.name}</span>
                        <span className="text-zinc-500">({c.type})</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 2. Table Data Browser Tab */}
        {activeTab === "browser" && (
          <div className="h-full flex flex-col">
            {tableData ? (
              <>
                <div className="p-2 border-b border-zinc-800 bg-[#121214] flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">
                    Viewing <span className="text-white font-semibold">{tableData.tableName}</span>{" "}
                    ({tableData.totalRows} total rows)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        void fetchTableData(tableData.tableName, Math.max(1, tablePage - 1))
                      }
                      disabled={tablePage <= 1}
                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span>Page {tablePage}</span>
                    <button
                      onClick={() => void fetchTableData(tableData.tableName, tablePage + 1)}
                      disabled={tableData.rows.length < tableData.pageSize}
                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-[#18181b] sticky top-0 border-b border-zinc-800 z-10">
                      <tr>
                        {tableData.columns.map((col) => (
                          <th
                            key={col}
                            className="p-2 font-semibold text-zinc-300 border-r border-zinc-800/50"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rows.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                        >
                          {tableData.columns.map((col) => (
                            <td
                              key={col}
                              className="p-2 text-zinc-200 border-r border-zinc-800/40 truncate max-w-xs"
                            >
                              {row[col] != null ? (
                                String(row[col])
                              ) : (
                                <span className="text-zinc-600 italic">null</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-zinc-500 italic">
                Select a table to browse records.
              </div>
            )}
          </div>
        )}

        {/* 3. Read-Only SQL Console Tab */}
        {activeTab === "sql" && (
          <div className="h-full flex flex-col p-3 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-300">Read-Only SQL Statement</span>
                <span className="text-zinc-500 text-[10px]">
                  SELECT, EXPLAIN only (Max 100 rows)
                </span>
              </div>
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={3}
                className="w-full p-2 bg-[#121214] border border-zinc-700 rounded text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                placeholder="SELECT * FROM table;"
              />
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-zinc-500">
                  Press Run Query or Cmd+Enter to execute
                </span>
                <button
                  onClick={() => void handleRunQuery()}
                  disabled={isExecutingSql}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs flex items-center gap-1.5 font-medium transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>{isExecutingSql ? "Executing..." : "Run Query"}</span>
                </button>
              </div>
            </div>

            {queryResult && (
              <div className="flex-1 flex flex-col min-h-0 border border-zinc-800 rounded bg-[#121214] overflow-hidden">
                <div className="p-2 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 text-[11px]">
                  <span>
                    Returned <strong className="text-white">{queryResult.rowCount}</strong> rows in{" "}
                    <span className="text-emerald-400 font-mono">
                      {queryResult.executionTimeMs}ms
                    </span>
                  </span>
                </div>

                {queryResult.error ? (
                  <div className="p-3 text-rose-300 bg-rose-950/40 text-xs">
                    {queryResult.error}
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-[#18181b] sticky top-0 border-b border-zinc-800 z-10">
                        <tr>
                          {queryResult.columns.map((col) => (
                            <th
                              key={col}
                              className="p-2 font-semibold text-zinc-300 border-r border-zinc-800/50"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResult.rows.map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                          >
                            {queryResult.columns.map((col) => (
                              <td
                                key={col}
                                className="p-2 text-zinc-200 border-r border-zinc-800/40 truncate max-w-xs"
                              >
                                {row[col] != null ? (
                                  String(row[col])
                                ) : (
                                  <span className="text-zinc-600 italic">null</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Database Profile Modal */}
      {newProfileModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateProfile}
            className="bg-[#121214] border border-zinc-700 rounded-lg p-4 w-full max-w-sm space-y-3"
          >
            <h3 className="font-bold text-white text-sm">Add Database Profile</h3>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-zinc-400">Profile Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Local App SQLite"
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-400">Database Engine</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs"
                >
                  <option value="sqlite">SQLite</option>
                  <option value="postgres">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-400">
                  {newType === "sqlite"
                    ? "Database File Path (:memory: for demo)"
                    : "Database Name"}
                </label>
                <input
                  type="text"
                  value={newDatabase}
                  onChange={(e) => setNewDatabase(e.target.value)}
                  placeholder=":memory:"
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewProfileModal(false)}
                className="px-3 py-1 rounded bg-zinc-800 text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 rounded bg-emerald-600 text-white font-medium"
              >
                Save Profile
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
