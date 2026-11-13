import { describe, it, expect } from "vitest";
import { Breadcrumbs } from "../src/components/editor/breadcrumbs";
import { TabBar } from "../src/components/editor/tab-bar";
import { ConflictDialog } from "../src/components/editor/conflict-dialog";
import { BottomPanel } from "../src/components/shell/bottom-panel";
import { CommandPalette } from "../src/components/shell/command-palette";
import { SettingsPanel } from "../src/components/shell/settings-panel";
import { SearchPanel } from "../src/components/workspace/search-panel";
import { FileTree } from "../src/components/workspace/file-tree";
import { MarkdownViewer } from "../src/components/viewers/markdown-viewer";
import { JsonViewer } from "../src/components/viewers/json-viewer";
import { CsvViewer } from "../src/components/viewers/csv-viewer";
import { ImageViewer } from "../src/components/viewers/image-viewer";
import { BinaryViewer } from "../src/components/viewers/binary-viewer";
import { CodeEditor } from "../src/components/editor/code-editor";
import { EditorPane } from "../src/components/editor/editor-pane";
import { IdeShell } from "../src/components/shell/ide-shell";

describe("IDE Components & Viewers Export Integrity", () => {
  it("exports all code editor and pane components", () => {
    expect(CodeEditor).toBeDefined();
    expect(EditorPane).toBeDefined();
    expect(TabBar).toBeDefined();
    expect(Breadcrumbs).toBeDefined();
    expect(ConflictDialog).toBeDefined();
  });

  it("exports all shell navigation and tool panels", () => {
    expect(IdeShell).toBeDefined();
    expect(BottomPanel).toBeDefined();
    expect(CommandPalette).toBeDefined();
    expect(SettingsPanel).toBeDefined();
    expect(SearchPanel).toBeDefined();
    expect(FileTree).toBeDefined();
  });

  it("exports all special viewers", () => {
    expect(MarkdownViewer).toBeDefined();
    expect(JsonViewer).toBeDefined();
    expect(CsvViewer).toBeDefined();
    expect(ImageViewer).toBeDefined();
    expect(BinaryViewer).toBeDefined();
  });
});
