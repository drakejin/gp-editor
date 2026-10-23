// The Windows build's native side (Tauri v2): the window that runs the React app (web/, src/native/*.web.ts) and the
// commands it calls (commands/), in place of the macOS app's AppDelegate.swift and native modules.

mod commands;

use commands::files::{file_arguments, InitialFiles};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/** A second launch (double-clicking another file) hands its files to the running window and brings it forward. */
fn on_second_launch(app: &AppHandle, argv: Vec<String>, cwd: String) {
    let files = file_arguments(&argv, &cwd);
    if !files.is_empty() {
        let _ = app.emit("open-files", files);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn run() {
    let argv: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().map(|dir| dir.to_string_lossy().into_owned()).unwrap_or_default();
    tauri::Builder::default()
        // First, so a second launch exits before it opens a window.
        .plugin(tauri_plugin_single_instance::init(on_second_launch))
        .plugin(tauri_plugin_dialog::init())
        .manage(InitialFiles(Mutex::new(Some(file_arguments(&argv, &cwd)))))
        .invoke_handler(tauri::generate_handler![
            commands::files::initial_files,
            commands::files::read_file,
            commands::files::write_file,
            commands::files::files_exist,
            commands::settings::app_data_read,
            commands::settings::app_data_write,
            commands::anthropic::anthropic_has_key,
            commands::anthropic::anthropic_set_key,
            commands::anthropic::anthropic_clear_key,
            commands::anthropic::anthropic_send,
            commands::sound_banks::sound_banks_list,
            commands::sound_banks::sound_bank_add,
            commands::sound_banks::sound_bank_remove,
            commands::sound_banks::sound_bank_read,
            commands::projects::project_create,
            commands::projects::project_read_bytes,
            commands::projects::project_write,
            commands::projects::project_read_text,
            commands::projects::project_list,
            commands::projects::project_reveal,
            commands::fonts::system_font,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GP Editor");
}
