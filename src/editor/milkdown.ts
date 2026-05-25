// Milkdown WYSIWYG setup (CLAUDE.md §6). Phase 1 wires the inline editing core:
// CommonMark + GFM (tables, task lists, strikethrough) + a change listener.
// Phase 3 adds emoji shortcodes (`:smile:` → 😄). Math is deferred — its only
// Milkdown plugin is deprecated (§8). Plugins are added here, never by
// hand-rolling ProseMirror nodes (§11).
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { emoji } from "@milkdown/plugin-emoji";
import { nord } from "@milkdown/theme-nord";

export interface CreateEditorOptions {
  /** Element the editor mounts into. */
  root: HTMLElement;
  /** Initial markdown to load. */
  initial?: string;
  /** Called whenever the document changes (user edits or programmatic loads). */
  onChange?: () => void;
}

/** Create and mount a Milkdown editor. Resolves once it is ready. */
export function createEditor(options: CreateEditorOptions): Promise<Editor> {
  const { root, initial = "", onChange } = options;
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initial);
      if (onChange) {
        ctx.get(listenerCtx).markdownUpdated(() => onChange());
      }
    })
    .config(nord)
    .use(commonmark)
    .use(gfm)
    .use(emoji)
    .use(listener)
    .create();
}
