//! Image commands (CLAUDE.md §5, §6). All disk access stays in Rust (§10).
//!
//! `save_clipboard_image` persists a pasted image beside the document and
//! returns the Markdown-relative path the editor links with `![](…)`. The
//! format-sniffing, content-hash naming, and atomic write live in the testable
//! `imgasset` crate; this is just the thin Tauri wrapper.

/// Persist pasted image `bytes` into `assets/` next to `doc_path`, returning the
/// document-relative path (`assets/<name>`). The frontend only calls this once
/// the document has a path (pasting into an unsaved doc is blocked there).
#[tauri::command]
pub fn save_clipboard_image(bytes: Vec<u8>, doc_path: String) -> Result<String, String> {
    imgasset::save_beside_doc(&bytes, &doc_path)
}
