// Phase 0 IPC round-trip check (CLAUDE.md §8). Returns an app identifier so the
// frontend can confirm the Rust backend is reachable. Placeholder — real commands
// (open_file, save_file, …) from the §5 contract arrive in Phase 1.
#[tauri::command]
fn ping() -> String {
    format!("{} {}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
