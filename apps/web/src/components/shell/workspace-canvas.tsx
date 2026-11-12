"use client";

import React from "react";
import { Terminal, Shield, CheckCircle2, Server, Database, Radio } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@remote-ide/ui";

export interface WorkspaceCanvasProps {
  gatewayUrl?: string;
  agentUrl?: string;
}

export const WorkspaceCanvas: React.FC<WorkspaceCanvasProps> = ({
  gatewayUrl = "http://localhost:4000",
  agentUrl = "http://localhost:4001",
}) => {
  return (
    <main className="flex-1 bg-ide-bg flex flex-col overflow-auto p-6">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            RemoteIDE Foundation (Phase 0)
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Local-first browser development environment architecture initialized.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-zinc-300">Gateway API</CardTitle>
              <Radio className="w-4 h-4 text-indigo-400" />
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="text-lg font-bold text-zinc-100">Fastify REST & WS</div>
              <p className="text-[11px] text-zinc-400 font-mono truncate">{gatewayUrl}/api/v1</p>
              <Badge variant="success" className="text-[10px]">
                Standard Envelopes
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-zinc-300">Host Agent</CardTitle>
              <Server className="w-4 h-4 text-emerald-400" />
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="text-lg font-bold text-zinc-100">Host Authority</div>
              <p className="text-[11px] text-zinc-400 font-mono truncate">{agentUrl}/api/v1</p>
              <Badge variant="success" className="text-[10px]">
                SQLite Journal Ready
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-zinc-300">Infrastructure</CardTitle>
              <Database className="w-4 h-4 text-amber-400" />
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="text-lg font-bold text-zinc-100">PostgreSQL / Kafka</div>
              <p className="text-[11px] text-zinc-400">Kafka KRaft + Redis + Drizzle</p>
              <Badge variant="default" className="text-[10px]">
                Docker Compose
              </Badge>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              Core Architecture Guarantees
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-zinc-300">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span>
                <strong>Filesystem Authority:</strong> The host agent holds exclusive authority over
                files, terminal PTYs, and processes. No remote device bypasses the host agent.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span>
                <strong>Contract Enforcement:</strong> All HTTP and WebSocket communications use
                strict Zod-validated envelopes with correlation IDs and protocol versions.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span>
                <strong>Zero Mocking:</strong> Services run real HTTP, WebSocket, database schemas,
                and background event listeners.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};
