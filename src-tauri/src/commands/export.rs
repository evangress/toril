//! Export commands (CLAUDE.md §5, §7). All disk access stays in Rust (§10).
//!
//! Sanitization is intentionally NOT here. `markdown_to_html` returns untrusted
//! HTML (comrak with raw-HTML pass-through); the frontend runs it through
//! `sanitize.ts` (the single DOMPurify chokepoint, §3.3) and builds the
//! standalone document, then hands the finished, sanitized HTML to
//! `export_html` to write. Keeping comrak in the testable `mdhtml` crate and
//! sanitizing on the frontend means exactly one sanitization path.

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Render canonical markdown to an HTML body fragment (comrak via `mdhtml`, §7).
/// UNTRUSTED — the frontend MUST sanitize this before rendering/writing (§3.3).
#[tauri::command]
pub fn markdown_to_html(content: String) -> String {
    mdhtml::to_html(&content)
}

/// Prompt for a destination with the native save dialog and atomically write a
/// complete HTML document. `html` is expected to be already sanitized and
/// templated by the frontend. Returns the chosen path, or `None` if cancelled.
#[tauri::command]
pub fn export_html(
    app: AppHandle,
    html: String,
    default_name: String,
) -> Result<Option<String>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("HTML", &["html", "htm"])
        .set_file_name(&default_name)
        .blocking_save_file()
    else {
        return Ok(None); // user cancelled
    };

    let path = file_path.into_path().map_err(|e| e.to_string())?;
    fsatomic::atomic_write(&path, html.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
