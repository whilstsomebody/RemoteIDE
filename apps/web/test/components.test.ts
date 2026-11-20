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
import { TerminalContainer } from "../src/components/terminal/terminal-container";
import { QuickLauncher } from "../src/components/tasks/quick-launcher";
import { SourceControlPanel } from "../src/components/git/source-control-panel";
import { GitDiffModal } from "../src/components/git/git-diff-modal";
import { ProcessPanel } from "../src/components/processes/process-panel";
import { PortsPanel } from "../src/components/preview/ports-panel";
import { PreviewTab } from "../src/components/preview/preview-tab";
import { ApiClientPanel } from "../src/components/api-client/api-client-panel";
import { CatchupModal } from "../src/components/catchup/catchup-modal";
import { DiffViewerModal } from "../src/components/catchup/diff-viewer-modal";

describe("IDE Components & Viewers Export Integrity", () => {
  it("exports Catch-Up and Diff Viewer modals", () => {
    expect(CatchupModal).toBeDefined();
    expect(DiffViewerModal).toBeDefined();
  });
  it("exports Git, Process, Preview, and API Client components", () => {
    expect(SourceControlPanel).toBeDefined();
    expect(GitDiffModal).toBeDefined();
    expect(ProcessPanel).toBeDefined();
    expect(PortsPanel).toBeDefined();
    expect(PreviewTab).toBeDefined();
    expect(ApiClientPanel).toBeDefined();
  });

  it("exports terminal and background task execution components", () => {
    expect(TerminalContainer).toBeDefined();
    expect(QuickLauncher).toBeDefined();
  });
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
