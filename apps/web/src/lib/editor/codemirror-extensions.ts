import { Extension, Compartment, Prec, EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from "@codemirror/view";
import {
  foldGutter,
  indentOnInput,
  bracketMatching,
  foldKeymap,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { getEditorThemeExtension, EditorThemeId } from "./themes";

export interface EditorExtensionConfig {
  theme?: EditorThemeId;
  languageExtension?: Extension;
  lineWrapping?: boolean;
  tabSize?: number;
  readOnly?: boolean;
  onDocChange?: (newDoc: string) => void;
  onCursorChange?: (line: number, col: number, selectionLength: number) => void;
  onSave?: () => void;
  onSaveAll?: () => void;
  extraExtensions?: Extension[];
}

export interface EditorCompartments {
  theme: Compartment;
  language: Compartment;
  lineWrapping: Compartment;
  tabSize: Compartment;
  readOnly: Compartment;
}

export function createEditorCompartments(): EditorCompartments {
  return {
    theme: new Compartment(),
    language: new Compartment(),
    lineWrapping: new Compartment(),
    tabSize: new Compartment(),
    readOnly: new Compartment(),
  };
}

export function buildEditorExtensions(
  config: EditorExtensionConfig,
  compartments: EditorCompartments
): Extension[] {
  const customKeymaps = Prec.highest(
    keymap.of([
      {
        key: "Mod-s",
        run: () => {
          if (config.onSave) {
            config.onSave();
            return true;
          }
          return false;
        },
      },
      {
        key: "Mod-Shift-s",
        run: () => {
          if (config.onSaveAll) {
            config.onSaveAll();
            return true;
          }
          return false;
        },
      },
    ])
  );

  const listeners = EditorView.updateListener.of((update) => {
    if (update.docChanged && config.onDocChange) {
      config.onDocChange(update.state.doc.toString());
    }

    if (update.selectionSet && config.onCursorChange) {
      const mainSel = update.state.selection.main;
      const line = update.state.doc.lineAt(mainSel.head);
      const col = mainSel.head - line.from + 1;
      const selectionLength = Math.abs(mainSel.to - mainSel.from);
      config.onCursorChange(line.number, col, selectionLength);
    }
  });

  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    indentOnInput(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

    // Compartments for live reconfiguring
    compartments.theme.of(getEditorThemeExtension(config.theme || "remoteide-dark")),
    compartments.language.of(config.languageExtension || []),
    compartments.lineWrapping.of(config.lineWrapping !== false ? EditorView.lineWrapping : []),
    compartments.tabSize.of(EditorState.tabSize.of(config.tabSize || 2)),
    compartments.readOnly.of(EditorView.editable.of(!config.readOnly)),

    listeners,
    customKeymaps,

    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
    ]),

    ...(config.extraExtensions || []),
  ];
}
