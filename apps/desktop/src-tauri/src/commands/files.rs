// Files anywhere on disk (GPFiles.m and GPRecentFiles.m on the Mac): the page picks paths with the dialog plugin and
// reads or writes them here.

use super::{decode_base64, error, io_error, CommandResult};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::State;

/** The files the app was started with (its command line), handed to the page once. */
pub struct InitialFiles(pub Mutex<Option<Vec<String>>>);

/** The file arguments of a command line (not the program, not flags), as absolute paths. */
pub fn file_arguments(argv: &[String], cwd: &str) -> Vec<String> {
    argv.iter()
        .skip(1)
        .filter(|argument| !argument.starts_with('-'))
        .map(|argument| {
            let path = PathBuf::from(argument);
            if path.is_absolute() { path } else { PathBuf::from(cwd).join(path) }
        })
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
pub fn initial_files(state: State<'_, InitialFiles>) -> Vec<String> {
    state.0.lock().map(|mut files| files.take().unwrap_or_default()).unwrap_or_default()
}

#[tauri::command]
pub async fn read_file(path: String) -> CommandResult<Response> {
    let bytes = tokio::fs::read(&path).await.map_err(|e| io_error("read_failed", e))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn write_file(path: String, base64: String) -> CommandResult<()> {
    if path.is_empty() {
        return Err(error("bad_path", "No file to write"));
    }
    let bytes = decode_base64(&base64)?;
    tokio::fs::write(&path, bytes).await.map_err(|e| error("write_failed", e))
}

#[tauri::command]
pub fn files_exist(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|path| PathBuf::from(path).is_file()).collect()
}
