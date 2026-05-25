mod commands;

use commands::workspace::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::files::open_file,
            commands::files::save_file,
            commands::files::save_file_as,
            commands::workspace::open_folder,
            commands::workspace::watch_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
