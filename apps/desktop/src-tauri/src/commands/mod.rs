// The commands the page calls (src/native/web/tauri.ts `call`): what the macOS app's native modules do that a page
// cannot. Errors are "code: message" strings, which the page turns into a NativeError with that code.

pub mod anthropic;
pub mod files;
pub mod fonts;
pub mod projects;
pub mod settings;
pub mod sound_banks;

use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

/** A command's result: its error is "code: message". */
pub type CommandResult<T> = Result<T, String>;

pub fn error(code: &str, message: impl std::fmt::Display) -> String {
    format!("{code}: {message}")
}

/** An io::Error as "missing: …" when the file is not there, else `code: …`. */
pub fn io_error(code: &str, error: std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::NotFound {
        return self::error("missing", "The file is no longer there");
    }
    self::error(code, error)
}

/** True for a plain file name: one normal path component, not hidden, no separators. */
pub fn is_plain_file_name(name: &str) -> bool {
    let mut components = Path::new(name).components();
    matches!((components.next(), components.next()), (Some(Component::Normal(_)), None))
        && !name.starts_with('.')
        && !name.contains(['/', '\\', ':'])
}

/** The app's data folder (%APPDATA%\com.gpeditor.app), created when missing. */
pub fn app_data_dir(app: &AppHandle) -> CommandResult<PathBuf> {
    let folder = app.path().app_data_dir().map_err(|e| error("no_data_folder", e))?;
    std::fs::create_dir_all(&folder).map_err(|e| error("no_data_folder", e))?;
    Ok(folder)
}

/** Writes through a temporary file next to `path`, so a reader never sees half a file. */
pub fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(format!(".{}.tmp", std::process::id()));
    let temporary = PathBuf::from(temporary);
    std::fs::write(&temporary, bytes)?;
    std::fs::rename(&temporary, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&temporary);
    })
}

pub fn decode_base64(base64: &str) -> CommandResult<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(base64)
        .map_err(|_| error("bad_data", "The data to write is not valid base64"))
}
