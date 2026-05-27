// Status bar: live word/character count + cursor position (CLAUDE.md §4, §8).
//
// Counts are taken from the document's *text* (not the markdown source) so they
// reflect what the writer sees. "Line/Column" is block-relative: each top-level
// block counts as a line, which is the meaningful notion in a WYSIWYG editor
// that has no source lines. The pure helpers are unit-tested; the class wires
// them to the editor, refreshing on edits and selection moves.
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";

/** Count words in `text` (runs of non-whitespace). Empty/blank → 0. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Count characters in `text`, counting astral codepoints (emoji) as one. */
export function countCharacters(text: string): number {
  return [...text].length;
}

/** Line/column for a caret, given the document text *before* it. 1-based. */
export function cursorLineColumn(textBeforeCursor: string): { line: number; column: number } {
  const lines = textBeforeCursor.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/** Estimated reading time in whole minutes at ~200 wpm; 0 words → 0. */
export function readingMinutes(words: number): number {
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
}

export interface DocStats {
  words: number;
  characters: number;
  line: number;
  column: number;
  /** Words covered by a non-empty selection, or 0 when the selection is empty. */
  selectedWords: number;
}

export class StatusBar {
  private rafId = 0;
  private readonly onSelectionChange = () => this.scheduleRefresh();

  constructor(
    private readonly el: HTMLElement,
    private readonly editor: Editor,
    private readonly editorRoot: HTMLElement,
  ) {
    // Doc edits come via the controller's refresh(); selection moves don't fire
    // the markdown listener, so watch the surface directly (like the toolbar).
    this.editorRoot.addEventListener("keyup", this.onSelectionChange);
    this.editorRoot.addEventListener("mouseup", this.onSelectionChange);
    document.addEventListener("selectionchange", this.onSelectionChange);
    this.refresh();
  }

  destroy(): void {
    this.editorRoot.removeEventListener("keyup", this.onSelectionChange);
    this.editorRoot.removeEventListener("mouseup", this.onSelectionChange);
    document.removeEventListener("selectionchange", this.onSelectionChange);
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private stats(): DocStats {
    let result: DocStats = { words: 0, characters: 0, line: 1, column: 1, selectedWords: 0 };
    this.editor.action((ctx) => {
      const { state } = ctx.get(editorViewCtx);
      const size = state.doc.content.size;
      // Block-separated text so words/lines don't merge across blocks.
      const full = state.doc.textBetween(0, size, "\n", "");
      const { from, to, head, empty } = state.selection;
      const before = state.doc.textBetween(0, head, "\n", "");
      const { line, column } = cursorLineColumn(before);
      const selectedWords = empty ? 0 : countWords(state.doc.textBetween(from, to, "\n", ""));
      result = {
        words: countWords(full),
        characters: countCharacters(state.doc.textContent),
        line,
        column,
        selectedWords,
      };
    });
    return result;
  }

  private scheduleRefresh(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.refresh();
    });
  }

  /** Recompute and render. Call on tab switch / programmatic load too. */
  refresh(): void {
    const s = this.stats();
    const words = s.selectedWords > 0 ? `${s.selectedWords} of ${s.words} words` : `${s.words} words`;
    const mins = readingMinutes(s.words);
    const read = mins > 0 ? ` · ~${mins} min read` : "";
    this.el.textContent = `${words} · ${s.characters} chars${read} · Ln ${s.line}, Col ${s.column}`;
  }
}
