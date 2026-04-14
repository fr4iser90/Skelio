use std::path::PathBuf;
use std::process::Command;

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

/// Nativer „Speichern unter“ (zenity / kdialog / OS-Dialog) + UTF-8 schreiben. `Ok(None)` = abgebrochen.
#[tauri::command]
fn save_text_file_with_dialog(default_name: String, contents: String) -> Result<Option<String>, String> {
    let path = native_save_dialog_path(&default_name)?;
    let Some(path) = path else {
        return Ok(None);
    };
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(&p, contents.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(path))
}

fn native_save_dialog_path(default_name: &str) -> Result<Option<String>, String> {
    #[cfg(target_os = "linux")]
    {
        linux_save_dialog(default_name)
    }
    #[cfg(target_os = "windows")]
    {
        windows_save_dialog(default_name)
    }
    #[cfg(target_os = "macos")]
    {
        macos_save_dialog(default_name)
    }
    #[cfg(not(any(
        target_os = "linux",
        target_os = "windows",
        target_os = "macos"
    )))]
    {
        Err("„Speichern (Editor)“: auf diesem System bitte „Ordner speichern“ nutzen.".into())
    }
}

#[cfg(target_os = "linux")]
fn linux_save_dialog(default_name: &str) -> Result<Option<String>, String> {
    let fn_arg = format!("--filename={}", default_name.replace('\\', "/"));
    if let Ok(o) = Command::new("zenity")
        .args([
            "--file-selection",
            "--save",
            "--confirm-overwrite",
            "--title=Skelio — Editor speichern",
            &fn_arg,
        ])
        .output()
    {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            return Ok(if s.is_empty() { None } else { Some(s) });
        }
        if o.status.code() == Some(1) {
            return Ok(None);
        }
    }
    let o = Command::new("kdialog")
        .args([
            "--getsavefilename",
            default_name,
            "JSON (*.json *.skelio.json)|*.json *.skelio.json",
        ])
        .output()
        .map_err(|e| {
            format!(
                "Kein Dateiauswahl-Tool (zenity/kdialog): {e}. Installiere zenity oder nutze „Ordner speichern“."
            )
        })?;
    if o.status.success() {
        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
        Ok(if s.is_empty() { None } else { Some(s) })
    } else if o.status.code() == Some(1) {
        Ok(None)
    } else {
        Err(String::from_utf8_lossy(&o.stderr).into_owned())
    }
}

#[cfg(target_os = "windows")]
fn windows_save_dialog(default_name: &str) -> Result<Option<String>, String> {
    let dn = default_name.replace('\'', "''");
    let ps = format!(
        "Add-Type -AssemblyName System.Windows.Forms; \
         $s = New-Object System.Windows.Forms.SaveFileDialog; \
         $s.FileName = '{dn}'; \
         $s.Filter = 'JSON (*.json)|*.json|Alle Dateien|*.*'; \
         $s.Title = 'Skelio — speichern'; \
         if ($s.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ Write-Output $s.FileName }}"
    );
    let o = Command::new("powershell.exe")
        .args(["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", &ps])
        .output()
        .map_err(|e| e.to_string())?;
    if !o.status.success() {
        return Err(String::from_utf8_lossy(&o.stderr).into_owned());
    }
    let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
    Ok(if s.is_empty() { None } else { Some(s) })
}

#[cfg(target_os = "macos")]
fn macos_save_dialog(default_name: &str) -> Result<Option<String>, String> {
    let safe = default_name.replace('"', "");
    let script = format!(
        "try\n\
         POSIX path of (choose file name with prompt \"Skelio — Editor speichern\" default name \"{safe}\")\n\
         on error number -128\n\
         return \"\"\n\
         end try"
    );
    let o = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| e.to_string())?;
    if !o.status.success() {
        return Err(String::from_utf8_lossy(&o.stderr).into_owned());
    }
    let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
    Ok(if s.is_empty() { None } else { Some(s) })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_project_manifest,
            write_project_manifest,
            read_project_subpath,
            write_project_subpath,
            save_text_file_with_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::validate_project_subpath;

    #[test]
    fn validate_project_subpath_rejects_traversal() {
        assert!(validate_project_subpath("assets/../foo").is_err());
    }

    #[test]
    fn validate_project_subpath_accepts_assets() {
        assert!(validate_project_subpath("assets/meshes/x.json").is_ok());
    }
}
