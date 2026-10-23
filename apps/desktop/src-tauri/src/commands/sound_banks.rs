// The sound banks playback can use (GPSoundBanks.m on the Mac): GeneralUser GS, bundled when
// npm run soundfont:win fetched it before the build, then the banks the user added, copied into the app's data folder.

use super::{app_data_dir, error, io_error, is_plain_file_name, CommandResult};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::ipc::Response;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

const BUNDLED_BANK_ID: &str = "generaluser";
const BUNDLED_BANK_RESOURCE: &str = "SoundFonts/GeneralUser-GS.sf2";
const USER_BANK_PREFIX: &str = "user:";
const USER_BANK_FOLDER: &str = "SoundFonts";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundBank {
    id: String,
    name: String,
    is_removable: bool,
}

fn is_bank_file(path: &Path) -> bool {
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(extension.as_str(), "sf2" | "sf3" | "dls")
}

fn bundled_bank(app: &AppHandle) -> Option<PathBuf> {
    app.path().resolve(BUNDLED_BANK_RESOURCE, BaseDirectory::Resource).ok().filter(|path| path.is_file())
}

fn user_bank_folder(app: &AppHandle) -> CommandResult<PathBuf> {
    let folder = app_data_dir(app)?.join(USER_BANK_FOLDER);
    std::fs::create_dir_all(&folder).map_err(|e| error("no_bank_folder", e))?;
    Ok(folder)
}

/** The user's banks by file name (case-insensitive). */
fn user_bank_files(app: &AppHandle) -> CommandResult<Vec<String>> {
    let entries = std::fs::read_dir(user_bank_folder(app)?).map_err(|e| error("no_bank_folder", e))?;
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()) && is_bank_file(&entry.path()))
        .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
        .filter(|name| is_plain_file_name(name))
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    Ok(names)
}

/** The file of a user bank's id, when it is one. */
fn user_bank_path(app: &AppHandle, id: &str) -> CommandResult<Option<PathBuf>> {
    let Some(name) = id.strip_prefix(USER_BANK_PREFIX) else { return Ok(None) };
    if !is_plain_file_name(name) || !is_bank_file(Path::new(name)) {
        return Ok(None);
    }
    Ok(Some(user_bank_folder(app)?.join(name)))
}

#[tauri::command]
pub fn sound_banks_list(app: AppHandle) -> CommandResult<Vec<SoundBank>> {
    let mut banks = Vec::new();
    if bundled_bank(&app).is_some() {
        banks.push(SoundBank { id: BUNDLED_BANK_ID.into(), name: "GeneralUser GS".into(), is_removable: false });
    }
    for file in user_bank_files(&app)? {
        let name = Path::new(&file).file_stem().map_or(file.clone(), |stem| stem.to_string_lossy().into_owned());
        banks.push(SoundBank { id: format!("{USER_BANK_PREFIX}{file}"), name, is_removable: true });
    }
    Ok(banks)
}

/** Copies a .sf2 / .sf3 / .dls file into the app's folder (replacing one of the same name); answers its id. */
#[tauri::command]
pub async fn sound_bank_add(app: AppHandle, path: String) -> CommandResult<String> {
    let source = PathBuf::from(&path);
    let name = source.file_name().and_then(|n| n.to_str()).unwrap_or("").to_owned();
    if !is_bank_file(&source) || !is_plain_file_name(&name) {
        return Err(error("bad_bank", "Choose a SoundFont (.sf2, .sf3) or DLS (.dls) file"));
    }
    let destination = user_bank_folder(&app)?.join(&name);
    tokio::fs::copy(&source, &destination).await.map_err(|e| io_error("copy_failed", e))?;
    Ok(format!("{USER_BANK_PREFIX}{name}"))
}

#[tauri::command]
pub fn sound_bank_remove(app: AppHandle, id: String) -> CommandResult<()> {
    let Some(path) = user_bank_path(&app, &id)? else {
        return Err(error("not_removable", "Only sound banks you added can be removed"));
    };
    std::fs::remove_file(path).map_err(|e| io_error("remove_failed", e))
}

#[tauri::command]
pub async fn sound_bank_read(app: AppHandle, id: String) -> CommandResult<Response> {
    let path = if id == BUNDLED_BANK_ID { bundled_bank(&app) } else { user_bank_path(&app, &id)? };
    let path = path.ok_or_else(|| error("missing", "That sound bank is no longer available"))?;
    let bytes = tokio::fs::read(path).await.map_err(|e| io_error("read_failed", e))?;
    Ok(Response::new(bytes))
}
