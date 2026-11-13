import type { FileBuffer } from "../../components/editor/editor-pane";

/** A completed save acknowledges its snapshot, while retaining subsequent edits. */
export function applySaveResult(current: FileBuffer, submitted: FileBuffer, eTag: string, mtime: number): FileBuffer {
  return {
    ...current,
    savedContent: submitted.content,
    isDirty: current.content !== submitted.content,
    eTag,
    mtime,
    hasExternalConflict: false,
    deletedOnDisk: false,
  };
}
