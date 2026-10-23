// PDF import projects (GPProjects.m on the Mac): every import gets a folder in Documents\GP Editor Projects holding the
// original PDF, project.json, the per-page transcriptions and the resulting .gp5. Paths from the page are never
// trusted: only folders directly in the projects root, files inside them without "..", and no links on the way.

use super::{decode_base64, error, io_error, write_atomically, CommandResult};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::ipc::Response;
use tauri::{AppHandle, Manager};

const PROJECTS_FOLDER: &str = "GP Editor Projects";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedProject {
    path: String,
    name: String,
    source_file: String,
}

#[derive(Serialize)]
pub struct ProjectEntry {
    path: String,
    name: String,
    modified: f64,
    project: Option<String>,
}

/** Documents\GP Editor Projects, created when missing. */
fn projects_root(app: &AppHandle) -> CommandResult<PathBuf> {
    let documents = app.path().document_dir().map_err(|e| error("no_projects_folder", e))?;
    let root = documents.join(PROJECTS_FOLDER);
    std::fs::create_dir_all(&root).map_err(|_| error("no_projects_folder", "Could not create Documents\\GP Editor Projects"))?;
    Ok(root)
}

fn is_link(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink())
}

/** The project folder when `path` is one directly inside the projects root and not a link. */
fn project_folder(app: &AppHandle, path: &str) -> CommandResult<PathBuf> {
    let root = projects_root(app)?;
    let project = PathBuf::from(path);
    let name = match project.components().next_back() {
        Some(Component::Normal(name)) => name.to_owned(),
        _ => return Err(error("bad_path", "Not a project folder")),
    };
    let folder = root.join(name);
    let is_direct_child = project.parent().is_some_and(|parent| parent == root);
    if !is_direct_child || is_link(&root) || is_link(&folder) {
        return Err(error("bad_path", "Not a project folder"));
    }
    Ok(folder)
}

/** A file inside the project for a relative path of plain components, with no link on the way. */
fn project_file(app: &AppHandle, project: &str, file: &str) -> CommandResult<PathBuf> {
    let mut path = project_folder(app, project)?;
    let relative = Path::new(file);
    let is_safe = !file.is_empty() && relative.components().all(|component| matches!(component, Component::Normal(_)));
    if !is_safe {
        return Err(error("bad_path", "Can only use files inside a project"));
    }
    for component in relative.components() {
        path.push(component);
        if is_link(&path) {
            return Err(error("bad_path", "Can only use files inside a project"));
        }
    }
    Ok(path)
}

/** `name`, else "name 2", "name 3"… — the first folder name not yet taken in `root`. */
fn unique_folder(root: &Path, name: &str) -> PathBuf {
    let base = if name.trim().is_empty() { "Untitled" } else { name.trim() };
    let mut candidate = root.join(base);
    let mut number = 2;
    while candidate.exists() {
        candidate = root.join(format!("{base} {number}"));
        number += 1;
    }
    candidate
}

/** A new project folder named after the PDF, with a copy of it. The page checks the PDF itself (pdf-lib). */
#[tauri::command]
pub async fn project_create(app: AppHandle, pdf_path: String) -> CommandResult<CreatedProject> {
    let pdf = PathBuf::from(&pdf_path);
    let source_file = pdf.file_name().map(|n| n.to_string_lossy().into_owned()).ok_or_else(|| error("bad_pdf", "Not a PDF file"))?;
    let stem = pdf.file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let folder = unique_folder(&projects_root(&app)?, &stem);
    std::fs::create_dir(&folder).map_err(|e| error("create_failed", e))?;
    tokio::fs::copy(&pdf, folder.join(&source_file)).await.map_err(|e| io_error("create_failed", e))?;
    let name = folder.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(CreatedProject { path: folder.to_string_lossy().into_owned(), name, source_file })
}

#[tauri::command]
pub async fn project_read_bytes(app: AppHandle, project: String, file: String) -> CommandResult<Response> {
    let path = project_file(&app, &project, &file)?;
    let bytes = tokio::fs::read(path).await.map_err(|e| io_error("read_failed", e))?;
    Ok(Response::new(bytes))
}

/** Writes a file of the project (its folders created as needed); answers its path. */
#[tauri::command]
pub fn project_write(app: AppHandle, project: String, file: String, base64: String) -> CommandResult<String> {
    let path = project_file(&app, &project, &file)?;
    let bytes = decode_base64(&base64)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| error("write_failed", e))?;
    }
    write_atomically(&path, &bytes).map_err(|e| error("write_failed", e))?;
    Ok(path.to_string_lossy().into_owned())
}

/** A text file of the project; null when it does not exist. */
#[tauri::command]
pub fn project_read_text(app: AppHandle, project: String, file: String) -> CommandResult<Option<String>> {
    let path = project_file(&app, &project, &file)?;
    Ok(std::fs::read_to_string(path).ok())
}

fn project_entry(folder: &Path) -> Option<ProjectEntry> {
    let metadata = std::fs::symlink_metadata(folder).ok()?;
    let name = folder.file_name()?.to_string_lossy().into_owned();
    if !metadata.is_dir() || name.starts_with('.') {
        return None;
    }
    let modified = metadata.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map_or(0.0, |d| d.as_millis() as f64);
    let project = std::fs::read_to_string(folder.join("project.json")).ok();
    Some(ProjectEntry { path: folder.to_string_lossy().into_owned(), name, modified, project })
}

/** Every project folder, newest first. */
#[tauri::command]
pub fn project_list(app: AppHandle) -> CommandResult<Vec<ProjectEntry>> {
    let entries = std::fs::read_dir(projects_root(&app)?).map_err(|e| error("no_projects_folder", e))?;
    let mut projects: Vec<ProjectEntry> = entries.flatten().filter_map(|entry| project_entry(&entry.path())).collect();
    projects.sort_by(|a, b| b.modified.total_cmp(&a.modified));
    Ok(projects)
}

/** Shows the project folder in File Explorer. */
#[tauri::command]
pub fn project_reveal(app: AppHandle, project: String) -> CommandResult<()> {
    let folder = project_folder(&app, &project)?;
    reveal(&folder).map_err(|e| error("reveal_failed", e))
}

#[cfg(windows)]
fn reveal(path: &Path) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    // Explorer reads "/select,<path>" itself; Rust's own quoting of the whole argument would break it.
    std::process::Command::new("explorer").raw_arg(format!("/select,\"{}\"", path.display())).spawn().map(|_| ())
}

#[cfg(not(windows))]
fn reveal(path: &Path) -> std::io::Result<()> {
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    std::process::Command::new(opener).arg(path).spawn().map(|_| ())
}
