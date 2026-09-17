use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use chrono::Utc;

use crate::{
    error::{AppError, AppResult},
    models::PluginManifest,
};

const ALLOWED_PERMISSIONS: &[&str] = &[
    "workspace.read",
    "workspace.write",
    "commands.register",
    "ui.panel",
];

pub fn list(root: &Path) -> AppResult<Vec<PluginManifest>> {
    let directory = root.join("plugins");
    let mut result = Vec::new();
    if !directory.exists() {
        return Ok(result);
    }
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("manifest.json");
        if !manifest_path.is_file() {
            continue;
        }
        let manifest: PluginManifest = serde_json::from_slice(&fs::read(manifest_path)?)?;
        result.push(validate_manifest(manifest)?);
    }
    result.sort_by_key(|left| left.name.to_lowercase());
    Ok(result)
}

pub fn install(root: &Path, source_path: &Path) -> AppResult<PluginManifest> {
    if !source_path.is_file() {
        return Err(AppError::Validation("插件清单不存在".into()));
    }
    let manifest: PluginManifest = serde_json::from_slice(&fs::read(source_path)?)?;
    let mut manifest = validate_manifest(manifest)?;
    let timestamp = Utc::now().to_rfc3339();
    manifest.installed_at = Some(timestamp.clone());
    manifest.updated_at = Some(timestamp);
    manifest.enabled = false;
    let directory = root.join("plugins").join(&manifest.id);
    fs::create_dir_all(&directory)?;
    write_manifest(&directory.join("manifest.json"), &manifest)?;
    Ok(manifest)
}

pub fn set_enabled(root: &Path, id: &str, enabled: bool) -> AppResult<PluginManifest> {
    validate_id(id)?;
    let path = root.join("plugins").join(id).join("manifest.json");
    if !path.is_file() {
        return Err(AppError::NotFound(format!("插件 {id}")));
    }
    let mut manifest: PluginManifest = serde_json::from_slice(&fs::read(&path)?)?;
    manifest = validate_manifest(manifest)?;
    manifest.enabled = enabled;
    manifest.updated_at = Some(Utc::now().to_rfc3339());
    write_manifest(&path, &manifest)?;
    Ok(manifest)
}

pub fn validate_manifest(mut manifest: PluginManifest) -> AppResult<PluginManifest> {
    validate_id(&manifest.id)?;
    if manifest.name.trim().is_empty() || manifest.name.chars().count() > 120 {
        return Err(AppError::Validation(
            "插件名称不能为空且不能超过 120 个字符".into(),
        ));
    }
    if manifest.version.trim().is_empty() {
        return Err(AppError::Validation("插件版本不能为空".into()));
    }
    for permission in &manifest.permissions {
        if !ALLOWED_PERMISSIONS.contains(&permission.as_str()) {
            return Err(AppError::Validation(format!(
                "插件权限未获允许：{permission}"
            )));
        }
    }
    if let Some(entry) = &manifest.entry {
        let path = Path::new(entry);
        if path.is_absolute()
            || path
                .components()
                .any(|component| matches!(component, Component::ParentDir))
        {
            return Err(AppError::Validation(
                "插件入口必须是插件目录内的相对路径".into(),
            ));
        }
    }
    manifest.id = manifest.id.trim().to_string();
    manifest.name = manifest.name.trim().to_string();
    manifest.version = manifest.version.trim().to_string();
    Ok(manifest)
}

fn validate_id(id: &str) -> AppResult<()> {
    let id = id.trim();
    if id.is_empty()
        || id.len() > 80
        || !id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.'))
    {
        return Err(AppError::Validation(
            "插件 ID 只能包含字母、数字、-、_、. ".into(),
        ));
    }
    Ok(())
}

fn write_manifest(path: &Path, manifest: &PluginManifest) -> AppResult<()> {
    let temporary = PathBuf::from(format!("{}.tmp", path.to_string_lossy()));
    fs::write(&temporary, serde_json::to_vec_pretty(manifest)?)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_plugin_permissions_and_entry() {
        let result = validate_manifest(PluginManifest {
            id: "demo".into(),
            name: "Demo".into(),
            version: "1.0.0".into(),
            description: String::new(),
            entry: Some("../run.exe".into()),
            permissions: vec!["process.exec".into()],
            enabled: false,
            installed_at: None,
            updated_at: None,
        });
        assert!(result.is_err());
    }
}
