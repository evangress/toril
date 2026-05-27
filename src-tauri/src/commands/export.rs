//! Export commands (CLAUDE.md §5, §7). All disk access stays in Rust (§10).
//!
//! **HTML** is a two-step flow because its sink is the webview/browser: comrak
//! renders raw HTML (untrusted), the frontend runs it through `sanitize.ts` (the
//! single DOMPurify chokepoint, §3.3) and templates it, then `export_html`
//! writes the finished string. comrak lives in the testable `mdhtml` crate, so
//! there is exactly one sanitization path.
//!
//! **RTF** is one step (`export_rtf`): the `mdrtf` crate renders directly to RTF
//! and we write it here. No sanitization step is needed — RTF is inert, opened
//! by a word processor (not the webview), and `mdrtf` escapes all text and emits
//! any source HTML as literal characters, so nothing can inject RTF control
//! words. Rendering in Rust keeps it fully testable without the webview.

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Prompt for a destination via the native save dialog and atomically write
/// `bytes`. Returns the chosen path, or `None` if the user cancelled.
fn save_with_dialog(
    app: &AppHandle,
    label: &str,
    extensions: &[&str],
    default_name: &str,
    bytes: &[u8],
) -> Result<Option<String>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter(label, extensions)
        .set_file_name(default_name)
        .blocking_save_file()
    else {
        return Ok(None); // user cancelled
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    fsatomic::atomic_write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Render canonical markdown to an HTML body fragment (comrak via `mdhtml`, §7).
/// UNTRUSTED — the frontend MUST sanitize this before rendering/writing (§3.3).
#[tauri::command]
pub fn markdown_to_html(content: String) -> String {
    mdhtml::to_html(&content)
}

/// Atomically write a complete HTML document chosen via the save dialog.
/// `html` is expected to be already sanitized and templated by the frontend.
#[tauri::command]
pub fn export_html(
    app: AppHandle,
    html: String,
    default_name: String,
) -> Result<Option<String>, String> {
    save_with_dialog(
        &app,
        "HTML",
        &["html", "htm"],
        &default_name,
        html.as_bytes(),
    )
}

/// Render canonical markdown to RTF (`mdrtf`) and atomically write it to a
/// destination chosen via the save dialog. End-to-end in Rust; no webview or
/// sanitization step (the output is inert — see the module docs).
#[tauri::command]
pub fn export_rtf(
    app: AppHandle,
    content: String,
    default_name: String,
) -> Result<Option<String>, String> {
    let rtf = mdrtf::to_rtf(&content);
    save_with_dialog(
        &app,
        "Rich Text Format",
        &["rtf"],
        &default_name,
        rtf.as_bytes(),
    )
}
