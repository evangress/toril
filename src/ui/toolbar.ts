// Formatting toolbar for the edit pane (CLAUDE.md §6, §8 Phase 3).
//
// THE RULE (§3.2): every button drives a Milkdown/ProseMirror command via the
// editor's `callCommand` (or, for the few things without a command, a plain
// ProseMirror transaction). A button NEVER inserts raw markdown characters as
// text. That keeps the document in one canonical form and routes every change
// through serializer.ts like any other edit — no second conversion path. The
// `tests/toolbar.test.ts` gate asserts exactly this: applying a format via a
// command yields the same canonical markdown as typing the syntax, and the
// document never contains the literal syntax characters as text.
//
// Coverage (the MarkText menu + Markdown Guide cheat sheet, restricted to what
// round-trips losslessly today): headings H1–H6 + paragraph, bold, italic,
// strikethrough, inline code, bullet/ordered/task lists, blockquote, fenced
// code block, horizontal rule, link, image, table, emoji, clear-formatting.
//
// Deliberately NOT here (would inject non-portable syntax — same policy as the
// deferred math plugin, §2/§8):
//   • underline — no markdown form (MarkText emits raw <u>); breaks plain-.md.
//   • front matter — not yet lossless (§0); there is no front-matter plugin
//     loaded, so a button could only insert raw `---` text. Add it once front
//     matter round-trips (its fixtures land in roundtrip.test.ts then).
//   • footnote, heading id, definition list, highlight, sub/superscript, math —
//     deferred until a healthy plugin + lossless round-trip exist (§8).
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { callCommand } from "@milkdown/kit/utils";
import type { $Command } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import {
  createCodeBlockCommand,
  insertHrCommand,
  insertImageCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";

// ---- Command layer (pure, no DOM) ------------------------------------------
// Each function takes the editor and runs a Milkdown command or a ProseMirror
// transaction. Exported so the gate test can exercise them without the DOM.

/** Run a Milkdown command through `callCommand` — the canonical edit path. */
function run<T>(editor: Editor, command: $Command<T>, payload?: T): void {
  editor.action(callCommand(command.key, payload));
}

export interface LinkPayload {
  href: string;
  title?: string;
}
export interface ImagePayload {
  src: string;
  alt?: string;
  title?: string;
}

/** Find the innermost `list_item` enclosing the selection head, if any. */
function findListItem(state: EditorState): { node: ProseNode; pos: number } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "list_item") return { node, pos: $from.before(d) };
  }
  return null;
}

/**
 * Toggle the current line between a plain list item and an unchecked task item.
 * GFM task lists have no dedicated command — they are a `checked` attribute on
 * `list_item` (null = plain, false = unchecked, true = done). We first ensure a
 * list context via `wrapInBulletListCommand`, then flip the attribute through a
 * transaction. No raw `- [ ]` text is ever inserted (§3.2).
 */
function toggleTaskList(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (!findListItem(view.state)) {
      callCommand(wrapInBulletListCommand.key)(ctx); // wrap the paragraph first
    }
    const found = findListItem(view.state);
    if (!found) return;
    const next = found.node.attrs.checked == null ? false : null;
    const { state } = view;
    view.dispatch(state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, checked: next }));
  });
}

/**
 * Strip every inline mark (bold/italic/strike/code/link) from the selection.
 * Block type is left alone — use the heading control's "Paragraph" entry to
 * clear block formatting. Operates on the document via a transaction.
 */
function clearFormatting(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { from, to, empty } = state.selection;
    if (empty) return;
    view.dispatch(state.tr.removeMark(from, to)); // null mark = remove all
  });
}

/**
 * Insert a unicode emoji character at the caret. The canonical form of an emoji
 * is the unicode codepoint itself (the round-trip gate authors `🚀`, and
 * `:shortcode:` normalizes to it), so inserting the character — exactly what
 * typing the emoji on a keyboard produces — is lossless and idempotent. We
 * insert the char, not the `:shortcode:` text, precisely to stay canonical.
 */
function insertEmoji(editor: Editor, emoji: string): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.insertText(emoji).scrollIntoView());
  });
}

/** The full command surface, keyed by action id. Used by the UI and the gate. */
export const editorCommands = {
  heading: (editor: Editor, level: number) => run(editor, wrapInHeadingCommand, level),
  paragraph: (editor: Editor) => run(editor, turnIntoTextCommand),
  bold: (editor: Editor) => run(editor, toggleStrongCommand),
  italic: (editor: Editor) => run(editor, toggleEmphasisCommand),
  strikethrough: (editor: Editor) => run(editor, toggleStrikethroughCommand),
  inlineCode: (editor: Editor) => run(editor, toggleInlineCodeCommand),
  bulletList: (editor: Editor) => run(editor, wrapInBulletListCommand),
  orderedList: (editor: Editor) => run(editor, wrapInOrderedListCommand),
  taskList: toggleTaskList,
  blockquote: (editor: Editor) => run(editor, wrapInBlockquoteCommand),
  codeBlock: (editor: Editor) => run(editor, createCodeBlockCommand),
  hr: (editor: Editor) => run(editor, insertHrCommand),
  table: (editor: Editor) => run(editor, insertTableCommand),
  link: (editor: Editor, payload: LinkPayload) => run(editor, toggleLinkCommand, payload),
  image: (editor: Editor, payload: ImagePayload) => run(editor, insertImageCommand, payload),
  emoji: insertEmoji,
  clearFormatting,
} as const;

// ---- Active-state inspection -----------------------------------------------

export interface ActiveState {
  /** Mark schema names active across the selection (strong/emphasis/…). */
  marks: Set<string>;
  /** Heading level 1–6 if the selection's block is a heading, else null. */
  headingLevel: number | null;
  inBulletList: boolean;
  inOrderedList: boolean;
  /** The enclosing list item is a (checked or unchecked) task. */
  isTask: boolean;
}

function isMarkActive(state: EditorState, markName: string): boolean {
  const type = state.schema.marks[markName];
  if (!type) return false;
  const { from, $from, to, empty } = state.selection;
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
}

/** Read which formats are active at the current selection, for button styling. */
export function activeState(editor: Editor): ActiveState {
  let result: ActiveState = {
    marks: new Set(),
    headingLevel: null,
    inBulletList: false,
    inOrderedList: false,
    isTask: false,
  };
  editor.action((ctx) => {
    const { state } = ctx.get(editorViewCtx);
    const marks = new Set<string>();
    for (const name of ["strong", "emphasis", "inlineCode", "strike_through", "link"]) {
      if (isMarkActive(state, name)) marks.add(name);
    }
    const { $from } = state.selection;
    let headingLevel: number | null = null;
    let inBulletList = false;
    let inOrderedList = false;
    let isTask = false;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      switch (node.type.name) {
        case "heading":
          headingLevel = typeof node.attrs.level === "number" ? node.attrs.level : null;
          break;
        case "bullet_list":
          inBulletList = true;
          break;
        case "ordered_list":
          inOrderedList = true;
          break;
        case "list_item":
          if (node.attrs.checked != null) isTask = true;
          break;
      }
    }
    result = { marks, headingLevel, inBulletList, inOrderedList, isTask };
  });
  return result;
}

// ---- DOM component ----------------------------------------------------------

const EMOJI_PICKS = [
  "😀", "😄", "😉", "😍", "😎", "🤔", "😢", "😡",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🎉", "🔥",
  "✅", "❌", "⚠️", "💡", "⭐", "❤️", "🚀", "📝",
];

interface ButtonSpec {
  id: keyof typeof editorCommands | "link" | "image";
  label: string;
  title: string;
  /** Mark name this button reflects when active (lights up). */
  mark?: string;
}

// Inline marks first, then block structures. Grouped with separators in render.
const MARK_BUTTONS: ButtonSpec[] = [
  { id: "bold", label: "B", title: "Bold", mark: "strong" },
  { id: "italic", label: "I", title: "Italic", mark: "emphasis" },
  { id: "strikethrough", label: "S", title: "Strikethrough", mark: "strike_through" },
  { id: "inlineCode", label: "</>", title: "Inline code", mark: "inlineCode" },
  { id: "link", label: "🔗", title: "Link", mark: "link" },
  { id: "image", label: "🖼", title: "Image" },
];

const BLOCK_BUTTONS: ButtonSpec[] = [
  { id: "bulletList", label: "•", title: "Bullet list" },
  { id: "orderedList", label: "1.", title: "Ordered list" },
  { id: "taskList", label: "☑", title: "Task list" },
  { id: "blockquote", label: "❝", title: "Blockquote" },
  { id: "codeBlock", label: "{ }", title: "Code block" },
  { id: "table", label: "▦", title: "Table" },
  { id: "hr", label: "—", title: "Horizontal rule" },
];

/**
 * The formatting toolbar mounted above the editor. Holds a reference to the one
 * shared editor instance and refreshes its active-state highlighting on
 * selection changes in the editor surface.
 */
export class FormattingToolbar {
  private readonly markButtons = new Map<string, HTMLButtonElement>();
  private headingSelect!: HTMLSelectElement;
  private bulletBtn?: HTMLButtonElement;
  private orderedBtn?: HTMLButtonElement;
  private taskBtn?: HTMLButtonElement;
  private rafId = 0;
  private readonly onSelectionChange = () => this.scheduleRefresh();

  constructor(
    private readonly container: HTMLElement,
    private readonly editor: Editor,
    private readonly editorRoot: HTMLElement,
  ) {
    this.build();
    // Selection moves don't fire the markdown listener, so watch the surface
    // directly to keep button highlighting in sync.
    this.editorRoot.addEventListener("keyup", this.onSelectionChange);
    this.editorRoot.addEventListener("mouseup", this.onSelectionChange);
    document.addEventListener("selectionchange", this.onSelectionChange);
  }

  destroy(): void {
    this.editorRoot.removeEventListener("keyup", this.onSelectionChange);
    this.editorRoot.removeEventListener("mouseup", this.onSelectionChange);
    document.removeEventListener("selectionchange", this.onSelectionChange);
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  // Run a command, then refocus the editor and refresh state. Wrapping the call
  // keeps focus in the editor so the user can keep typing after clicking.
  private dispatch(fn: (editor: Editor) => void): void {
    fn(this.editor);
    this.editor.action((ctx) => ctx.get(editorViewCtx).focus());
    this.refresh();
  }

  private makeButton(spec: ButtonSpec, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fmt-btn";
    btn.textContent = spec.label;
    btn.title = spec.title;
    // mousedown, not click: prevents the editor selection from collapsing
    // before the command runs.
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  }

  private addSeparator(): void {
    const sep = document.createElement("span");
    sep.className = "fmt-sep";
    sep.setAttribute("aria-hidden", "true");
    this.container.append(sep);
  }

  private build(): void {
    this.container.replaceChildren();
    this.container.setAttribute("role", "toolbar");
    this.container.setAttribute("aria-label", "Formatting");

    // Heading / paragraph block-type selector.
    const select = document.createElement("select");
    select.className = "fmt-heading";
    select.title = "Paragraph & headings";
    const levels: [string, string][] = [
      ["p", "Paragraph"],
      ["1", "Heading 1"],
      ["2", "Heading 2"],
      ["3", "Heading 3"],
      ["4", "Heading 4"],
      ["5", "Heading 5"],
      ["6", "Heading 6"],
    ];
    for (const [value, text] of levels) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      select.append(opt);
    }
    select.addEventListener("change", () => {
      const v = select.value;
      this.dispatch((editor) =>
        v === "p" ? editorCommands.paragraph(editor) : editorCommands.heading(editor, Number(v)),
      );
    });
    this.headingSelect = select;
    this.container.append(select);
    this.addSeparator();

    // Inline marks.
    for (const spec of MARK_BUTTONS) {
      const btn = this.makeButton(spec, () => this.onButton(spec));
      if (spec.mark) this.markButtons.set(spec.mark, btn);
      this.container.append(btn);
    }
    this.addSeparator();

    // Block structures.
    for (const spec of BLOCK_BUTTONS) {
      const btn = this.makeButton(spec, () => this.onButton(spec));
      if (spec.id === "bulletList") this.bulletBtn = btn;
      if (spec.id === "orderedList") this.orderedBtn = btn;
      if (spec.id === "taskList") this.taskBtn = btn;
      this.container.append(btn);
    }
    this.addSeparator();

    // Emoji picker + clear formatting.
    this.container.append(this.buildEmojiPicker());
    const clearBtn = this.makeButton(
      { id: "clearFormatting", label: "⌫", title: "Clear formatting" },
      () => this.dispatch(editorCommands.clearFormatting),
    );
    this.container.append(clearBtn);

    this.refresh();
  }

  private onButton(spec: ButtonSpec): void {
    switch (spec.id) {
      case "link": {
        const href = window.prompt("Link URL:");
        if (href) this.dispatch((editor) => editorCommands.link(editor, { href }));
        return;
      }
      case "image": {
        const src = window.prompt("Image URL:");
        if (!src) return;
        const alt = window.prompt("Alt text (optional):") ?? undefined;
        this.dispatch((editor) => editorCommands.image(editor, { src, alt }));
        return;
      }
      default: {
        const fn = editorCommands[spec.id as keyof typeof editorCommands];
        // The remaining specs all map to no-argument commands.
        this.dispatch(fn as (editor: Editor) => void);
      }
    }
  }

  private buildEmojiPicker(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "fmt-emoji";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "fmt-btn";
    trigger.textContent = "😊";
    trigger.title = "Insert emoji";

    const menu = document.createElement("div");
    menu.className = "fmt-emoji-menu";
    menu.hidden = true;
    for (const emoji of EMOJI_PICKS) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "fmt-emoji-item";
      item.textContent = emoji;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        menu.hidden = true;
        this.dispatch((editor) => editorCommands.emoji(editor, emoji));
      });
      menu.append(item);
    }

    trigger.addEventListener("mousedown", (e) => {
      e.preventDefault();
      menu.hidden = !menu.hidden;
    });
    // Dismiss the menu when focus/click leaves the picker.
    document.addEventListener("mousedown", (e) => {
      if (!wrap.contains(e.target as Node)) menu.hidden = true;
    });

    wrap.append(trigger, menu);
    return wrap;
  }

  private scheduleRefresh(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.refresh();
    });
  }

  /** Recompute active state and reflect it on the controls. */
  refresh(): void {
    const state = activeState(this.editor);
    for (const [mark, btn] of this.markButtons) {
      btn.dataset.active = String(state.marks.has(mark));
    }
    this.headingSelect.value = state.headingLevel ? String(state.headingLevel) : "p";
    if (this.bulletBtn) this.bulletBtn.dataset.active = String(state.inBulletList && !state.isTask);
    if (this.orderedBtn) this.orderedBtn.dataset.active = String(state.inOrderedList);
    if (this.taskBtn) this.taskBtn.dataset.active = String(state.isTask);
  }
}
