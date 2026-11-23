import { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { xml } from "@codemirror/lang-xml";
import { go } from "@codemirror/lang-go";

export type SpecialViewerType = "markdown" | "json" | "csv" | "image" | "binary";

export interface LanguageDefinition {
  id: string;
  name: string;
  extensions: string[];
  filenames?: string[];
  loadExtension: () => Extension;
  iconName: string;
  specialViewer?: SpecialViewerType;
}

const emptyExtension = () => [] as Extension;

export const LANGUAGE_REGISTRY: LanguageDefinition[] = [
  {
    id: "typescript",
    name: "TypeScript",
    extensions: [".ts", ".mts", ".cts"],
    loadExtension: () => javascript({ typescript: true }),
    iconName: "file-code",
  },
  {
    id: "typescriptreact",
    name: "TypeScript JSX",
    extensions: [".tsx"],
    loadExtension: () => javascript({ typescript: true, jsx: true }),
    iconName: "file-code",
  },
  {
    id: "javascript",
    name: "JavaScript",
    extensions: [".js", ".mjs", ".cjs"],
    loadExtension: () => javascript(),
    iconName: "file-code",
  },
  {
    id: "javascriptreact",
    name: "JavaScript JSX",
    extensions: [".jsx"],
    loadExtension: () => javascript({ jsx: true }),
    iconName: "file-code",
  },
  {
    id: "json",
    name: "JSON",
    extensions: [".json", ".jsonc"],
    loadExtension: () => json(),
    iconName: "file-text",
    specialViewer: "json",
  },
  {
    id: "markdown",
    name: "Markdown",
    extensions: [".md", ".markdown", ".mdown", ".mkd"],
    loadExtension: () => markdown(),
    iconName: "file-text",
    specialViewer: "markdown",
  },
  {
    id: "html",
    name: "HTML",
    extensions: [".html", ".htm"],
    loadExtension: () => html(),
    iconName: "file-code",
  },
  {
    id: "css",
    name: "CSS",
    extensions: [".css", ".scss", ".less"],
    loadExtension: () => css(),
    iconName: "file-code",
  },
  {
    id: "python",
    name: "Python",
    extensions: [".py", ".pyw", ".ipy"],
    loadExtension: () => python(),
    iconName: "file-code",
  },
  {
    id: "rust",
    name: "Rust",
    extensions: [".rs"],
    loadExtension: () => rust(),
    iconName: "file-code",
  },
  {
    id: "go",
    name: "Go",
    extensions: [".go"],
    loadExtension: () => go(),
    iconName: "file-code",
  },
  {
    id: "cpp",
    name: "C / C++",
    extensions: [".c", ".h", ".cpp", ".hpp", ".cc", ".cxx", ".cs"],
    loadExtension: () => cpp(),
    iconName: "file-code",
  },
  {
    id: "java",
    name: "Java",
    extensions: [".java"],
    loadExtension: () => java(),
    iconName: "file-code",
  },
  {
    id: "sql",
    name: "SQL",
    extensions: [".sql"],
    loadExtension: () => sql(),
    iconName: "database",
  },
  {
    id: "yaml",
    name: "YAML",
    extensions: [".yaml", ".yml"],
    loadExtension: () => yaml(),
    iconName: "file-text",
  },
  {
    id: "xml",
    name: "XML",
    extensions: [".xml", ".svg"],
    loadExtension: () => xml(),
    iconName: "file-code",
  },
  {
    id: "csv",
    name: "CSV",
    extensions: [".csv", ".tsv"],
    loadExtension: emptyExtension,
    iconName: "table",
    specialViewer: "csv",
  },
  {
    id: "image",
    name: "Image",
    extensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp"],
    loadExtension: emptyExtension,
    iconName: "image",
    specialViewer: "image",
  },
  {
    id: "binary",
    name: "Binary",
    extensions: [".bin", ".exe", ".dll", ".so", ".dylib", ".tar", ".gz", ".zip", ".wasm", ".pdf"],
    loadExtension: emptyExtension,
    iconName: "binary",
    specialViewer: "binary",
  },
  {
    id: "shell",
    name: "Shell",
    extensions: [".sh", ".bash", ".zsh"],
    filenames: [".bashrc", ".zshrc", ".bash_profile", ".profile"],
    loadExtension: emptyExtension,
    iconName: "terminal",
  },
  {
    id: "dockerfile",
    name: "Dockerfile",
    extensions: [],
    filenames: ["Dockerfile", "dockerfile", "Containerfile"],
    loadExtension: emptyExtension,
    iconName: "container",
  },
  {
    id: "plaintext",
    name: "Plain Text",
    extensions: [
      ".txt",
      ".log",
      ".env",
      ".gitignore",
      ".npmrc",
      ".editorconfig",
      ".prettierignore",
    ],
    loadExtension: emptyExtension,
    iconName: "file",
  },
];

const DEFAULT_LANGUAGE: LanguageDefinition = {
  id: "plaintext",
  name: "Plain Text",
  extensions: [],
  loadExtension: emptyExtension,
  iconName: "file",
};

export function getLanguageDefinition(filePath: string): LanguageDefinition {
  if (!filePath) return DEFAULT_LANGUAGE;

  const normalized = filePath.toLowerCase();
  const basename = normalized.split("/").pop() || "";

  for (const lang of LANGUAGE_REGISTRY) {
    if (lang.filenames && lang.filenames.some((f) => f.toLowerCase() === basename)) {
      return lang;
    }
  }

  for (const lang of LANGUAGE_REGISTRY) {
    for (const ext of lang.extensions) {
      if (basename.endsWith(ext.toLowerCase())) {
        return lang;
      }
    }
  }

  return DEFAULT_LANGUAGE;
}

export function getAllLanguages(): LanguageDefinition[] {
  return [...LANGUAGE_REGISTRY];
}
