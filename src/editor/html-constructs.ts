// Richer HTML document constructs (CLAUDE.md §6), for the HTML editable format.
//
// AI assistants emitting HTML reach for doc structures beyond CommonMark+GFM —
// callouts/admonitions, collapsible <details>, highlights, definition lists. We
// add them to the shared ProseMirror schema as Milkdown `$node`/`$mark` (never
// hand-rolled ProseMirror — §11), driven by DOM specs (parseDOM/toDOM) so they
// round-trip losslessly through the HTML path (DOMParser/DOMSerializer in
// html-serializer.ts).
//
// These have no CommonMark syntax, so their markdown runners are degraders, not
// real syntax: parseMarkdown never matches (nothing in markdown produces them),
// and toMarkdown preserves *content* rather than the wrapper. Blocks render their
// children (`state.next(node.content)`); MARKS are a deliberate no-op — the mark
// wrapper is simply dropped and the inner text flows through the normal text
// serializer (wrapping in an empty mark type produces an invalid mdast node that
// remark cannot stringify). So markdown-serializing an HTML doc — which happens
// on Export HTML/RTF (§7), they always go through docToMarkdown — degrades
// gracefully instead of crashing, and `.md` files never contain these in the
// first place, so the single-canonical-serializer rule holds per format (§3.2).
// Block runner bodies use a `{ … }` block so they return void (SerializerState's
// chaining methods return `this`, not a valid spec return). Runners are inlined
// per schema so Milkdown contextually types them.
import { $markSchema, $nodeSchema } from "@milkdown/kit/utils";

const neverParsesMarkdown = { match: () => false, runner: () => {} };

/** A mark with no markdown form: never parses, and on serialize drops the mark
 *  wrapper (the inner text is emitted by the text serializer regardless). */
const inlinePassthroughMarkdown = (name: string) => ({
  parseMarkdown: neverParsesMarkdown,
  toMarkdown: { match: (mark: { type: { name: string } }) => mark.type.name === name, runner: () => {} },
});

// ---- Inline marks ----------------------------------------------------------

/** `<mark>` highlight. */
export const highlightSchema = $markSchema("highlight", () => ({
  parseDOM: [{ tag: "mark" }],
  toDOM: () => ["mark", 0],
  ...inlinePassthroughMarkdown("highlight"),
}));

/** `<sub>` subscript. */
export const subscriptSchema = $markSchema("subscript", () => ({
  parseDOM: [{ tag: "sub" }],
  toDOM: () => ["sub", 0],
  ...inlinePassthroughMarkdown("subscript"),
}));

/** `<sup>` superscript. */
export const superscriptSchema = $markSchema("superscript", () => ({
  parseDOM: [{ tag: "sup" }],
  toDOM: () => ["sup", 0],
  ...inlinePassthroughMarkdown("superscript"),
}));

// ---- Block nodes -----------------------------------------------------------

/**
 * `<div class="callout callout-<kind>">` admonition box. `kind` carries the
 * flavor (note / tip / warning / …) AI HTML commonly uses; it defaults to "note".
 *
 * The kind is encoded in the CLASS, not a `data-` attribute: sanitize.ts runs
 * with `ALLOW_DATA_ATTR: false` (§3.3), which strips `data-*` on load, so a
 * `data-callout` would be lost. `class` survives sanitization, so the flavor
 * round-trips. We also accept a bare `data-callout` on parse for inbound AI HTML.
 */
export const calloutSchema = $nodeSchema("callout", () => ({
  group: "block",
  content: "block+",
  defining: true,
  attrs: { kind: { default: "note" } },
  parseDOM: [
    {
      tag: "div.callout",
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const fromClass = /\bcallout-(\w+)\b/.exec(el.className)?.[1];
        const fromData = el.getAttribute("data-callout");
        return { kind: fromClass || fromData || "note" };
      },
    },
  ],
  toDOM: (node) => ["div", { class: `callout callout-${node.attrs.kind as string}` }, 0],
  parseMarkdown: neverParsesMarkdown,
  toMarkdown: {
    match: (node) => node.type.name === "callout",
    runner: (state, node) => {
      state.next(node.content);
    },
  },
}));

/** `<summary>` — the always-visible label of a <details>. Only valid inside it. */
export const summarySchema = $nodeSchema("summary", () => ({
  content: "inline*",
  defining: true,
  parseDOM: [{ tag: "summary" }],
  toDOM: () => ["summary", 0],
  parseMarkdown: neverParsesMarkdown,
  toMarkdown: {
    match: (node) => node.type.name === "summary",
    runner: (state, node) => {
      state.next(node.content);
    },
  },
}));

/** `<details open>` collapsible, holding a <summary> then block content. */
export const detailsSchema = $nodeSchema("details", () => ({
  group: "block",
  content: "summary block+",
  defining: true,
  attrs: { open: { default: false } },
  parseDOM: [
    {
      tag: "details",
      getAttrs: (dom) => ({ open: (dom as HTMLElement).hasAttribute("open") }),
    },
  ],
  toDOM: (node) => ["details", node.attrs.open ? { open: "" } : {}, 0],
  parseMarkdown: neverParsesMarkdown,
  toMarkdown: {
    match: (node) => node.type.name === "details",
    runner: (state, node) => {
      state.next(node.content);
    },
  },
}));

/** `<dt>` definition term. */
export const definitionTermSchema = $nodeSchema("definition_term", () => ({
  content: "inline*",
  defining: true,
  parseDOM: [{ tag: "dt" }],
  toDOM: () => ["dt", 0],
  parseMarkdown: neverParsesMarkdown,
  toMarkdown: {
    match: (node) => node.type.name === "definition_term",
    runner: (state, node) => {
      state.next(node.content);
    },
  },
}));

/** `<dd>` definition description. */
export const definitionDescriptionSchema = $nodeSchema("definition_description", () => ({
  content: "block+",
  defining: true,
  parseDOM: [{ tag: "dd" }],
  toDOM: () => ["dd", 0],
  parseMarkdown: neverParsesMarkdown,
  toMarkdown: {
    match: (node) => node.type.name === "definition_description",
    runner: (state, node) => {
      state.next(node.content);
    },
  },
}));

/** `<dl>` definition list of term/description pairs. */
export const definitionListSchema = $nodeSchema("definition_list", () => ({
  group: "block",
  content: "(definition_term | definition_description)+",
  defining: true,
  parseDOM: [{ tag: "dl" }],
  toDOM: () => ["dl", 0],
  parseMarkdown: neverParsesMarkdown,
  toMarkdown: {
    match: (node) => node.type.name === "definition_list",
    runner: (state, node) => {
      state.next(node.content);
    },
  },
}));

/**
 * All richer HTML constructs as a single Milkdown plugin bundle. Used by both the
 * app editor (`createEditor`) and the HTML round-trip gate so the schema under
 * test is exactly the one that ships.
 */
export const htmlConstructs = [
  highlightSchema,
  subscriptSchema,
  superscriptSchema,
  calloutSchema,
  summarySchema,
  detailsSchema,
  definitionTermSchema,
  definitionDescriptionSchema,
  definitionListSchema,
].flat();
