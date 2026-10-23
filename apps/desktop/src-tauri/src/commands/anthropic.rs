// The Messages API for PDF import and the Song Writer (GPAnthropic.m on the Mac). The API key stays on this side: it
// is kept in the app's data folder and added to each request, so the page only learns whether one is set.

use super::{app_data_dir, error, write_atomically, CommandResult};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::AppHandle;

pub const KEY_FILE: &str = "anthropic-key.txt";
const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
/** A page of a long score can take minutes to transcribe. */
const REQUEST_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Serialize)]
pub struct ApiResponse {
    status: u16,
    body: String,
}

fn key_path(app: &AppHandle) -> CommandResult<PathBuf> {
    Ok(app_data_dir(app)?.join(KEY_FILE))
}

fn saved_key(app: &AppHandle) -> CommandResult<Option<String>> {
    let key = std::fs::read_to_string(key_path(app)?).ok().map(|key| key.trim().to_owned());
    Ok(key.filter(|key| !key.is_empty()))
}

#[tauri::command]
pub fn anthropic_has_key(app: AppHandle) -> CommandResult<bool> {
    Ok(saved_key(&app)?.is_some())
}

#[tauri::command]
pub fn anthropic_set_key(app: AppHandle, key: String) -> CommandResult<()> {
    let key = key.trim();
    if key.is_empty() || key.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(error("bad_key", "Enter an Anthropic API key"));
    }
    write_atomically(&key_path(&app)?, key.as_bytes()).map_err(|e| error("save_failed", e))
}

#[tauri::command]
pub fn anthropic_clear_key(app: AppHandle) -> CommandResult<()> {
    match std::fs::remove_file(key_path(&app)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(error("save_failed", e)),
    }
}

/** POSTs a Messages API request body; answers any HTTP status, fails on a network error or a missing key. */
#[tauri::command]
pub async fn anthropic_send(app: AppHandle, body: String) -> CommandResult<ApiResponse> {
    let key = saved_key(&app)?.ok_or_else(|| error("no_key", "No Anthropic API key — add one in the import settings"))?;
    let client = reqwest::Client::builder().timeout(REQUEST_TIMEOUT).build().map_err(|e| error("network", e))?;
    let response = client
        .post(API_URL)
        .header("x-api-key", key)
        .header("anthropic-version", API_VERSION)
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| error("network", e))?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| error("network", e))?;
    Ok(ApiResponse { status, body })
}
