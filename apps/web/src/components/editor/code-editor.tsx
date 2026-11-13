"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
  createEditorCompartments,
  buildEditorExtensions,
  EditorCompartments,
} from "../../lib/editor/codemirror-extensions";
import { LanguageDefinition } from "../../lib/editor/language-registry";
import { EditorThemeId, getEditorThemeExtension } from "../../lib/editor/themes";

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
  onCursorChange?: (line: number, col: number, selectionLength: number) => void;
  onSave?: () => void;
  onSaveAll?: () => void;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<EditorCompartments | null>(null);

  // Store latest callbacks in refs to avoid recreating editor on callback reference change
  const callbacksRef = useRef({
    onChange,
    onCursorChange,
    onSave,
    onSaveAll,
  });

  useEffect(() => {
    callbacksRef.current = {
      onChange,
      onCursorChange,
      onSave,
      onSaveAll,
    };
  });

  // Mount editor when path or container changes
  useEffect(() => {
    if (!containerRef.current) return;

    const compartments = createEditorCompartments();
    compartmentsRef.current = compartments;

    const extensions = buildEditorExtensions(
      {
        theme,
        languageExtension: language.loadExtension(),
        lineWrapping: wordWrap,
        tabSize,
        readOnly,
        onDocChange: (newDoc) => callbacksRef.current.onChange?.(newDoc),
        onCursorChange: (line, col, selLen) =>
          callbacksRef.current.onCursorChange?.(line, col, selLen),
        onSave: () => callbacksRef.current.onSave?.(),
        onSaveAll: () => callbacksRef.current.onSaveAll?.(),
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
