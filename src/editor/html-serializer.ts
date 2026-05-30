// The ONE HTML ⇄ document converter (CLAUDE.md §3.2), the HTML-format sibling of
// serializer.ts. Toril is gaining HTML as a first-class editable format — driven
// by the 2026 shift toward AI assistants emitting rich HTML instead of Markdown —
// so `.html` files need exactly one canonical converter, just as `.md` does.
//
// Unlike the Markdown path (which rides Milkdown's remark pipeline), HTML is the
// native shape of a ProseMirror document: every schema node already declares how
// it parses from / serializes to the DOM. So we serialize straight through
// ProseMirror's own DOMSerializer / DOMParser against the *live editor schema* —
// no second schema, no hand-rolled nodes (§11). Whatever constructs the schema
// supports round-trip; anything outside it is normalized away on load (the same
// documented trade-off as Markdown's tight→loose normalization).
//
// SECURITY (§3.3): an HTML editor must render *live* markup to be WYSIWYG, which
// inverts Toril's usual "HTML is inert" stance. We hold the line by routing every
// load through `sanitizeHtml` BEFORE it reaches ProseMirror — so script, event
// handlers, and embedding sinks never enter the editable surface. Stripped
// content is intentionally not round-tripped (a prose editor does not execute JS).
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { DOMParser as ProseDOMParser, DOMSerializer, Slice } from "@milkdown/kit/prose/model";
import { Selection } from "@milkdown/kit/prose/state";
import { sanitizeHtml } from "../sanitize";

/** Serialize the editor's current document to canonical (schema-shaped) HTML. */
export function docToHtml(editor: Editor): string {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const fragment = DOMSerializer.fromSchema(view.state.schema).serializeFragment(
      view.state.doc.content,
    );
    const container = document.createElement("div");
    container.appendChild(fragment);
    return container.innerHTML;
  });
}

/**
 * Replace the editor's entire document with the result of parsing `html`. The
 * input is sanitized (§3.3) before parsing, then mapped onto the live schema;
 * markup the schema cannot represent is dropped, never rendered raw.
 */
export function htmlToDoc(editor: Editor, html: string): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const body = new DOMParser().parseFromString(sanitizeHtml(html), "text/html").body;
    const doc = ProseDOMParser.fromSchema(view.state.schema).parse(body);
    // Same whole-document swap Milkdown's `replaceAll` uses for markdown, so the
    // two formats share one replace path (history + plugins preserved).
    const tr = view.state.tr;
    tr.replace(0, view.state.doc.content.size, new Slice(doc.content, 0, 0));
    tr.setSelection(Selection.atEnd(tr.doc));
    view.dispatch(tr);
  });
}
