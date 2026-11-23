import * as Y from "yjs";
import { Extension, Annotation } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { CollabParticipant } from "@remote-ide/shared";

export const yRemoteAnnotation = Annotation.define<boolean>();
export const localCollabOrigin = Symbol.for("remoteide-collab-local");

class RemoteCursorWidget extends WidgetType {
  constructor(
    private name: string,
    private color: string,
    private role: string
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-remote-cursor-wrap pointer-events-none relative inline-block";

    const cursor = document.createElement("span");
    cursor.className = "cm-remote-cursor absolute -top-0.5 bottom-0 w-[2px] rounded-full";
    cursor.style.backgroundColor = this.color;
    cursor.style.boxShadow = `0 0 4px ${this.color}`;
    wrap.appendChild(cursor);

    const tag = document.createElement("span");
    tag.className =
      "cm-remote-cursor-tag absolute -top-4 left-0 text-[10px] font-sans font-medium px-1.5 py-0.2 rounded shadow-md text-white whitespace-nowrap z-50 transition-opacity select-none";
    tag.style.backgroundColor = this.color;
    tag.textContent = `${this.name} (${this.role})`;
    wrap.appendChild(tag);

    return wrap;
  }

  eq(other: RemoteCursorWidget): boolean {
    return (
      other.name === this.name &&
      other.color === this.color &&
      other.role === this.role
    );
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export interface YjsCollabExtensionOptions {
  doc: Y.Doc;
  yText: Y.Text;
  getParticipants: () => CollabParticipant[];
  currentUserId: string;
}

/**
 * Builds the CodeMirror 6 extension integrating Yjs CRDT synchronization
 * and real-time remote colored cursor / selection decorations.
 */
export function buildYjsCollabExtension(options: YjsCollabExtensionOptions): Extension[] {
  const { doc, yText, getParticipants, currentUserId } = options;

  const cmToYjsSync = EditorView.updateListener.of((update: ViewUpdate) => {
    if (
      update.docChanged &&
      !update.transactions.some((tr) => tr.annotation(yRemoteAnnotation))
    ) {
      doc.transact(() => {
        update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          const insertText = inserted.toString();
          const deleteLen = toA - fromA;
          if (deleteLen > 0) {
            yText.delete(fromA, deleteLen);
          }
          if (insertText.length > 0) {
            yText.insert(fromA, insertText);
          }
        });
      }, localCollabOrigin);
    }
  });

  const yjsToCmSync = ViewPlugin.fromClass(
    class {
      private observer: (event: Y.YTextEvent) => void;

      constructor(private view: EditorView) {
        this.observer = (event: Y.YTextEvent) => {
          if (event.transaction.origin === localCollabOrigin) return;

          let index = 0;
          const changes: { from: number; to: number; insert: string }[] = [];

          for (const op of event.delta) {
            if (op.retain !== undefined) {
              index += op.retain;
            } else if (op.insert !== undefined) {
              const text = typeof op.insert === "string" ? op.insert : "";
              changes.push({ from: index, to: index, insert: text });
              index += text.length;
            } else if (op.delete !== undefined) {
              changes.push({ from: index, to: index + op.delete, insert: "" });
            }
          }

          if (changes.length > 0) {
            this.view.dispatch({
              changes,
              annotations: [yRemoteAnnotation.of(true)],
            });
          }
        };

        yText.observe(this.observer);
      }

      destroy() {
        yText.unobserve(this.observer);
      }
    }
  );

  const remoteCursorsPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const participants = getParticipants().filter((p) => p.id !== currentUserId && p.cursor);

        const decorationsList: { from: number; to: number; deco: Decoration }[] = [];

        for (const p of participants) {
          if (!p.cursor) continue;

          try {
            const lineNum = Math.min(
              Math.max(1, p.cursor.line),
              view.state.doc.lines
            );
            const line = view.state.doc.line(lineNum);
            const col = Math.min(Math.max(1, p.cursor.col), line.length + 1);
            const headPos = line.from + (col - 1);

            if (p.cursor.selectionLength && p.cursor.selectionLength > 0) {
              const selFrom = Math.min(headPos, view.state.doc.length);
              const selTo = Math.min(
                headPos + p.cursor.selectionLength,
                view.state.doc.length
              );
              if (selFrom < selTo) {
                decorationsList.push({
                  from: selFrom,
                  to: selTo,
                  deco: Decoration.mark({
                    attributes: {
                      style: `background-color: ${p.color}33; border-bottom: 2px solid ${p.color}88;`,
                    },
                  }),
                });
              }
            }

            decorationsList.push({
              from: headPos,
              to: headPos,
              deco: Decoration.widget({
                widget: new RemoteCursorWidget(p.name, p.color, p.role),
                side: 1,
              }),
            });
          } catch {
            // Ignore position errors when document size fluctuates
          }
        }

        // Sort decorations by range start position (required by RangeSetBuilder)
        decorationsList.sort((a, b) => a.from - b.from || a.to - b.to);

        for (const d of decorationsList) {
          builder.add(d.from, d.to, d.deco);
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );

  return [cmToYjsSync, yjsToCmSync, remoteCursorsPlugin];
}
