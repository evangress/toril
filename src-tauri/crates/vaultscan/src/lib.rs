//! Recursive markdown-tree scanner for a Toril workspace (CLAUDE.md §5,
//! `open_folder`). Walks a folder and returns the tree of directories and
//! `.md` files, which the sidebar renders.
//!
//! Rules, chosen so the tree stays useful on a real (possibly Obsidian) vault:
//! - Hidden entries (name starting with `.`) are skipped — this drops `.git`,
//!   `.obsidian`, etc.
//! - Only `.md` / `.markdown` files are listed.
//! - A directory is included only if its subtree contains at least one markdown
//!   file, so empty / asset-only folders don't clutter the tree.
//! - Entries are sorted directories-first, then case-insensitive by name.
//!
//! No Tauri dependency: the walk is pure `std` + `serde` and fully unit-tested.

use serde::Serialize;
use std::fs;
use std::io;
use std::path::Path;

/// A node in the workspace tree. Files have an empty `children` list.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct FileNode {
    pub name: String,
    /// Absolute path as a string, suitable to hand straight back to `open_file`.
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileNode>,
}

/// Scan `root` and return its markdown tree (see module docs for the rules).
pub fn scan(root: impl AsRef<Path>) -> io::Result<Vec<FileNode>> {
    scan_dir(root.as_ref())
}

fn scan_dir(dir: &Path) -> io::Result<Vec<FileNode>> {
    let mut nodes: Vec<FileNode> = Vec::new();

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue; // hidden: .git, .obsidian, dotfiles
        }
        let path = entry.path();
        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            let children = scan_dir(&path)?;
            if !children.is_empty() {
                nodes.push(FileNode {
                    name,
                    path: path.to_string_lossy().into_owned(),
                    is_dir: true,
                    children,
                });
            }
        } else if file_type.is_file() && is_markdown(&name) {
            nodes.push(FileNode {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir: false,
                children: Vec::new(),
            });
        }
    }

    nodes.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir) // directories first
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(nodes)
}

fn is_markdown(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempDir(PathBuf);
    impl TempDir {
        fn new() -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("vaultscan-{nanos}"));
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, b"x").unwrap();
    }

    #[test]
    fn lists_markdown_and_prunes_non_markdown_and_hidden() {
        let t = TempDir::new();
        let root = &t.0;
        touch(&root.join("b-note.md"));
        touch(&root.join("a-note.markdown"));
        touch(&root.join("notes.txt")); // not markdown → excluded
        touch(&root.join(".obsidian/app.json")); // hidden dir → skipped
        touch(&root.join("assets/pic.png")); // no md inside → pruned
        touch(&root.join("sub/nested.md"));
        touch(&root.join("deep/inner/x.md"));

        let tree = scan(root).unwrap();
        let names: Vec<&str> = tree.iter().map(|n| n.name.as_str()).collect();

        // directories first (alpha), then files (alpha); assets/.obsidian gone.
        assert_eq!(names, ["deep", "sub", "a-note.markdown", "b-note.md"]);

        let deep = &tree[0];
        assert!(deep.is_dir);
        assert_eq!(deep.children.len(), 1);
        assert_eq!(deep.children[0].name, "inner");
        assert_eq!(deep.children[0].children[0].name, "x.md");

        let file = tree.iter().find(|n| n.name == "b-note.md").unwrap();
        assert!(!file.is_dir);
        assert!(file.children.is_empty());
        assert!(file.path.ends_with("b-note.md"));
    }

    #[test]
    fn empty_folder_yields_empty_tree() {
        let t = TempDir::new();
        assert_eq!(scan(&t.0).unwrap(), vec![]);
    }

    #[test]
    fn sorting_is_case_insensitive() {
        let t = TempDir::new();
        touch(&t.0.join("Zebra.md"));
        touch(&t.0.join("apple.md"));
        let names: Vec<String> = scan(&t.0).unwrap().into_iter().map(|n| n.name).collect();
        assert_eq!(names, ["apple.md", "Zebra.md"]);
    }
}
