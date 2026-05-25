// Data-safety §3.3 gate: untrusted HTML must not be able to execute script.
//
// Two layers are asserted:
//   1. sanitizeHtml() strips scriptable markup but keeps benign formatting —
//      this is the chokepoint for any HTML we render (notably export).
//   2. The Milkdown editor renders embedded HTML from an opened file as inert
//      *text*, never as live markup. This guards the property that makes the
//      editing surface safe by construction; a Milkdown upgrade that changed it
//      would fail here before it could ship.
import { describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { sanitizeHtml } from "../src/sanitize";

describe("sanitizeHtml (§3.3 chokepoint)", () => {
  it("removes <script> elements", () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain("<p>hi</p>");
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain("onerror");
  });

  it("neutralizes javascript: URLs", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("drops iframes and other embedding sinks", () => {
    const out = sanitizeHtml('<iframe src="evil"></iframe><object></object>');
    expect(out.toLowerCase()).not.toContain("<iframe");
    expect(out.toLowerCase()).not.toContain("<object");
  });

  it("preserves benign markdown-export markup", () => {
    const html =
      '<h1>Title</h1><p><strong>b</strong> and <em>i</em></p>' +
      '<ul><li>one</li></ul>' +
      '<pre><code class="language-js">x</code></pre>' +
      '<a href="https://example.com">link</a>';
    const out = sanitizeHtml(html);
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<strong>b</strong>");
    expect(out).toContain("<code");
    expect(out).toContain('href="https://example.com"');
  });
});

describe("editor renders untrusted HTML as inert text (§3.3)", () => {
  async function renderToDom(md: string): Promise<HTMLElement> {
    const root = document.createElement("div");
    document.body.appendChild(root);
    await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, md);
      })
      .use(commonmark)
      .use(gfm)
      .create();
    return root;
  }

  it("does not create live <script> elements from file content", async () => {
    const root = await renderToDom("Before\n\n<script>alert(1)</script>\n\nAfter\n");
    expect(root.querySelector("script")).toBeNull();
    // the literal markup survives as visible text
    expect(root.textContent).toContain("<script>alert(1)</script>");
  });

  it("does not execute inline HTML like <img onerror>", async () => {
    const root = await renderToDom("see <img src=x onerror=alert(1)> here\n");
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img");
  });
});
