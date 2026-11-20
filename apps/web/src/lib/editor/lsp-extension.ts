import { Extension } from "@codemirror/state";
import { EditorView, hoverTooltip } from "@codemirror/view";
import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { linter, lintGutter, Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { LspCompletionItem, LspHoverResult, LspDiagnostic } from "@remote-ide/shared";

export interface LspExtensionConfig {
  gatewayUrl?: string;
  workspaceId: string;
  filePath: string;
  languageId?: string;
  onDiagnostics?: (diags: LspDiagnostic[]) => void;
  onNavigateDefinition?: (path: string, line: number, col: number) => void;
}

/**
 * Creates CodeMirror 6 extensions that connect directly to RemoteIDE's host LSP service:
 * - Intelligent autocompletion
 * - Hover information tooltips
 * - Live diagnostics & lint gutter
 * - Document didOpen/didChange synchronization
 */
export function buildLspExtensions(config: LspExtensionConfig): Extension[] {
  const {
    gatewayUrl = "",
    workspaceId,
    filePath,
    languageId = "typescript",
    onDiagnostics,
  } = config;
  const baseUrl = gatewayUrl.replace(/\/+$/, "");

  // 1. Initial document didOpen sync
  let hasOpened = false;
  const syncListener = EditorView.updateListener.of((update) => {
    if (!hasOpened) {
      hasOpened = true;
      fetch(`${baseUrl}/api/v1/lsp/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          path: filePath,
          languageId,
          version: 1,
          text: update.state.doc.toString(),
        }),
      }).catch(() => {});
    }

    if (update.docChanged) {
      // Debounced change sync
      const content = update.state.doc.toString();
      fetch(`${baseUrl}/api/v1/lsp/change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          path: filePath,
          version: Date.now(),
          content,
        }),
      }).catch(() => {});
    }
  });

  // 2. Autocompletion Source
  const lspCompletionSource = async (
    context: CompletionContext
  ): Promise<CompletionResult | null> => {
    const word = context.matchBefore(/\w*/);
    if (!word && !context.explicit) return null;

    const line = context.state.doc.lineAt(context.pos);
    const lineNumber = line.number - 1; // 0-based
    const character = context.pos - line.from; // 0-based

    try {
      const res = await fetch(`${baseUrl}/api/v1/lsp/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          path: filePath,
          position: { line: lineNumber, character },
        }),
      });

      if (!res.ok) return null;
      const json = await res.json();
      const items: LspCompletionItem[] = json.data || [];

      if (items.length === 0) return null;

      return {
        from: word ? word.from : context.pos,
        options: items.map((item) => ({
          label: item.label,
          type:
            item.kind === 2
              ? "function"
              : item.kind === 5
                ? "property"
                : item.kind === 6
                  ? "variable"
                  : item.kind === 7
                    ? "class"
                    : item.kind === 8
                      ? "interface"
                      : item.kind === 14
                        ? "keyword"
                        : "text",
          info: item.detail || item.documentation,
          apply: item.insertText || item.label,
          boost: item.sortText ? 99 - parseInt(item.sortText.slice(0, 2), 10) : 0,
        })),
      };
    } catch {
      return null;
    }
  };

  const autocompleteExt = autocompletion({
    override: [lspCompletionSource],
    defaultKeymap: true,
  });

  // 3. Hover Tooltip
  const hoverExt = hoverTooltip(async (view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const lineNumber = line.number - 1;
    const character = pos - line.from;

    try {
      const res = await fetch(`${baseUrl}/api/v1/lsp/hover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          path: filePath,
          position: { line: lineNumber, character },
        }),
      });

      if (!res.ok) return null;
      const json = await res.json();
      const hover: LspHoverResult | null = json.data;

      if (!hover || !hover.contents || hover.contents.length === 0) return null;

      const word = view.state.wordAt(pos);
      const start = word ? word.from : pos;
      const end = word ? word.to : pos;

      return {
        pos: start,
        end,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className =
            "cm-lsp-hover p-2 max-w-md bg-[#18181b] border border-[#27272a] rounded shadow-xl text-xs text-zinc-200 font-mono select-text";

          for (const section of hover.contents) {
            const p = document.createElement("div");
            p.className = "whitespace-pre-wrap leading-relaxed py-0.5";
            p.textContent = section.replace(/^```[a-z]*\n|```$/g, "");
            dom.appendChild(p);
          }
          return { dom };
        },
      };
    } catch {
      return null;
    }
  });

  // 4. Linter & Diagnostics
  const linterExt = linter(
    async (view) => {
      try {
        const res = await fetch(
          `${baseUrl}/api/v1/lsp/diagnostics?workspaceId=${encodeURIComponent(
            workspaceId
          )}&path=${encodeURIComponent(filePath)}`
        );
        if (!res.ok) return [];
        const json = await res.json();
        const diagnostics: LspDiagnostic[] = json.data || [];

        onDiagnostics?.(diagnostics);

        const cmDiags: CmDiagnostic[] = [];
        for (const d of diagnostics) {
          try {
            const startLineNumber = Math.min(d.range.start.line + 1, view.state.doc.lines);
            const line = view.state.doc.line(startLineNumber);
            const from = Math.min(line.from + d.range.start.character, line.to);
            const endLineNumber = Math.min(d.range.end.line + 1, view.state.doc.lines);
            const endLine = view.state.doc.line(endLineNumber);
            const to = Math.max(
              from + 1,
              Math.min(endLine.from + d.range.end.character, endLine.to)
            );

            cmDiags.push({
              from,
              to,
              severity: d.severity === "hint" ? "info" : d.severity,
              message: d.message,
              source: d.source || "typescript",
            });
          } catch {
            // Ignore position calculation errors
          }
        }
        return cmDiags;
      } catch {
        return [];
      }
    },
    { delay: 300 }
  );

  return [syncListener, autocompleteExt, hoverExt, linterExt, lintGutter()];
}

/**
 * Execute Go to Definition for symbol at cursor.
 */
export async function executeGoToDefinition(
  gatewayUrl: string,
  workspaceId: string,
  filePath: string,
  line: number,
  character: number
): Promise<{ path: string; line: number; col: number } | null> {
  const baseUrl = gatewayUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${baseUrl}/api/v1/lsp/definition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        path: filePath,
        position: { line: line - 1, character: character - 1 },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const locs = json.data || [];
    if (locs.length > 0 && locs[0]) {
      return {
        path: locs[0].path,
        line: locs[0].range.start.line + 1,
        col: locs[0].range.start.character + 1,
      };
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Rename symbol across workspace.
 */
export async function executeRename(
  gatewayUrl: string,
  workspaceId: string,
  filePath: string,
  line: number,
  character: number,
  newName: string
): Promise<Record<
  string,
  Array<{
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    newText: string;
  }>
> | null> {
  const baseUrl = gatewayUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${baseUrl}/api/v1/lsp/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        path: filePath,
        position: { line: line - 1, character: character - 1 },
        newName,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.changes || null;
  } catch {
    return null;
  }
}
