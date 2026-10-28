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
/**
 * The page asks for streamed answers, which send events (thinking, the tool input as it is written, pings) all along:
 * this long a silence means the connection is gone. The whole answer may take up to an hour (GPAnthropic.m's).
 */
const IDLE_TIMEOUT: Duration = Duration::from_secs(600);
const RESOURCE_TIMEOUT: Duration = Duration::from_secs(3600);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

/** The answer as text (a streamed answer's whole event stream, or one JSON body) and its media type. */
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    status: u16,
    body: String,
    content_type: String,
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

/**
 * POSTs a Messages API request body; answers any HTTP status once the whole answer is in, fails on a network error or a
 * missing key.
 */
#[tauri::command]
pub async fn anthropic_send(app: AppHandle, body: String) -> CommandResult<ApiResponse> {
    let key = saved_key(&app)?.ok_or_else(|| error("no_key", "No Anthropic API key — add one in the import settings"))?;
    let client = reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(IDLE_TIMEOUT)
        .timeout(RESOURCE_TIMEOUT)
        .build()
        .map_err(|e| error("network", e))?;
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
    // The media type alone, as NSURLResponse.MIMEType gives it ("text/event-stream", not its parameters).
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or("").trim().to_ascii_lowercase())
        .unwrap_or_default();
    let body = response.text().await.map_err(|e| error("network", e))?;
    Ok(ApiResponse { status, body, content_type })
}
