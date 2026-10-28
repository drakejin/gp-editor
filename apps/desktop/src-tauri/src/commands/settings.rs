// Small settings (src/native/web/settings.ts): one text file each in the app's data folder, what the Mac keeps in
// user defaults. The API key file is not a setting: only anthropic.rs touches it.

use super::{anthropic::KEY_FILE, app_data_dir, error, is_plain_file_name, write_atomically, CommandResult};
use std::path::PathBuf;
use tauri::AppHandle;

fn setting_path(app: &AppHandle, name: &str) -> CommandResult<PathBuf> {
    if !is_plain_file_name(name) || name.eq_ignore_ascii_case(KEY_FILE) {
        return Err(error("bad_name", "Not a setting name"));
    }
    Ok(app_data_dir(app)?.join(name))
}

#[tauri::command]
pub fn app_data_read(app: AppHandle, name: String) -> CommandResult<Option<String>> {
    let path = setting_path(&app, &name)?;
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(error("read_failed", e)),
    }
}

#[tauri::command]
pub fn app_data_write(app: AppHandle, name: String, text: String) -> CommandResult<()> {
    let path = setting_path(&app, &name)?;
    write_atomically(&path, text.as_bytes()).map_err(|e| error("write_failed", e))
}
