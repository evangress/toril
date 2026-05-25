//! Atomic, fsync-backed file writes — the data-safety core for Toril (CLAUDE.md §3.1).
//!
//! A save must never corrupt or truncate an existing note, even on a crash or
//! power loss mid-write. We guarantee this with the standard temp-file dance:
//!
//! 1. Write the new contents to a fresh temp file **in the same directory**.
//! 2. `flush` + `fsync` the temp file so its bytes are durably on disk.
//! 3. Atomically `rename` the temp over the target (a same-filesystem rename is
//!    atomic on every OS we target).
//! 4. Best-effort `fsync` the directory so the rename itself is durable.
//!
//! Because the target is only ever touched by the atomic rename, a crash at any
//! earlier point leaves the original file completely intact.

use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Read a UTF-8 text file. Thin wrapper kept here so all of Toril's file I/O
/// flows through one audited module.
pub fn read_to_string(path: impl AsRef<Path>) -> io::Result<String> {
    fs::read_to_string(path)
}

/// Atomically write `contents` to `path`, replacing any existing file.
///
/// On success the file holds exactly `contents`. On any error the original file
/// (if it existed) is left untouched and no partial temp file is leaked.
pub fn atomic_write(path: impl AsRef<Path>, contents: &[u8]) -> io::Result<()> {
    let path = path.as_ref();
    let dir = parent_dir(path);

    // Phase 1: durably write the new bytes to a temp file beside the target.
    let tmp = write_temp(dir, path, contents)?;

    // Phase 2: atomically swap it into place. Clean up the temp on failure so a
    // failed save never leaves litter next to the user's note.
    if let Err(e) = commit(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }

    // Phase 3: best-effort durability of the rename itself. Directory fsync is
    // not supported everywhere (notably Windows); failure here is not fatal.
    let _ = fsync_dir(dir);
    Ok(())
}

/// The directory that will hold both the temp file and the final target.
fn parent_dir(path: &Path) -> &Path {
    match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    }
}

/// Write `contents` to a fresh, unique temp file in `dir` and fsync it.
/// Returns the temp path. The target is **not** touched.
fn write_temp(dir: &Path, target: &Path, contents: &[u8]) -> io::Result<PathBuf> {
    let tmp = unique_temp_path(dir, target);
    let mut file = File::create(&tmp)?;
    match file
        .write_all(contents)
        .and_then(|_| file.flush())
        .and_then(|_| file.sync_all())
    {
        Ok(()) => Ok(tmp),
        Err(e) => {
            drop(file);
            let _ = fs::remove_file(&tmp);
            Err(e)
        }
    }
}

/// Atomically move the prepared temp file over the target.
fn commit(tmp: &Path, target: &Path) -> io::Result<()> {
    fs::rename(tmp, target)
}

/// Best-effort fsync of a directory so a completed rename survives a crash.
fn fsync_dir(dir: &Path) -> io::Result<()> {
    File::open(dir)?.sync_all()
}

/// Build a collision-resistant temp filename in `dir`, derived from the target
/// name. Hidden (leading dot) so it doesn't surface in file listings.
fn unique_temp_path(dir: &Path, target: &Path) -> PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let base = target
        .file_name()
        .map(|s| s.to_owned())
        .unwrap_or_else(|| OsString::from("toril"));

    let mut name = OsString::from(".");
    name.push(&base);
    name.push(format!(".tmp.{}.{}.{}", std::process::id(), nanos, n));
    dir.join(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A throwaway directory under the OS temp dir, removed on drop.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("fsatomic-{tag}-{nanos}"));
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn writes_then_reads_back_utf8() {
        let dir = TempDir::new("rw");
        let f = dir.path("note.md");
        let content = "# Hello\n\nUnicode: café — 日本語 — 🐂\n";
        atomic_write(&f, content.as_bytes()).unwrap();
        assert_eq!(read_to_string(&f).unwrap(), content);
    }

    #[test]
    fn overwrite_fully_replaces_without_truncation_leftovers() {
        let dir = TempDir::new("overwrite");
        let f = dir.path("note.md");
        atomic_write(&f, b"a much longer original body here").unwrap();
        atomic_write(&f, b"short").unwrap();
        // If we had truncated/overwritten in place, stale tail bytes could remain.
        assert_eq!(fs::read(&f).unwrap(), b"short");
    }

    #[test]
    fn successful_save_leaves_no_temp_files() {
        let dir = TempDir::new("notemp");
        let f = dir.path("note.md");
        atomic_write(&f, b"content").unwrap();
        let leftovers: Vec<_> = fs::read_dir(&dir.0)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .filter(|n| n != "note.md")
            .collect();
        assert!(leftovers.is_empty(), "unexpected leftovers: {leftovers:?}");
    }

    /// The §3.1 GATE: a crash *between* writing the temp and the rename must
    /// leave the original file byte-for-byte intact. We simulate the crash by
    /// running phase 1 (`write_temp`) and then inspecting the target before
    /// `commit` would have run.
    #[test]
    fn interrupted_save_leaves_original_intact() {
        let dir = TempDir::new("interrupt");
        let f = dir.path("note.md");
        let original = "ORIGINAL — do not lose me\n";
        atomic_write(&f, original.as_bytes()).unwrap();

        // Phase 1 only — simulate the process dying right here.
        let tmp = write_temp(parent_dir(&f), &f, b"NEW CONTENT that never committed").unwrap();

        // The user's note is untouched: the rename never happened.
        assert_eq!(read_to_string(&f).unwrap(), original);
        // The new bytes live safely in the temp, not in the target.
        assert_eq!(fs::read(&tmp).unwrap(), b"NEW CONTENT that never committed");

        // Now let the commit happen and confirm the swap completes cleanly.
        commit(&tmp, &f).unwrap();
        assert_eq!(fs::read(&f).unwrap(), b"NEW CONTENT that never committed");
    }

    #[test]
    fn writes_into_directory_with_no_explicit_parent_component() {
        // path = just a filename; parent() is "" → must resolve to "."
        let dir = TempDir::new("cwd");
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&dir.0).unwrap();
        let result = atomic_write(Path::new("bare.md"), b"x");
        std::env::set_current_dir(prev).unwrap();
        result.unwrap();
        assert_eq!(fs::read(dir.path("bare.md")).unwrap(), b"x");
    }
}
