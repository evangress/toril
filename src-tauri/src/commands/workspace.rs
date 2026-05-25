//! Workspace commands (CLAUDE.md §5): list a folder's markdown tree and watch
//! it for external changes (the folder may be a live Obsidian vault, §11).

use std::path::Path;
use std::sync::Mutex;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use vaultscan::FileNode;

/// Holds the active recursive watcher so it stays alive for the session.
/// Replacing it (a new `watch_folder` call) drops the previous one.
#[derive(Default)]
pub struct WatcherState(Mutex<Option<RecommendedWatcher>>);

/// Emitted to the frontend on `workspace:change` when the watcher fires.
#[derive(Clone, Serialize)]
struct ChangeEvent {
    kind: &'static str,
    paths: Vec<String>,
}

/// Recursively list the markdown tree under `path`.
#[tauri::command]
pub fn open_folder(path: String) -> Result<Vec<FileNode>, String> {
    vaultscan::scan(&path).map_err(|e| e.to_string())
}

/// Start watching `path` recursively, emitting `workspace:change` events.
/// A second call replaces the previous watcher.
#[tauri::command]
pub fn watch_folder(
    path: String,
    app: AppHandle,
    state: State<'_, WatcherState>,
) -> Result<(), String> {
    let emitter = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        let paths = event
            .paths
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        let _ = emitter.emit(
            "workspace:change",
            ChangeEvent {
                kind: classify(&event.kind),
                paths,
            },
        );
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Keep the watcher alive; dropping the previous one stops the old watch.
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

fn classify(kind: &EventKind) -> &'static str {
    match kind {
        EventKind::Create(_) => "create",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "remove",
        _ => "other",
    }
}
