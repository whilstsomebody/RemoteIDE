# ADR 0003: Browser-Based IDE and CodeMirror 6 Architecture

## Status

Accepted

## Context

RemoteIDE enables developers to access their projects on a host computer from remote devices such as laptops, tablets, and phones. The browser interface requires a responsive, high-performance code editor capable of handling multiple open files, syntax highlighting across 20+ languages, split editing, search and replace, atomic file operations, and safe concurrency guards.

Two primary code editor foundations were considered:

1. **Monaco Editor** (VS Code web editor)
2. **CodeMirror 6** (Modern functional/reactive editor built on pure state machines)

In addition, the IDE must support special document viewers (Markdown live preview, JSON validation and formatting, CSV tabular data grids, image inspection, and read-only binary hex preview) and guarantee editing safety against concurrent external modifications and network interruptions.

## Decision Drivers

1. **Mobile and Tablet Accessibility**: RemoteIDE is explicitly designed for phones, tablets, and lightweight remote clients. CodeMirror 6 is mobile-first with native touch and virtual keyboard support, whereas Monaco has significant touch and mobile viewport limitations.
2. **Bundle Size and Performance**: CodeMirror 6 is fully modular and tree-shakable (~120 KB gzip with standard language packs), compared to Monaco (~2.5 MB to 4 MB with required web worker bundles and packaging complexity).
3. **Reactive State Machine Architecture**: CodeMirror 6 separates document state (`EditorState`) from DOM views (`EditorView`) using immutable transaction dispatches. Live reconfiguration (fonts, tab sizes, word wrap, themes) is achieved via `Compartment` instances without re-mounting the DOM.
4. **Data Plane Isolation**: Source code must remain on the host computer. The browser retains buffers and drafts in client memory and `localStorage` only; central servers never store unencrypted or persistent user code.
5. **Editing Safety & Concurrency**: Remote file modifications made outside the browser (e.g., git checkouts, compiler outputs) must be detected. Saves must assert optimistic concurrency via file `eTag` headers to prevent silent overwrites.

## Decision Outcome

We selected **CodeMirror 6** as the core editor engine for RemoteIDE, complemented by an extensible language registry and dedicated special viewers.

### Architecture Overview

```
+-------------------------------------------------------------------------+
|                              IdeShell                                   |
|  +----------------+ +-------------------------------------------------+ |
|  |  ActivityBar   | | Header (Workspace, Connection, Refresh)         | |
|  | - Explorer     | +-------------------------------------------------+ |
|  | - Search       | | Editor Area (Single or Split Pane)              | |
|  | - Terminals    | | +-----------------------+ +-------------------+ | |
|  | - Agent        | | | Primary EditorPane    | | Secondary Pane    | | |
|  | - Settings     | | | - TabBar (dirty, close) | | - TabBar        | | |
|  +----------------+ | | - Breadcrumbs         | | - Breadcrumbs     | | |
|  | Resizable      | | | - CodeEditor / Viewer | | - CodeEditor      | | |
|  | Sidebar        | | +-----------------------+ +-------------------+ | |
|  | - WorkspaceMgr | +-------------------------------------------------+ |
|  | - FileTree     | | BottomPanel (Terminal / Output Logs / Problems) | |
|  | - SearchPanel  | +-------------------------------------------------+ |
|  | - SettingsPanel| | StatusBar (Ln, Col, Spaces, UTF-8, LF, Latency) | |
|  +----------------+ +-------------------------------------------------+ |
+-------------------------------------------------------------------------+
```

### 1. In-Memory Multi-Buffer State Machine

All open files are tracked in a unified `buffers` dictionary:

```ts
interface FileBuffer {
  path: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  eTag: string;
  mtime: number;
  isBinary: boolean;
  encoding: "utf-8" | "base64";
  size: number;
  deletedOnDisk?: boolean;
  hasExternalConflict?: boolean;
}
```

Primary and secondary split editor panes reference these shared buffers by path. When a buffer is edited in one pane, changes synchronize automatically across both views.

### 2. Extensible Language Registry

File extensions and filenames are resolved via `getLanguageDefinition(path)`. Supported syntaxes include:

- Web: TypeScript, TSX, JavaScript, JSX, JSON, HTML, CSS.
- Systems: Python, Rust, Go, C/C++, Java.
- Config & Query: SQL, YAML, XML, Shell (`.sh`, `.bashrc`), Dockerfile, Plain Text.
- Special Viewers: Markdown, CSV, Images (PNG, JPG, SVG, WebP, GIF), and Binary files.

### 3. Special Viewers

- **Markdown Live Preview**: Parses GitHub Flavored Markdown (headings, code blocks with language headers and copy action, tables, blockquotes, task lists) with a 1-click toggle between editor and preview.
- **JSON Validator & Formatter**: Validates JSON syntax on keystroke, displays key/item counts, reports syntax errors, and provides instant 2-space pretty-printing and minification.
- **CSV Data Grid**: RFC 4180 parser supporting quotes, commas, CRLF, and tabs; provides real-time row search filtering, row numbering, and CSV export.
- **Image Inspector**: Renders images with transparency canvas, zoom controls (25% to 400%), pixel dimensions, and file size.
- **Binary File Inspector**: Formats the first 256 bytes into standard hex offsets and ASCII dump, preventing text editor corruption.

### 4. Concurrency & Editing Safety

- **Optimistic Concurrency**: Writes supply `expectedETag`. If the host file was changed concurrently, the agent returns HTTP 409 (`CONCURRENCY_CONFLICT`).
- **External Change Detection**: A background timer polls `stat` for open files. Clean files are silently refreshed; dirty files trigger a `ConflictDialog` giving developers the option to overwrite the host, reload from host, or cancel.
- **Local Draft Restoration**: Unsaved keystrokes are preserved in browser `localStorage` under `remoteide:draft:${workspaceId}:${path}`. On tab reload or unexpected disconnection, unsaved work is immediately restored with an alert.
- **Resource Cleanup**: CodeMirror `EditorView` instances are destroyed upon tab closure and component unmounting to prevent memory leaks.

## Consequences

### Positive

- High-fidelity IDE experience with fast load times and minimal memory footprint.
- Native mobile and tablet gesture support.
- Zero risk of silent data loss during external git pulls or concurrent modifications.
- Local drafts prevent work loss during network disconnects.

### Limitations & Future Work

- CodeMirror 6 provides fast lexical and grammatical syntax highlighting; full semantic language intelligence (LSP diagnostics, jump to definition, symbol renaming) will be connected to language servers on the host agent in a subsequent phase.
- Bottom terminal panel currently displays host daemon readiness; interactive PTY multiplexing will attach in Phase 3.
