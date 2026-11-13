"use client";

import React, { useState } from "react";
import { Send, Copy, Check, Plus, Trash2, Clock, Zap } from "lucide-react";
import {
  HttpMethod,
  ApiAuthType,
  ApiRequestBodyType,
  ApiKeyValue,
  ApiClientResponse,
} from "@remote-ide/shared";

export interface ApiClientPanelProps {
  gatewayUrl?: string;
}

export const ApiClientPanel: React.FC<ApiClientPanelProps> = ({ gatewayUrl = "" }) => {
  // Request Config
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("http://localhost:3000/api/v1/health");
  const [activeTab, setActiveTab] = useState<"params" | "headers" | "auth" | "body" | "env">(
    "params"
  );
  const [params, setParams] = useState<ApiKeyValue[]>([{ key: "", value: "", enabled: true }]);
  const [headers, setHeaders] = useState<ApiKeyValue[]>([
    { key: "Accept", value: "application/json", enabled: true },
  ]);
  const [authType, setAuthType] = useState<ApiAuthType>("none");
  const [authToken, setAuthToken] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [bodyType, setBodyType] = useState<ApiRequestBodyType>("json");
  const [bodyRaw, setBodyRaw] = useState('{\n  "query": "test"\n}');
  const [envVars, setEnvVars] = useState<Record<string, string>>({
    baseUrl: "http://localhost:3000",
  });

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ApiClientResponse | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const [bodyCopied, setBodyCopied] = useState(false);

  // WebSocket Tester Tab state
  const [isWsMode, setIsWsMode] = useState(false);
  const [wsUrl, setWsUrl] = useState("ws://localhost:4000/api/v1/tunnel/agent");
  const [wsMessage, setWsMessage] = useState('{"type":"ping"}');
  const [wsLogs, setWsLogs] = useState<
    Array<{ time: string; type: "sent" | "received" | "status"; text: string }>
  >([]);
  const [activeWs, setActiveWs] = useState<WebSocket | null>(null);

  const handleSend = async () => {
    setIsLoading(true);
    setResponse(null);
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/api-client/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          method,
          url,
          params: params.filter((p) => p.key.trim().length > 0),
          headers: headers.filter((h) => h.key.trim().length > 0),
          authType,
          authToken: authType === "bearer" ? authToken : undefined,
          authUsername: authType === "basic" ? authUsername : undefined,
          authPassword: authType === "basic" ? authPassword : undefined,
          bodyType,
          bodyRaw: bodyType !== "none" ? bodyRaw : undefined,
          variables: envVars,
          timeoutMs: 30000,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setResponse(data.data);
      } else {
        setResponse({
          status: res.status || 500,
          statusText: data.error?.message || "Request Error",
          headers: {},
          body: JSON.stringify(data, null, 2),
          durationMs: 0,
          sizeBytes: 0,
          isJson: true,
          curlCommand: `curl -X ${method} "${url}"`,
        });
      }
    } catch (err: unknown) {
      setResponse({
        status: 0,
        statusText: "Network Error",
        headers: {},
        body: err instanceof Error ? err.message : "Failed to execute request",
        durationMs: 0,
        sizeBytes: 0,
        isJson: false,
        curlCommand: `curl -X ${method} "${url}"`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCurl = () => {
    if (!response?.curlCommand) return;
    navigator.clipboard.writeText(response.curlCommand);
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2000);
  };

  const handleCopyBody = () => {
    if (!response?.body) return;
    navigator.clipboard.writeText(response.body);
    setBodyCopied(true);
    setTimeout(() => setBodyCopied(false), 2000);
  };

  // WebSocket Tester Handlers
  const handleConnectWs = () => {
    if (activeWs) {
      activeWs.close();
      setActiveWs(null);
      setWsLogs((prev) => [
        ...prev,
        { time: new Date().toLocaleTimeString(), type: "status", text: "Disconnected" },
      ]);
      return;
    }

    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setActiveWs(ws);
        setWsLogs((prev) => [
          ...prev,
          { time: new Date().toLocaleTimeString(), type: "status", text: "Connected to " + wsUrl },
        ]);
      };
      ws.onmessage = (e) => {
        setWsLogs((prev) => [
          ...prev,
          { time: new Date().toLocaleTimeString(), type: "received", text: String(e.data) },
        ]);
      };
      ws.onerror = () => {
        setWsLogs((prev) => [
          ...prev,
          { time: new Date().toLocaleTimeString(), type: "status", text: "WebSocket Error" },
        ]);
      };
      ws.onclose = () => {
        setActiveWs(null);
        setWsLogs((prev) => [
          ...prev,
          { time: new Date().toLocaleTimeString(), type: "status", text: "Connection Closed" },
        ]);
      };
    } catch (err) {
      setWsLogs((prev) => [
        ...prev,
        { time: new Date().toLocaleTimeString(), type: "status", text: "Failed to open socket" },
      ]);
    }
  };

  const handleSendWsMessage = () => {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    activeWs.send(wsMessage);
    setWsLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), type: "sent", text: wsMessage },
    ]);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#141417] text-zinc-300 text-xs select-none overflow-hidden">
      {/* Top Header Mode Toggle */}
      <div className="px-3 py-2 border-b border-ide-border bg-zinc-900/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsWsMode(false)}
            className={`font-semibold flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
              !isWsMode ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Send className="w-3.5 h-3.5" /> HTTP REST Client
          </button>
          <button
            onClick={() => setIsWsMode(true)}
            className={`font-semibold flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
              isWsMode ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> WebSocket Tester
          </button>
        </div>

        {response?.curlCommand && !isWsMode && (
          <button
            onClick={handleCopyCurl}
            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            {curlCopied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            Copy cURL
          </button>
        )}
      </div>

      {!isWsMode ? (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Request Composer Pane */}
          <div className="w-full md:w-1/2 flex flex-col border-r border-ide-border bg-zinc-900/30 overflow-hidden">
            {/* URL & Method Bar */}
            <div className="p-3 border-b border-ide-border flex items-center gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as HttpMethod)}
                className={`font-bold px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs focus:outline-none ${
                  method === "GET"
                    ? "text-emerald-400"
                    : method === "POST"
                      ? "text-indigo-400"
                      : method === "PUT"
                        ? "text-amber-400"
                        : method === "DELETE"
                          ? "text-rose-400"
                          : "text-zinc-200"
                }`}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
                <option value="HEAD">HEAD</option>
                <option value="OPTIONS">OPTIONS</option>
              </select>

              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                placeholder="http://localhost:3000/api/..."
                className="flex-1 bg-zinc-800/90 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
              />

              <button
                onClick={handleSend}
                disabled={isLoading}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded flex items-center gap-1.5 transition-colors"
              >
                <Send className={`w-3.5 h-3.5 ${isLoading ? "animate-pulse" : ""}`} />
                Send
              </button>
            </div>

            {/* Request Configuration Tabs */}
            <div className="flex border-b border-ide-border px-3 bg-zinc-900/60 text-xs">
              {(["params", "headers", "auth", "body", "env"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-2 px-3 font-medium capitalize border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-indigo-500 text-white"
                      : "border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tab === "env" ? "Environment" : tab}
                </button>
              ))}
            </div>

            {/* Request Tab Contents */}
            <div className="flex-1 overflow-auto p-3">
              {activeTab === "params" && (
                <div className="flex flex-col gap-2">
                  {params.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => {
                          const next = [...params];
                          next[idx]!.enabled = e.target.checked;
                          setParams(next);
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Key"
                        value={p.key}
                        onChange={(e) => {
                          const next = [...params];
                          next[idx]!.key = e.target.value;
                          setParams(next);
                        }}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={p.value}
                        onChange={(e) => {
                          const next = [...params];
                          next[idx]!.value = e.target.value;
                          setParams(next);
                        }}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                      />
                      <button
                        onClick={() => setParams(params.filter((_, i) => i !== idx))}
                        className="p-1 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setParams([...params, { key: "", value: "", enabled: true }])}
                    className="self-start text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-1"
                  >
                    <Plus className="w-3 h-3" /> Add Parameter
                  </button>
                </div>
              )}

              {activeTab === "headers" && (
                <div className="flex flex-col gap-2">
                  {headers.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={h.enabled}
                        onChange={(e) => {
                          const next = [...headers];
                          next[idx]!.enabled = e.target.checked;
                          setHeaders(next);
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Header"
                        value={h.key}
                        onChange={(e) => {
                          const next = [...headers];
                          next[idx]!.key = e.target.value;
                          setHeaders(next);
                        }}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={h.value}
                        onChange={(e) => {
                          const next = [...headers];
                          next[idx]!.value = e.target.value;
                          setHeaders(next);
                        }}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                      />
                      <button
                        onClick={() => setHeaders(headers.filter((_, i) => i !== idx))}
                        className="p-1 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setHeaders([...headers, { key: "", value: "", enabled: true }])}
                    className="self-start text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-1"
                  >
                    <Plus className="w-3 h-3" /> Add Header
                  </button>
                </div>
              )}

              {activeTab === "auth" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      Authorization Type
                    </label>
                    <select
                      value={authType}
                      onChange={(e) => setAuthType(e.target.value as ApiAuthType)}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="none">No Auth</option>
                      <option value="bearer">Bearer Token</option>
                      <option value="basic">Basic Auth</option>
                    </select>
                  </div>

                  {authType === "bearer" && (
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Token</label>
                      <input
                        type="password"
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                        placeholder="Bearer Token"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                  )}

                  {authType === "basic" && (
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">Username</label>
                        <input
                          type="text"
                          value={authUsername}
                          onChange={(e) => setAuthUsername(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">Password</label>
                        <input
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "body" && (
                <div className="flex flex-col h-full gap-2">
                  <div className="flex items-center gap-3 text-xs">
                    {(["none", "json", "text", "x-www-form-urlencoded"] as const).map((type) => (
                      <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="bodyType"
                          value={type}
                          checked={bodyType === type}
                          onChange={() => setBodyType(type)}
                        />
                        <span className="capitalize">{type}</span>
                      </label>
                    ))}
                  </div>

                  {bodyType !== "none" && (
                    <textarea
                      rows={10}
                      value={bodyRaw}
                      onChange={(e) => setBodyRaw(e.target.value)}
                      className="w-full flex-1 bg-[#101014] border border-zinc-800 rounded p-2.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>
              )}

              {activeTab === "env" && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-zinc-400 mb-2">
                    Variables can be referenced as{" "}
                    <code className="text-indigo-300">{"{{variableName}}"}</code> in URL, headers,
                    or body.
                  </p>
                  {Object.entries(envVars).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-28 font-mono text-indigo-400 truncate">{key}</span>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setEnvVars({ ...envVars, [key]: e.target.value })}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Response Viewer Pane */}
          <div className="flex-1 flex flex-col bg-[#101014] overflow-hidden">
            {response ? (
              <>
                {/* Response Status Bar */}
                <div className="px-4 py-2.5 border-b border-ide-border bg-zinc-900/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        response.status >= 200 && response.status < 300
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                          : response.status >= 400
                            ? "bg-rose-950 text-rose-400 border border-rose-800/60"
                            : "bg-amber-950 text-amber-400 border border-amber-800/60"
                      }`}
                    >
                      {response.status} {response.statusText}
                    </span>
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {response.durationMs}ms
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {(response.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  <button
                    onClick={handleCopyBody}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    title="Copy Response Body"
                  >
                    {bodyCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Response Body Output */}
                <div className="flex-1 overflow-auto p-4 font-mono text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap select-text">
                  {response.body}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 gap-2">
                <Send className="w-8 h-8 opacity-20" />
                <span className="italic">Enter an endpoint URL and hit Send to test your API.</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* WebSocket Tester Mode */
        <div className="flex-1 flex flex-col p-4 gap-3 bg-[#0f0f13] overflow-hidden">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="ws://localhost:..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 font-mono text-xs text-white"
            />
            <button
              onClick={handleConnectWs}
              className={`px-4 py-1.5 font-medium rounded text-xs text-white ${
                activeWs ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {activeWs ? "Disconnect" : "Connect"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={wsMessage}
              onChange={(e) => setWsMessage(e.target.value)}
              placeholder="Message payload to send"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 font-mono text-xs text-white"
            />
            <button
              onClick={handleSendWsMessage}
              disabled={!activeWs}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-medium rounded text-xs text-white flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Send Frame
            </button>
          </div>

          <div className="flex-1 rounded-lg border border-zinc-800 bg-[#0a0a0d] p-3 overflow-auto font-mono text-xs flex flex-col gap-1">
            {wsLogs.map((log, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 ${
                  log.type === "sent"
                    ? "text-indigo-400"
                    : log.type === "received"
                      ? "text-emerald-400"
                      : "text-zinc-500 italic"
                }`}
              >
                <span className="text-[10px] text-zinc-600 shrink-0">{log.time}</span>
                <span className="font-bold shrink-0">{log.type.toUpperCase()}:</span>
                <span className="whitespace-pre-wrap">{log.text}</span>
              </div>
            ))}
            {wsLogs.length === 0 && (
              <div className="text-zinc-600 italic">No WebSocket messages recorded yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
