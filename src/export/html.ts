// Standalone HTML export document builder (CLAUDE.md §7).
//
// Takes an ALREADY-SANITIZED HTML body (the caller runs comrak output through
// sanitize.ts first — §3.3) and wraps it in a self-contained document with an
// inlined stylesheet, so the export opens cleanly in any browser with no
// external assets. The chosen theme's light/dark palette is inlined to match
// what the user sees in the editor.
//
// This module never touches the filesystem and never renders to the live DOM;
// it only assembles a string, which `export_html` (Rust) writes atomically.

export interface ExportOptions {
  /** Document title (also the <h1>-less <title>); shown in the browser tab. */
  title: string;
  /** Render with the dark palette (the caller resolves "system" first). */
  dark: boolean;
}

/** Minimal HTML-escape for text interpolated into attributes/elements. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A compact, print-friendly stylesheet. Two palettes; the relevant one is
// inlined per export so the file is fully standalone.
const BASE_CSS = `
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #6b7280;
    --border: #e5e7eb; --code-bg: #f0f0f3; --link: #2563eb;
  }
  :root[data-dark] {
    --bg: #1e1e22; --fg: #e8e8ea; --muted: #9aa0a6;
    --border: #34343a; --code-bg: #2a2a30; --link: #7ab7ff;
  }
  html { color-scheme: light dark; }
  body {
    max-width: 720px; margin: 2.5rem auto; padding: 0 1.25rem;
    background: var(--bg); color: var(--fg);
    font: 16px/1.6 Inter, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
  a { color: var(--link); }
  blockquote {
    margin: 1rem 0; padding: 0.25rem 0 0.25rem 1rem;
    border-left: 4px solid var(--border); color: var(--muted);
  }
  code {
    background: var(--code-bg); padding: 0.1em 0.3em; border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em;
  }
  pre { background: var(--code-bg); padding: 1rem; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--border); padding: 0.4rem 0.7rem; }
  th { background: var(--code-bg); }
  img { max-width: 100%; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 2rem 0; }
`;

/**
 * Assemble a complete, self-contained HTML document around a sanitized body.
 * @param sanitizedBody HTML that has ALREADY passed through `sanitizeHtml` (§3.3).
 */
export function buildStandaloneHtml(sanitizedBody: string, opts: ExportOptions): string {
  const darkAttr = opts.dark ? " data-dark" : "";
  return `<!doctype html>
<html lang="en"${darkAttr}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(opts.title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${sanitizedBody}
</body>
</html>
`;
}
