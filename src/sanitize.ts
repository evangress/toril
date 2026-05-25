// HTML sanitization — the single chokepoint for §3.3 (Data Safety, NON-NEGOTIABLE).
//
// Rule (CLAUDE.md §3.3 / §10): an opened `.md` file (or pasted content) is
// untrusted and may carry hostile HTML. Anything we render as *real* HTML in the
// webview MUST pass through here first, so embedded markup cannot execute script.
//
// Scope note — where untrusted HTML actually reaches the DOM in Toril:
//   • The Milkdown editor is safe by construction: its `html` node renders raw
//     inline/block HTML as inert *text* (textContent), never as live markup, and
//     ProseMirror reconstructs pasted content from the schema rather than
//     injecting raw HTML. (Guarded by a regression test in tests/security.test.ts.)
//   • The real HTML sink is **export** (Phase 3): comrak-rendered HTML that gets
//     opened in a browser or printed via a hidden webview. That output is run
//     through `sanitizeHtml` before it is rendered.
// If any code path ever needs `innerHTML`/`insertAdjacentHTML` with file-derived
// content, it goes through this module — never raw.
import DOMPurify, { type Config } from "dompurify";

// Conservative allow-list. DOMPurify's defaults already strip <script>, inline
// event handlers (on*), and `javascript:`/unknown-protocol URLs; we additionally
// forbid the obvious scriptable/embedding sinks as defense-in-depth and disallow
// arbitrary data-* attributes. (KaTeX math is deferred — §8 — so SVG/MathML are
// intentionally out of profile until that lands and this config is revisited.)
const CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "base",
    "noscript",
  ],
  ALLOW_DATA_ATTR: false,
};

/**
 * Sanitize an untrusted HTML string into one safe to render in the webview.
 * Strips scripts, event handlers, and dangerous URLs while preserving the
 * structural/formatting markup that markdown export produces.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG) as string;
}
