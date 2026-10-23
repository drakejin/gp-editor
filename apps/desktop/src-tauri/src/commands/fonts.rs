// System fonts for the PDF export (src/native/web/pdf-writer.ts embeds them): a page cannot read font files.

use super::{error, is_plain_file_name, CommandResult};
use std::path::PathBuf;
use tauri::ipc::Response;

/** The folders Windows installs fonts in: for every user, then for this user. */
fn font_folders() -> Vec<PathBuf> {
    let windows = std::env::var_os("WINDIR").map(|folder| PathBuf::from(folder).join("Fonts"));
    let local = std::env::var_os("LOCALAPPDATA").map(|folder| PathBuf::from(folder).join("Microsoft\\Windows\\Fonts"));
    windows.into_iter().chain(local).collect()
}

/** The bytes of the first of `candidates` (plain file names, segoeui.ttf) that is installed. */
#[tauri::command]
pub async fn system_font(candidates: Vec<String>) -> CommandResult<Response> {
    let folders = font_folders();
    for name in candidates.iter().filter(|name| is_plain_file_name(name)) {
        for folder in &folders {
            if let Ok(bytes) = tokio::fs::read(folder.join(name)).await {
                return Ok(Response::new(bytes));
            }
        }
    }
    Err(error("missing", "None of those fonts is installed"))
}
