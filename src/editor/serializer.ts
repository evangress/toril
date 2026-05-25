// The ONE markdown ⇄ document converter (CLAUDE.md §3.2). Every conversion in
// Toril — editor load, save, source-mode swap, tests — goes through these two
// functions, so there is exactly one canonical markdown representation and no
// second, diverging code path.
//
// Both wrap Milkdown's own remark-backed pipeline (markdown ⇄ mdast ⇄
// ProseMirror), so we inherit its tested round-trip behavior rather than
// hand-rolling a schema (§11).
import type { Editor } from "@milkdown/kit/core";
import { getMarkdown, replaceAll } from "@milkdown/kit/utils";

/** Serialize the editor's current document to canonical markdown. */
export function docToMarkdown(editor: Editor): string {
  return editor.action(getMarkdown());
}

/** Replace the editor's entire document with the result of parsing `markdown`. */
export function markdownToDoc(editor: Editor, markdown: string): void {
  editor.action(replaceAll(markdown));
}
