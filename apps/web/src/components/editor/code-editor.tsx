"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
  createEditorCompartments,
  buildEditorExtensions,
  EditorCompartments,
} from "../../lib/editor/codemirror-extensions";
import { LanguageDefinition } from "../../lib/editor/language-registry";
import { EditorThemeId, getEditorThemeExtension } from "../../lib/editor/themes";
import {
  buildLspExtensions,
  executeGoToDefinition,
  executeRename,
} from "../../lib/editor/lsp-extension";
import { LspDiagnostic, CollabParticipant } from "@remote-ide/shared";
import * as Y from "yjs";
import { buildYjsCollabExtension } from "../../lib/collab/yjs-collab-extension";

export interface CodeEditorProps {
  doc: string;
  path: string;
  language: LanguageDefinition;
  theme?: EditorThemeId;
  fontSize?: number;
  tabSize?: number;
  wordWrap?: boolean;
  readOnly?: boolean;
  onChange?: (newDoc: string) => void;
  onCursorChange?: (
    line: number,
    col: number,
    selectionLength: number,
    selectedText?: string
  ) => void;
  onSave?: () => void;
  onSaveAll?: () => void;
  gatewayUrl?: string;
  workspaceId?: string;
  onDiagnostics?: (diags: LspDiagnostic[]) => void;
  onNavigateDefinition?: (path: string, line: number, col: number) => void;
  collabDoc?: Y.Doc;
  collabParticipants?: CollabParticipant[];
  currentUserId?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  doc,
  path,
  language,
  theme = "remoteide-dark",
  fontSize = 14,
  tabSize = 2,
  wordWrap = true,
  readOnly = false,
  onChange,
  onCursorChange,
  onSave,
  onSaveAll,
  gatewayUrl,
  workspaceId = "default",
  onDiagnostics,
  onNavigateDefinition,
  collabDoc,
  collabParticipants,
  currentUserId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<EditorCompartments | null>(null);

  // Store latest callbacks and collab props in refs to avoid recreating editor on callback reference change
  const callbacksRef = useRef({
    onChange,
    onCursorChange,
    onSave,
    onSaveAll,
    collabParticipants,
  });

  useEffect(() => {
    callbacksRef.current = {
      onChange,
      onCursorChange,
      onSave,
      onSaveAll,
      collabParticipants,
    };
  });

  // Mount editor when path or container changes
  useEffect(() => {
    if (!containerRef.current) return;

    const compartments = createEditorCompartments();
    compartmentsRef.current = compartments;

    const isLspSupported = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|c|cpp|h|hpp|java|cs)$/i.test(path);
    const lspExtensions = isLspSupported
      ? buildLspExtensions({
          gatewayUrl,
          workspaceId,
          filePath: path,
          languageId: language.id,
          onDiagnostics,
          onNavigateDefinition,
        })
      : [];

    const lspKeymaps = keymap.of([
      {
        key: "F12",
        run: (v) => {
          const pos = v.state.selection.main.head;
          const line = v.state.doc.lineAt(pos);
          const lineNum = line.number;
          const colNum = pos - line.from + 1;
          executeGoToDefinition(gatewayUrl || "", workspaceId, path, lineNum, colNum).then(
            (loc) => {
              if (loc && onNavigateDefinition) {
                onNavigateDefinition(loc.path, loc.line, loc.col);
              }
            }
          );
          return true;
        },
      },
      {
        key: "F2",
        run: (v) => {
          const pos = v.state.selection.main.head;
          const line = v.state.doc.lineAt(pos);
          const lineNum = line.number;
          const colNum = pos - line.from + 1;
          const newName = window.prompt("Rename symbol across workspace to:");
          if (newName && newName.trim()) {
            executeRename(
              gatewayUrl || "",
              workspaceId,
              path,
              lineNum,
              colNum,
              newName.trim()
            ).then((changes) => {
              if (changes && changes[path]) {
                const edits = changes[path]!;
                for (const edit of edits) {
                  try {
                    const startLine = v.state.doc.line(edit.range.start.line + 1);
                    const from = startLine.from + edit.range.start.character;
                    const endLine = v.state.doc.line(edit.range.end.line + 1);
                    const to = endLine.from + edit.range.end.character;
                    v.dispatch({ changes: { from, to, insert: edit.newText } });
                  } catch {
                    // Ignore
                  }
                }
              }
            });
          }
          return true;
        },
      },
    ]);

    const collabExtensions: any[] = [];
    if (collabDoc) {
      const yText = collabDoc.getText("contents");
      if (yText.toString().length === 0 && doc.length > 0) {
        yText.insert(0, doc);
      }
      collabExtensions.push(
        ...buildYjsCollabExtension({
          doc: collabDoc,
          yText,
          getParticipants: () => callbacksRef.current.collabParticipants || [],
          currentUserId: currentUserId || "local",
        })
      );
    }

    const extensions = buildEditorExtensions(
      {
        theme,
        languageExtension: language.loadExtension(),
        lineWrapping: wordWrap,
        tabSize,
        readOnly,
        onDocChange: (newDoc) => callbacksRef.current.onChange?.(newDoc),
        onCursorChange: (line, col, selLen, selText) =>
          callbacksRef.current.onCursorChange?.(line, col, selLen, selText),
        onSave: () => callbacksRef.current.onSave?.(),
        onSaveAll: () => callbacksRef.current.onSaveAll?.(),
        extraExtensions: [...lspExtensions, lspKeymaps, ...collabExtensions],
      },
      compartments
    );

    const state = EditorState.create({
      doc,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Report initial cursor position
    callbacksRef.current.onCursorChange?.(1, 1, 0);

    return () => {
      view.destroy();
      viewRef.current = null;
      compartmentsRef.current = null;
    };
    // Re-mount when the target file path changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Handle external doc changes (e.g. file reloaded from disk)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc !== doc) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: doc,
        },
      });
    }
  }, [doc]);

  // Update theme dynamically
  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments) return;

    view.dispatch({
      effects: compartments.theme.reconfigure(getEditorThemeExtension(theme)),
    });
  }, [theme]);

  // Update language dynamically
  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments) return;

    view.dispatch({
      effects: compartments.language.reconfigure(language.loadExtension()),
    });
  }, [language]);

  // Update word wrap dynamically
  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments) return;

    view.dispatch({
      effects: compartments.lineWrapping.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  // Update tab size dynamically
  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments) return;

    view.dispatch({
      effects: compartments.tabSize.reconfigure(EditorState.tabSize.of(tabSize)),
    });
  }, [tabSize]);

  // Update readOnly dynamically
  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments) return;

    view.dispatch({
      effects: compartments.readOnly.reconfigure(EditorView.editable.of(!readOnly)),
    });
  }, [readOnly]);

  const fontSizeStyle = useMemo(
    () => ({
      fontSize: `${fontSize}px`,
    }),
    [fontSize]
  );

  return (
    <div
      ref={containerRef}
      style={fontSizeStyle}
      className="w-full h-full overflow-hidden focus:outline-none"
    />
  );
};
