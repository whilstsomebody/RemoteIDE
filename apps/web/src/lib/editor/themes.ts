import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { oneDark } from "@codemirror/theme-one-dark";

export type EditorThemeId = "remoteide-dark" | "one-dark" | "high-contrast";

// RemoteIDE Dark Theme
const remoteIdeDarkBase = EditorView.theme(
  {
    "&": {
      color: "#e6edf3",
      backgroundColor: "#0e1117",
      fontSize: "14px",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "#58a6ff",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      padding: "8px 0",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "#58a6ff",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#264f78 !important",
    },
    ".cm-selectionMatch": {
      backgroundColor: "#3a4d62",
    },
    ".cm-gutters": {
      backgroundColor: "#0d1117",
      color: "#484f58",
      borderRight: "1px solid #21262d",
      paddingRight: "4px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#161b22",
      color: "#e6edf3",
    },
    ".cm-activeLine": {
      backgroundColor: "#161b2240",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#21262d",
      border: "none",
      color: "#8b949e",
      padding: "0 4px",
      borderRadius: "2px",
    },
    ".cm-tooltip": {
      backgroundColor: "#161b22",
      border: "1px solid #30363d",
      color: "#c9d1d9",
      borderRadius: "6px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li": {
        padding: "4px 8px",
      },
      "& > ul > li[aria-selected]": {
        backgroundColor: "#1f6feb",
        color: "#ffffff",
      },
    },
    ".cm-panels": {
      backgroundColor: "#161b22",
      color: "#c9d1d9",
      borderTop: "1px solid #30363d",
    },
    ".cm-search": {
      padding: "6px 8px",
      fontSize: "12px",
    },
    ".cm-search input": {
      backgroundColor: "#0d1117",
      border: "1px solid #30363d",
      color: "#e6edf3",
      borderRadius: "4px",
      padding: "2px 6px",
      margin: "0 4px",
    },
    ".cm-search button": {
      backgroundColor: "#21262d",
      border: "1px solid #30363d",
      color: "#c9d1d9",
      borderRadius: "4px",
      padding: "2px 8px",
      margin: "0 2px",
      cursor: "pointer",
    },
    ".cm-search button:hover": {
      backgroundColor: "#30363d",
    },
  },
  { dark: true }
);

const remoteIdeHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#ff7b72", fontWeight: "600" },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: "#79c0ff" },
  { tag: [t.function(t.variableName), t.labelName], color: "#d2a8ff" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#ffa657" },
  { tag: [t.definition(t.name), t.separator], color: "#e6edf3" },
  {
    tag: [
      t.typeName,
      t.className,
      t.number,
      t.changed,
      t.annotation,
      t.modifier,
      t.self,
      t.namespace,
    ],
    color: "#79c0ff",
  },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link], color: "#ff7b72" },
  { tag: [t.meta, t.comment], color: "#8b949e", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#58a6ff", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "#58a6ff" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#ff7b72" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "#a5d6ff" },
  { tag: t.invalid, color: "#f85149" },
]);

export const remoteIdeDarkTheme: Extension = [
  remoteIdeDarkBase,
  syntaxHighlighting(remoteIdeHighlightStyle),
];

// High Contrast Dark
const highContrastBase = EditorView.theme(
  {
    "&": {
      color: "#ffffff",
      backgroundColor: "#000000",
      fontSize: "14px",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "#ffff00",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      padding: "8px 0",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "#ffff00",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#004b99 !important",
    },
    ".cm-gutters": {
      backgroundColor: "#050505",
      color: "#888888",
      borderRight: "1px solid #444444",
    },
    ".cm-activeLine": {
      backgroundColor: "#111111",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#111111",
      color: "#ffff00",
    },
  },
  { dark: true }
);

export const highContrastDarkTheme: Extension = [
  highContrastBase,
  syntaxHighlighting(remoteIdeHighlightStyle),
];

export function getEditorThemeExtension(themeId: EditorThemeId): Extension {
  switch (themeId) {
    case "one-dark":
      return oneDark;
    case "high-contrast":
      return highContrastDarkTheme;
    case "remoteide-dark":
    default:
      return remoteIdeDarkTheme;
  }
}
