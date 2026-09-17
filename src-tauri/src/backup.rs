use std::{
    fs::{self, File},
    path::Path,
};

use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::{
    error::{AppError, AppResult},
    models::{BackupInfo, BackupSchedule},
    workspace::WorkspaceRepository,
};

pub fn create(repository: &WorkspaceRepository) -> AppResult<BackupInfo> {
    create_internal(repository, None)
}

pub fn maybe_create_auto(repository: &WorkspaceRepository) -> AppResult<Option<BackupInfo>> {
    let interval = match repository.settings().sync.backup_schedule {
        BackupSchedule::Manual => return Ok(None),
        BackupSchedule::Daily => Duration::days(1),
        BackupSchedule::Weekly => Duration::days(7),
    };
    let now = Utc::now();
    if let Some(latest) = list(repository)?.into_iter().next() {
        if let Ok(created_at) = DateTime::parse_from_rfc3339(&latest.created_at) {
            if now.signed_duration_since(created_at.with_timezone(&Utc)) < interval {
                return Ok(None);
            }
        }
    }
    Ok(Some(create_internal(repository, None)?))
}

fn create_internal(
    repository: &WorkspaceRepository,
    preserve: Option<&str>,
) -> AppResult<BackupInfo> {
    let backup_dir = repository.root().join("backups");
    fs::create_dir_all(&backup_dir)?;
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let name = format!(
        "workspace-{timestamp}-{}.zip",
        &Uuid::new_v4().to_string()[..8]
    );
    let path = backup_dir.join(&name);
    let file = File::create(&path)?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for entry in WalkDir::new(repository.root())
        .into_iter()
        .filter_map(Result::ok)
    {
        let source = entry.path();
        if !source.is_file() || is_excluded(source, repository.root()) {
            continue;
        }
        let relative = source
            .strip_prefix(repository.root())
            .map_err(|error| AppError::Command(error.to_string()))?;
        let name = relative.to_string_lossy().replace('\\', "/");
        archive.start_file(name, options)?;
        let mut source_file = File::open(source)?;
        std::io::copy(&mut source_file, &mut archive)?;
    }
    archive.finish()?;
    let size = fs::metadata(&path)?.len();
    prune(repository, &name, preserve)?;
    Ok(BackupInfo {
        name,
        path: path.to_string_lossy().to_string(),
        size,
        created_at: Utc::now().to_rfc3339(),
    })
}

pub fn list(repository: &WorkspaceRepository) -> AppResult<Vec<BackupInfo>> {
    let mut result = Vec::new();
    let directory = repository.root().join("backups");
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("zip") {
            continue;
        }
        let metadata = fs::metadata(&path)?;
        let created_at = metadata
            .modified()
            .ok()
            .map(|value| DateTime::<Utc>::from(value).to_rfc3339())
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        result.push(BackupInfo {
            name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            path: path.to_string_lossy().to_string(),
            size: metadata.len(),
            created_at,
        });
    }
    result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(result)
}

pub fn restore(repository: &mut WorkspaceRepository, name: &str) -> AppResult<String> {
    if Path::new(name).file_name().and_then(|value| value.to_str()) != Some(name)
        || Path::new(name).extension().and_then(|value| value.to_str()) != Some("zip")
    {
        return Err(AppError::Validation("备份文件名无效".into()));
    }
    let source = repository.root().join("backups").join(name);
    if !source.is_file() {
        return Err(AppError::NotFound(format!("备份 {name}")));
    }
    let safety = create_internal(repository, Some(name))?;
    let staging = repository
        .root()
        .join(format!(".restore-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging)?;
    let result = extract_safe(&source, &staging).and_then(|_| {
        for folder in ["personal", "work", "config", "plugins"] {
            let staged = staging.join(folder);
            if staged.exists() {
                let target = repository.root().join(folder);
                if target.exists() {
                    fs::remove_dir_all(&target)?;
                }
                copy_tree(&staged, &target)?;
            }
        }
        repository.ensure_structure()?;
        repository.reload_settings()?;
        repository.reindex()?;
        Ok(())
    });
    let _ = fs::remove_dir_all(&staging);
    result?;
    Ok(format!("已恢复 {name}，恢复前安全备份为 {}", safety.name))
}

fn extract_safe(source: &Path, destination: &Path) -> AppResult<()> {
    let file = File::open(source)?;
    let mut archive = ZipArchive::new(file)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| AppError::Validation("备份包含不安全路径".into()))?
            .to_path_buf();
        if !allowed_restore_path(&enclosed) {
            continue;
        }
        let target = destination.join(&enclosed);
        if entry.is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = File::create(&target)?;
            std::io::copy(&mut entry, &mut output)?;
        }
    }
    Ok(())
}

fn copy_tree(source: &Path, destination: &Path) -> AppResult<()> {
    for entry in WalkDir::new(source).into_iter().filter_map(Result::ok) {
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|error| AppError::Command(error.to_string()))?;
        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn allowed_restore_path(path: &Path) -> bool {
    path.components().next().map(|component| matches!(component, std::path::Component::Normal(value) if value == "personal" || value == "work" || value == "config" || value == "plugins")).unwrap_or(false)
}

fn is_excluded(path: &Path, root: &Path) -> bool {
    path.strip_prefix(root).ok().and_then(|relative| relative.components().next()).map(|component| matches!(component, std::path::Component::Normal(value) if value == "backups" || value == "database" || value == ".git" || value == ".restore-temp" || value.to_string_lossy().starts_with(".restore-"))).unwrap_or(false)
}

fn prune(
    repository: &WorkspaceRepository,
    latest_name: &str,
    preserve: Option<&str>,
) -> AppResult<()> {
    let cutoff = Utc::now() - Duration::days(repository.settings().sync.backup_retention.max(1));
    let backups = list(repository)?;
    for backup in backups {
        let expired = DateTime::parse_from_rfc3339(&backup.created_at)
            .map(|created_at| created_at.with_timezone(&Utc) < cutoff)
            .unwrap_or(false);
        if expired && backup.name != latest_name && Some(backup.name.as_str()) != preserve {
            fs::remove_file(backup.path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        models::{NoteInput, Space},
        workspace::WorkspaceRepository,
    };
    use tempfile::tempdir;

    #[test]
    fn backup_can_be_created_and_listed() {
        let directory = tempdir().unwrap();
        let mut repository = WorkspaceRepository::open(directory.path().join("workspace")).unwrap();
        repository
            .create_note(NoteInput {
                title: "备份测试".into(),
                content: "content".into(),
                space: Space::Personal,
                project_id: None,
                tags: vec![],
            })
            .unwrap();
        let backup = create(&repository).unwrap();
        assert!(Path::new(&backup.path).exists());
        assert_eq!(list(&repository).unwrap().len(), 1);
    }

    #[test]
    fn automatic_backup_respects_schedule_interval() {
        let directory = tempdir().unwrap();
        let mut repository = WorkspaceRepository::open(directory.path().join("workspace")).unwrap();
        let mut settings = repository.settings();
        settings.sync.backup_schedule = BackupSchedule::Daily;
        repository.update_settings(settings).unwrap();

        assert!(maybe_create_auto(&repository).unwrap().is_some());
        assert!(maybe_create_auto(&repository).unwrap().is_none());
        assert_eq!(list(&repository).unwrap().len(), 1);
    }

    #[test]
    fn restore_reindexes_the_snapshot_and_keeps_a_safety_backup() {
        let directory = tempdir().unwrap();
        let mut repository = WorkspaceRepository::open(directory.path().join("workspace")).unwrap();
        let note = repository
            .create_note(NoteInput {
                title: "恢复前的标题".into(),
                content: "恢复前的内容".into(),
                space: Space::Personal,
                project_id: None,
                tags: vec![],
            })
            .unwrap();
        let snapshot = create(&repository).unwrap();

        let mut changed = repository.get_note(&note.id).unwrap();
        changed.title = "恢复后的标题".into();
        changed.content = "恢复后的内容".into();
        repository.update_note(changed).unwrap();

        let message = restore(&mut repository, &snapshot.name).unwrap();
        let restored = repository.get_note(&note.id).unwrap();
        assert_eq!(restored.title, "恢复前的标题");
        assert_eq!(restored.content, "恢复前的内容");
        assert!(message.contains("安全备份"));
        assert_eq!(list(&repository).unwrap().len(), 2);
    }
}
