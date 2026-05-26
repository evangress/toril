//! Markdown → HTML rendering for export (CLAUDE.md §7), via comrak (§2).
//!
//! This produces an HTML **body fragment** from canonical markdown. The output
//! is deliberately rendered with raw HTML passed through (`render.unsafe_`),
//! because a `.md` file may legitimately contain inline HTML — and may also
//! carry *hostile* HTML (§3.3). Sanitizing is **not** done here: it is the
//! frontend `sanitize.ts` (DOMPurify) chokepoint's job, so there is exactly one
//! sanitization path. Callers MUST sanitize this string before it reaches the
//! DOM or a written file.
//!
//! Extensions match the editor's CommonMark + GFM surface (tables, strikethrough,
//! task lists, autolinks, footnotes) plus YAML front matter, which is parsed and
//! excluded from the rendered body rather than dumped as text.

use comrak::{Options, markdown_to_html};

/// Render canonical markdown to an HTML body fragment (GFM + front matter).
///
/// The result is UNTRUSTED HTML — sanitize it (§3.3) before rendering/writing.
pub fn to_html(markdown: &str) -> String {
    let mut options = Options::default();
    // GFM surface — mirror the editor (§6).
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;
    options.extension.footnotes = true;
    // YAML front matter: recognised and kept out of the rendered body.
    options.extension.front_matter_delimiter = Some("---".to_string());
    // Pass raw inline/block HTML through; the frontend sanitizes it (§3.3).
    options.render.r#unsafe = true;
    markdown_to_html(markdown, &options)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_commonmark() {
        let out = to_html("# Title\n\nA paragraph.\n");
        assert!(out.contains("<h1>"));
        assert!(out.contains("Title"));
        assert!(out.contains("<p>A paragraph."));
    }

    #[test]
    fn renders_gfm_table() {
        let out = to_html("| A | B |\n| - | - |\n| 1 | 2 |\n");
        assert!(out.contains("<table>"));
        assert!(out.contains("<th>A</th>"));
    }

    #[test]
    fn renders_strikethrough_and_tasklist() {
        assert!(to_html("~~gone~~\n").contains("<del>"));
        let task = to_html("- [x] done\n- [ ] todo\n");
        assert!(task.contains("type=\"checkbox\""));
        assert!(task.contains("checked"));
    }

    #[test]
    fn front_matter_is_excluded_from_the_body() {
        let out = to_html("---\ntitle: secret\n---\n\n# Heading\n");
        assert!(out.contains("Heading"));
        assert!(!out.contains("title: secret")); // parsed, not dumped as text
    }

    #[test]
    fn raw_html_passes_through_for_downstream_sanitization() {
        // unsafe_ is on by design: legitimate inline HTML survives…
        assert!(to_html("<b>bold</b>\n").contains("<b>bold</b>"));
        // …and so does hostile HTML — which is exactly why sanitize.ts (§3.3)
        // must run on this output before it is rendered or written.
        assert!(to_html("<script>alert(1)</script>\n").contains("<script>"));
    }
}
