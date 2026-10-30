// Songsterr's song search for the Songsterr panel (src/songsterr/; the macOS app asks with React Native's fetch). The
// page's own fetch cannot read the answer — Songsterr sends no Access-Control-Allow-Origin — so it asks here. The app
// only searches and links to a song's page: it never fetches, parses or downloads tab content (Songsterr's terms:
// downloading tabs is a paid Plus feature), so these commands reach Songsterr's search URL and open Songsterr's pages
// in the default browser, nothing else.

use super::{error, CommandResult};
use serde::Serialize;
use std::time::Duration;

const HOST: &str = "www.songsterr.com";
const SEARCH_PATH: &str = "/api/songs";
/** The page gives up at 15 s too (songsterr-search.ts). */
const TIMEOUT: Duration = Duration::from_secs(15);
/** A page of 20 songs is ~30 kB. */
const MAX_ANSWER_BYTES: usize = 2 * 1024 * 1024;
const USER_AGENT: &str = concat!("GP Editor/", env!("CARGO_PKG_VERSION"));

/** The answer as text and its HTTP status (any status: the page tells them apart). */
#[derive(Serialize)]
pub struct SearchAnswer {
    status: u16,
    body: String,
}

/** An https URL of Songsterr's site (no user, password or port of its own), on `path` when one is given. */
fn songsterr_url(url: &str, path: Option<&str>) -> CommandResult<reqwest::Url> {
    let parsed = reqwest::Url::parse(url).map_err(|_| error("bad_url", "Not a Songsterr address"))?;
    let is_songsterr = parsed.scheme() == "https"
        && parsed.host_str() == Some(HOST)
        && parsed.port().is_none()
        && parsed.username().is_empty()
        && parsed.password().is_none();
    if !is_songsterr || path.is_some_and(|path| parsed.path() != path) {
        return Err(error("bad_url", "Not a Songsterr address"));
    }
    Ok(parsed)
}

fn request_error(e: reqwest::Error) -> String {
    if e.is_timeout() {
        error("timeout", e)
    } else {
        error("network", e)
    }
}

/** GETs a Songsterr search URL without cookies; answers any HTTP status, fails on a network error or a timeout. */
#[tauri::command]
pub async fn songsterr_search(url: String) -> CommandResult<SearchAnswer> {
    let url = songsterr_url(&url, Some(SEARCH_PATH))?;
    // No redirects: the host check holds for every hop (a 3xx comes back as its status).
    let client = reqwest::Client::builder()
        .connect_timeout(TIMEOUT)
        .timeout(TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| error("network", e))?;
    let mut response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(request_error)?;
    let status = response.status().as_u16();
    // Read as it comes, stopping at the cap (an answer is never held whole beyond it).
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(request_error)? {
        if bytes.len() + chunk.len() > MAX_ANSWER_BYTES {
            return Err(error("too_large", "Songsterr's answer is too large"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(SearchAnswer { status, body: String::from_utf8_lossy(&bytes).into_owned() })
}

/** Opens a page of Songsterr's site (a song's page, the terms) in the default browser. */
#[tauri::command]
pub fn songsterr_open(url: String) -> CommandResult<()> {
    let url = songsterr_url(&url, None)?;
    open_in_browser(url.as_str()).map_err(|e| error("open_failed", e))
}

#[cfg(windows)]
fn open_in_browser(url: &str) -> std::io::Result<()> {
    // Explorer hands an https URL to the default browser (as project_reveal hands it a folder).
    std::process::Command::new("explorer").arg(url).spawn().map(|_| ())
}

#[cfg(not(windows))]
fn open_in_browser(url: &str) -> std::io::Result<()> {
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    std::process::Command::new(opener).arg(url).spawn().map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_songsterrs_search_and_pages_only() {
        assert!(songsterr_url("https://www.songsterr.com/api/songs?pattern=one&size=20", Some(SEARCH_PATH)).is_ok());
        assert!(songsterr_url("https://www.songsterr.com/a/wa/song?id=444", None).is_ok());
        assert!(songsterr_url("https://www.songsterr.com/a/wa/song?id=444", Some(SEARCH_PATH)).is_err());
        assert!(songsterr_url("http://www.songsterr.com/api/songs?pattern=one", Some(SEARCH_PATH)).is_err());
        assert!(songsterr_url("https://www.songsterr.com.example.org/api/songs", Some(SEARCH_PATH)).is_err());
        assert!(songsterr_url("https://user@www.songsterr.com/api/songs", Some(SEARCH_PATH)).is_err());
        assert!(songsterr_url("https://www.songsterr.com:8443/api/songs", Some(SEARCH_PATH)).is_err());
        assert!(songsterr_url("file:///C:/Windows/notepad.exe", None).is_err());
    }
}
