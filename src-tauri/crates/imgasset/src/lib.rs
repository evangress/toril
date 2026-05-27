//! Save a pasted clipboard image beside a document (CLAUDE.md §6).
//!
//! The frontend intercepts a `paste` carrying image bytes and hands them here
//! with the document's path. We pick a file extension by sniffing the image's
//! magic bytes (no image decoding / no extra dependency), name the file by a
//! content hash so pasting the same image twice reuses one file, write it into
//! an `assets/` folder next to the document (atomically, §3.1), and return the
//! **document-relative** path (`assets/<name>`) for the editor to link with
//! `![](…)`. Keeping this beside the note keeps the vault portable (§1).

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;

/// Pick a file extension from the image's magic-byte prefix. Clipboard images
/// are almost always PNG (screenshots); anything unrecognised falls back to PNG.
pub fn detect_extension(bytes: &[u8]) -> &'static str {
    const PNG: &[u8] = &[0x89, 0x50, 0x4E, 0x47];
    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF];
    const GIF: &[u8] = b"GIF8";
    const BMP: &[u8] = b"BM";
    if bytes.starts_with(PNG) {
        "png"
    } else if bytes.starts_with(JPEG) {
        "jpg"
    } else if bytes.starts_with(GIF) {
        "gif"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "webp"
    } else if bytes.starts_with(BMP) {
        "bmp"
    } else {
        "png"
    }
}

/// A stable, content-derived file name (`pasted-<hash>.<ext>`). The same bytes
/// always yield the same name, so re-pasting an image de-duplicates rather than
/// piling up copies. Not cryptographic — just a collision-resistant file name.
pub fn asset_filename(bytes: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    format!(
        "pasted-{:016x}.{}",
        hasher.finish(),
        detect_extension(bytes)
    )
}

/// Write `bytes` into an `assets/` folder beside `doc_path` and return the
/// document-relative path (`assets/<name>`, forward slashes for Markdown).
/// Errors are stringified so the Tauri command can surface them directly.
pub fn save_beside_doc(bytes: &[u8], doc_path: &str) -> Result<String, String> {
    let parent = Path::new(doc_path)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "document has no containing folder".to_string())?;
    let assets = parent.join("assets");
    std::fs::create_dir_all(&assets).map_err(|e| e.to_string())?;
    let name = asset_filename(bytes);
    fsatomic::atomic_write(assets.join(&name), bytes).map_err(|e| e.to_string())?;
    Ok(format!("assets/{name}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn unique_dir(tag: &str) -> PathBuf {
        let mut h = DefaultHasher::new();
        std::time::SystemTime::now().hash(&mut h);
        tag.hash(&mut h);
        let dir = std::env::temp_dir().join(format!("imgasset-{}-{:x}", tag, h.finish()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const PNG_BYTES: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];

    #[test]
    fn detects_common_formats() {
        assert_eq!(detect_extension(PNG_BYTES), "png");
        assert_eq!(detect_extension(&[0xFF, 0xD8, 0xFF, 0xE0]), "jpg");
        assert_eq!(detect_extension(b"GIF89a..."), "gif");
        assert_eq!(detect_extension(b"BM....."), "bmp");
        let mut webp = b"RIFF".to_vec();
        webp.extend_from_slice(&[0, 0, 0, 0]);
        webp.extend_from_slice(b"WEBP");
        assert_eq!(detect_extension(&webp), "webp");
        assert_eq!(detect_extension(&[0, 1, 2, 3]), "png"); // unknown → png
    }

    #[test]
    fn filename_is_content_stable_and_extensioned() {
        let a = asset_filename(PNG_BYTES);
        let b = asset_filename(PNG_BYTES);
        assert_eq!(a, b); // same bytes → same name (dedup)
        assert!(a.starts_with("pasted-"));
        assert!(a.ends_with(".png"));
        assert_ne!(
            asset_filename(PNG_BYTES),
            asset_filename(&[0xFF, 0xD8, 0xFF, 9])
        );
    }

    #[test]
    fn writes_into_assets_and_returns_relative_path() {
        let dir = unique_dir("write");
        let doc = dir.join("note.md");
        let rel = save_beside_doc(PNG_BYTES, doc.to_str().unwrap()).unwrap();

        assert!(rel.starts_with("assets/"));
        assert!(rel.ends_with(".png"));
        let written = dir.join(&rel);
        assert!(written.exists());
        assert_eq!(std::fs::read(&written).unwrap(), PNG_BYTES);
    }

    #[test]
    fn re_pasting_same_image_reuses_one_file() {
        let dir = unique_dir("dedup");
        let doc = dir.join("note.md");
        let first = save_beside_doc(PNG_BYTES, doc.to_str().unwrap()).unwrap();
        let second = save_beside_doc(PNG_BYTES, doc.to_str().unwrap()).unwrap();
        assert_eq!(first, second);
        let count = std::fs::read_dir(dir.join("assets")).unwrap().count();
        assert_eq!(count, 1);
    }
}
