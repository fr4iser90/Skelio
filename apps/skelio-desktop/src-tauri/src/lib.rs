use std::path::PathBuf;

fn manifest_path(project_root: &str) -> PathBuf {
    PathBuf::from(project_root).join("project.skelio.json")
}

fn assets_path(project_root: &str) -> PathBuf {
    PathBuf::from(project_root).join("assets")
}

fn validate_project_subpath(relative_path: &str) -> Result<(), String> {
    if relative_path.is_empty() || relative_path.contains("..") {
        return Err("invalid relative path".into());
    }
    if !relative_path.starts_with("assets/") {
        return Err("path must be under assets/".into());
    }
    Ok(())
}

#[tauri::command]
fn read_project_manifest(root: String) -> Result<String, String> {
    let path = manifest_path(&root);
    std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}

#[tauri::command]
fn write_project_manifest(root: String, content: String) -> Result<(), String> {
    let assets = assets_path(&root);
    std::fs::create_dir_all(&assets).map_err(|e| format!("{}: {e}", assets.display()))?;
    let path = manifest_path(&root);
    std::fs::write(&path, content.as_bytes()).map_err(|e| format!("{}: {e}", path.display()))
}

#[tauri::command]
fn read_project_subpath(root: String, relative_path: String) -> Result<String, String> {
    validate_project_subpath(&relative_path)?;
    let path = PathBuf::from(&root).join(&relative_path);
    std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}

#[tauri::command]
fn write_project_subpath(root: String, relative_path: String, content: String) -> Result<(), String> {
    validate_project_subpath(&relative_path)?;
    let path = PathBuf::from(&root).join(&relative_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{e}"))?;
    }
    std::fs::write(&path, content.as_bytes()).map_err(|e| format!("{}: {e}", path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_project_manifest,
            write_project_manifest,
            read_project_subpath,
            write_project_subpath
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
