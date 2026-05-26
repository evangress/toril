// HTML export tests (CLAUDE.md §7, §3.3). Covers the standalone-document
// builder and — crucially — the sanitization chokepoint: the comrak-rendered
// body is untrusted and MUST be cleaned by sanitize.ts before it lands in the
// exported file. comrak itself runs in Rust (`cargo test -p mdhtml`); here we
// guard the frontend half of the pipeline.
import { describe, expect, it } from "vitest";
import { buildStandaloneHtml } from "../src/export/html";
import { sanitizeHtml } from "../src/sanitize";

describe("buildStandaloneHtml", () => {
  it("wraps a sanitized body into a self-contained document", () => {
    const out = buildStandaloneHtml("<h1>Hello</h1>", { title: "Notes", dark: false });
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("<title>Notes</title>");
    expect(out).toContain("<h1>Hello</h1>");
    expect(out).toContain("<style>"); // CSS is inlined → standalone
    expect(out).toContain("<html lang=\"en\">"); // light export — no data-dark on <html>
  });

  it("marks the document dark when requested", () => {
    const out = buildStandaloneHtml("<p>x</p>", { title: "t", dark: true });
    expect(out).toContain("<html lang=\"en\" data-dark>");
  });

  it("escapes the title to avoid breaking out of <title>", () => {
    const out = buildStandaloneHtml("<p>x</p>", { title: "</title><script>x</script>", dark: false });
    expect(out).not.toContain("<title></title><script>");
    expect(out).toContain("&lt;/title&gt;&lt;script&gt;");
  });
});

describe("export sanitization chokepoint (§3.3)", () => {
  it("strips hostile HTML from comrak-like output before it is templated", () => {
    // What comrak (unsafe_) would emit for hostile markdown — raw script passes
    // through the renderer precisely so this chokepoint can remove it.
    const dirty = "<p>ok</p><script>steal()</script><img src=x onerror=alert(1)>";
    const safe = sanitizeHtml(dirty);
    expect(safe).not.toContain("<script>");
    expect(safe).not.toContain("onerror");
    expect(safe).toContain("<p>ok</p>"); // legitimate content survives

    const doc = buildStandaloneHtml(safe, { title: "t", dark: false });
    expect(doc).not.toContain("<script>steal");
    expect(doc).not.toContain("onerror");
  });
});
