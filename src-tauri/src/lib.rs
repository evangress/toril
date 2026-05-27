mod commands;
mod settings;

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
            commands::export::markdown_to_html,
            commands::export::export_html,
            commands::export::export_rtf,
            settings::load_settings,
            settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
