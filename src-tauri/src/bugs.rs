pub mod export;
pub mod import;

use std::{fs, fs::OpenOptions, io::Write, path::Path};

use chrono::{Local, NaiveDate};
use serde_json::json;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{Bug, BugActivity, BugActivityKind, BugFieldChange, BugStatus, BugStatusChange},
};

pub fn valid_date(value: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::Validation(format!("日期“{value}”必须使用 YYYY-MM-DD 格式")))
}

pub fn validate_dates(
    status: &BugStatus,
    bug_date: &str,
    due_date: Option<&str>,
    completed_date: Option<&str>,
    today: NaiveDate,
) -> AppResult<()> {
    let discovered = valid_date(bug_date)?;
    if discovered > today {
        return Err(AppError::Validation("BUG 日期不能晚于今天".into()));
    }
    if let Some(due) = due_date.map(valid_date).transpose()? {
        if due < discovered {
            return Err(AppError::Validation("截止日期不能早于 BUG 日期".into()));
        }
    }
    match (status, completed_date) {
        (BugStatus::Done, Some(value)) => {
            let completed = valid_date(value)?;
            if completed < discovered || completed > today {
                return Err(AppError::Validation(
                    "完成日期必须介于 BUG 日期和今天之间".into(),
                ));
            }
        }
        (BugStatus::Done, None) => {
            return Err(AppError::Validation("已完成的 BUG 必须设置完成日期".into()))
        }
        (_, Some(_)) => {
            return Err(AppError::Validation(
                "只有已完成的 BUG 可以设置完成日期".into(),
            ))
        }
        (_, None) => {}
    }
    Ok(())
}

pub fn validate_bug(bug: &Bug, today: NaiveDate) -> AppResult<()> {
    if bug.title.trim().is_empty() {
        return Err(AppError::Validation("BUG 标题不能为空".into()));
    }
    if bug.title.trim().chars().count() > 300 {
        return Err(AppError::Validation("BUG 标题不能超过 300 个字符".into()));
    }
    if bug.description.chars().count() > 100_000 {
        return Err(AppError::Validation(
            "BUG 描述不能超过 100,000 个字符".into(),
        ));
    }
    if bug.notes.chars().count() > 20_000 {
        return Err(AppError::Validation(
            "BUG 备注不能超过 20,000 个字符".into(),
        ));
    }
    if bug.environment.chars().count() > 2_000 {
        return Err(AppError::Validation(
            "BUG 环境信息不能超过 2,000 个字符".into(),
        ));
    }
    validate_dates(
        &bug.status,
        &bug.bug_date,
        bug.due_date.as_deref(),
        bug.completed_date.as_deref(),
        today,
    )?;
    validate_resolution(&bug.status, bug.resolution.as_ref())
}

pub fn validate_resolution(
    status: &BugStatus,
    resolution: Option<&crate::models::BugResolution>,
) -> AppResult<()> {
    use crate::models::BugResolutionReason;
    if *status == BugStatus::Cancelled {
        let resolution =
            resolution.ok_or_else(|| AppError::Validation("取消 BUG 时必须说明原因".into()))?;
        if resolution.reason == BugResolutionReason::Duplicate
            && resolution
                .duplicate_of_id
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
        {
            return Err(AppError::Validation("标记为重复时必须关联原 BUG".into()));
        }
        if resolution.reason == BugResolutionReason::Other && resolution.note.trim().is_empty() {
            return Err(AppError::Validation("选择“其他”时必须填写原因".into()));
        }
        return Ok(());
    }
    if resolution.is_some() {
        return Err(AppError::Validation(
            "仅已取消的 BUG 可以保存取消原因".into(),
        ));
    }
    Ok(())
}

pub fn validate_transition(
    current: &Bug,
    change: &BugStatusChange,
    today: NaiveDate,
) -> AppResult<()> {
    if change.status == BugStatus::Done {
        validate_dates(
            &change.status,
            &current.bug_date,
            current.due_date.as_deref(),
            change.completed_date.as_deref(),
            today,
        )?;
    } else if change.completed_date.is_some() {
        return Err(AppError::Validation("未完成的 BUG 不能保留完成日期".into()));
    }

    if matches!(current.status, BugStatus::Done | BugStatus::Cancelled)
        && change.status.is_terminal()
        && change.status != current.status
    {
        return Err(AppError::Validation(
            "请先重新打开或恢复此 BUG，再设置新的结束状态".into(),
        ));
    }
    if matches!(change.status, BugStatus::Blocked | BugStatus::Deferred)
        && change.message.trim().is_empty()
    {
        return Err(AppError::Validation(
            "转为已阻塞或暂缓处理时必须填写原因".into(),
        ));
    }
    if current.status == BugStatus::PendingVerification
        && change.status == BugStatus::InProgress
        && change.message.trim().is_empty()
    {
        return Err(AppError::Validation("验证未通过时必须说明复现结果".into()));
    }
    if change.status == BugStatus::Cancelled && change.message.trim().is_empty() {
        let summary = change
            .resolution
            .as_ref()
            .map(|value| match &value.reason {
                crate::models::BugResolutionReason::Duplicate => "标记为重复".to_string(),
                crate::models::BugResolutionReason::NotBug => "确认为非 BUG".to_string(),
                crate::models::BugResolutionReason::CannotReproduce => "无法复现".to_string(),
                crate::models::BugResolutionReason::WontFix => "决定暂不修复".to_string(),
                crate::models::BugResolutionReason::Other => value.note.clone(),
            })
            .unwrap_or_default();
        if summary.trim().is_empty() {
            return Err(AppError::Validation("取消 BUG 时必须填写原因".into()));
        }
    }
    if matches!(current.status, BugStatus::Done | BugStatus::Cancelled)
        && change.status != current.status
        && change.message.trim().is_empty()
    {
        return Err(AppError::Validation(
            "重新打开或恢复已结束的 BUG 时必须填写原因".into(),
        ));
    }
    validate_resolution(&change.status, change.resolution.as_ref())
}

pub fn transition_bug(
    current: &Bug,
    change: &BugStatusChange,
    now: &str,
    today: NaiveDate,
) -> AppResult<Bug> {
    validate_transition(current, change, today)?;
    let mut updated = current.clone();
    if current.status == change.status {
        return Ok(updated);
    }

    let reopened = current.status == BugStatus::Done && change.status == BugStatus::InProgress;
    let reactivated = current.status == BugStatus::Cancelled && change.status == BugStatus::Todo;
    let verification_failed =
        current.status == BugStatus::PendingVerification && change.status == BugStatus::InProgress;
    let kind = if reopened {
        updated.reopen_count += 1;
        BugActivityKind::Reopened
    } else if reactivated {
        BugActivityKind::Reactivated
    } else if verification_failed {
        BugActivityKind::VerificationFailed
    } else {
        BugActivityKind::StatusChanged
    };
    let mut changes = vec![BugFieldChange {
        field: "status".into(),
        before: json!(current.status),
        after: json!(change.status),
    }];

    let completed_date = if change.status == BugStatus::Done {
        change.completed_date.clone()
    } else {
        None
    };
    if current.completed_date != completed_date {
        changes.push(BugFieldChange {
            field: "completedDate".into(),
            before: json!(current.completed_date),
            after: json!(completed_date),
        });
    }
    if current
        .resolution
        .as_ref()
        .map(|value| (&value.reason, &value.note, &value.duplicate_of_id))
        != change
            .resolution
            .as_ref()
            .map(|value| (&value.reason, &value.note, &value.duplicate_of_id))
    {
        changes.push(BugFieldChange {
            field: "resolution".into(),
            before: serde_json::to_value(&current.resolution)?,
            after: serde_json::to_value(&change.resolution)?,
        });
    }
    updated.status = change.status.clone();
    updated.completed_date = completed_date;
    updated.resolution = change.resolution.clone();
    updated.updated_at = now.to_string();
    updated.revision += 1;
    updated.activities.push(BugActivity {
        id: Uuid::new_v4().to_string(),
        kind,
        occurred_at: now.to_string(),
        device_id: current.device_id.clone(),
        message: change.message.trim().to_string(),
        changes,
    });
    Ok(updated)
}

pub fn today() -> NaiveDate {
    Local::now().date_naive()
}

/// Recover files left between the old-file backup and replacement steps.
pub fn recover_bug_writes(root: &Path) -> AppResult<()> {
    for space in ["personal", "work"] {
        let directory = root.join(space).join("bugs");
        if !directory.exists() {
            continue;
        }
        for entry in fs::read_dir(&directory)? {
            let path = entry?.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if name.ends_with(".json.bak") {
                let original_name = &name[..name.len() - 4];
                let target = directory.join(original_name);
                if target.exists() {
                    fs::remove_file(path)?;
                } else {
                    fs::rename(path, target)?;
                }
            } else if name.ends_with(".tmp") {
                fs::remove_file(path)?;
            }
        }
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BugMoveJournal {
    id: String,
    from: crate::models::Space,
    to: crate::models::Space,
}

pub fn begin_bug_move(
    root: &Path,
    id: &str,
    from: &crate::models::Space,
    to: &crate::models::Space,
) -> AppResult<()> {
    if id.is_empty()
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err(AppError::Validation("BUG 编号无效，无法移动".into()));
    }
    if !from.is_content_space() || !to.is_content_space() {
        return Err(AppError::Validation(
            "BUG 只能在个人空间和工作空间之间移动".into(),
        ));
    }
    let directory = root.join("config").join("bug-moves");
    fs::create_dir_all(&directory)?;
    let target = directory.join(format!("{id}.json"));
    let temporary = directory.join(format!(".{id}.{}.tmp", Uuid::new_v4()));
    let bytes = serde_json::to_vec(&BugMoveJournal {
        id: id.to_string(),
        from: from.clone(),
        to: to.clone(),
    })?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    fs::rename(&temporary, &target)?;
    Ok(())
}

pub fn recover_bug_moves(root: &Path) -> AppResult<()> {
    let directory = root.join("config").join("bug-moves");
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&directory)? {
        let path = entry?.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if name.ends_with(".tmp") {
            fs::remove_file(path)?;
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let journal: BugMoveJournal = serde_json::from_slice(&fs::read(&path)?)?;
        if journal.id.is_empty()
            || !journal
                .id
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '-')
        {
            return Err(AppError::Validation("BUG 移动恢复记录中的编号无效".into()));
        }
        if !journal.from.is_content_space() || !journal.to.is_content_space() {
            return Err(AppError::Validation("BUG 移动恢复记录中的空间无效".into()));
        }
        let source = root
            .join(journal.from.as_str())
            .join("bugs")
            .join(format!("{}.json", journal.id));
        let target = root
            .join(journal.to.as_str())
            .join("bugs")
            .join(format!("{}.json", journal.id));
        if target.is_file() {
            let moved_bug: Bug = serde_json::from_slice(&fs::read(&target)?)?;
            if moved_bug.id != journal.id || moved_bug.space != journal.to {
                return Err(AppError::Validation("BUG 移动目标与恢复记录不一致".into()));
            }
            if source.exists() {
                fs::remove_file(source)?;
            }
        }
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn finish_bug_move(root: &Path, id: &str) -> AppResult<()> {
    let path = root
        .join("config")
        .join("bug-moves")
        .join(format!("{id}.json"));
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn write_bug_json_recoverable(root: &Path, bug: &Bug) -> AppResult<()> {
    let directory = root.join(bug.space.as_str()).join("bugs");
    fs::create_dir_all(&directory)?;
    let target = directory.join(format!("{}.json", bug.id));
    let backup = directory.join(format!("{}.json.bak", bug.id));
    let temporary = directory.join(format!(".{}.{}.tmp", bug.id, Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(bug)?;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        if target.exists() {
            if backup.exists() {
                fs::remove_file(&backup)?;
            }
            fs::rename(&target, &backup)?;
        }
        if let Err(error) = fs::rename(&temporary, &target) {
            if backup.exists() && !target.exists() {
                let _ = fs::rename(&backup, &target);
            }
            return Err(AppError::Io(error));
        }
        if backup.exists() {
            fs::remove_file(&backup)?;
        }
        Ok(())
    })();
    if result.is_err() && temporary.exists() {
        let _ = fs::remove_file(temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        BugPriority, BugResolution, BugResolutionReason, BugSeverity, BugSource, BugSourceKind,
        Space,
    };

    fn day(value: &str) -> NaiveDate {
        valid_date(value).unwrap()
    }

    fn sample_bug(status: BugStatus) -> Bug {
        let done = status == BugStatus::Done;
        let cancelled = status == BugStatus::Cancelled;
        Bug {
            schema_version: 1,
            id: "bug-1".into(),
            code: "BUG-000000000001".into(),
            title: "编辑器冻结".into(),
            description: String::new(),
            notes: String::new(),
            environment: String::new(),
            status,
            priority: BugPriority::P2,
            severity: BugSeverity::S2,
            bug_date: "2026-10-15".into(),
            due_date: Some("2026-10-16".into()),
            completed_date: done.then(|| "2026-10-16".to_string()),
            space: Space::Personal,
            project_id: None,
            module: String::new(),
            version: String::new(),
            assignee: String::new(),
            reporter: String::new(),
            tags: Vec::new(),
            resolution: cancelled.then(|| BugResolution {
                reason: BugResolutionReason::NotBug,
                note: String::new(),
                duplicate_of_id: None,
                duplicate_code: None,
                duplicate_title: None,
            }),
            reopen_count: 0,
            favorite: false,
            archived: false,
            activities: Vec::new(),
            source: BugSource {
                kind: BugSourceKind::Manual,
                batch_id: None,
                row_id: None,
                line_number: None,
                copied_from_id: None,
            },
            created_at: "2026-10-15T09:00:00Z".into(),
            updated_at: "2026-10-15T09:00:00Z".into(),
            device_id: "device-1".into(),
            workspace_id: "workspace-1".into(),
            revision: 1,
        }
    }

    fn transition(status: BugStatus, message: &str) -> BugStatusChange {
        BugStatusChange {
            status,
            message: message.into(),
            completed_date: Some("2026-10-16".into()),
            resolution: None,
            expected_revision: 1,
        }
    }

    #[test]
    fn validates_date_order_and_completion_state() {
        assert!(validate_dates(
            &BugStatus::Todo,
            "2026-10-15",
            Some("2026-10-14"),
            None,
            day("2026-10-16")
        )
        .is_err());
        assert!(validate_dates(
            &BugStatus::Done,
            "2026-10-15",
            None,
            None,
            day("2026-10-16")
        )
        .is_err());
        assert!(validate_dates(
            &BugStatus::Done,
            "2026-10-15",
            None,
            Some("2026-10-17"),
            day("2026-10-16")
        )
        .is_err());
        assert!(validate_dates(
            &BugStatus::Todo,
            "2026-02-30",
            None,
            None,
            day("2026-10-16")
        )
        .is_err());
    }

    #[test]
    fn completing_sets_a_date_and_records_a_status_event() {
        let bug = sample_bug(BugStatus::InProgress);
        let updated = transition_bug(
            &bug,
            &transition(BugStatus::Done, "修复已验证"),
            "2026-10-16T09:00:00Z",
            day("2026-10-16"),
        )
        .unwrap();
        assert_eq!(updated.completed_date.as_deref(), Some("2026-10-16"));
        assert_eq!(updated.activities.len(), 1);
        assert_eq!(updated.activities[0].kind, BugActivityKind::StatusChanged);
        assert_eq!(updated.revision, 2);
    }

    #[test]
    fn reopening_preserves_completion_in_history_and_increments_once() {
        let bug = sample_bug(BugStatus::Done);
        let updated = transition_bug(
            &bug,
            &BugStatusChange {
                status: BugStatus::InProgress,
                message: "回归仍可复现".into(),
                completed_date: None,
                resolution: None,
                expected_revision: 1,
            },
            "2026-10-16T10:00:00Z",
            day("2026-10-16"),
        )
        .unwrap();
        assert_eq!(updated.completed_date, None);
        assert_eq!(updated.reopen_count, 1);
        assert_eq!(updated.activities[0].kind, BugActivityKind::Reopened);
        assert_eq!(updated.activities[0].changes[1].before, json!("2026-10-16"));
    }

    #[test]
    fn requires_a_reason_for_blocked_deferred_and_cancelled_changes() {
        assert!(validate_transition(
            &sample_bug(BugStatus::Todo),
            &transition(BugStatus::Blocked, "  "),
            day("2026-10-16")
        )
        .is_err());
        let duplicate = BugResolution {
            reason: BugResolutionReason::Duplicate,
            note: String::new(),
            duplicate_of_id: None,
            duplicate_code: None,
            duplicate_title: None,
        };
        let cancel = BugStatusChange {
            status: BugStatus::Cancelled,
            message: "重复".into(),
            completed_date: None,
            resolution: Some(duplicate),
            expected_revision: 1,
        };
        assert!(
            validate_transition(&sample_bug(BugStatus::Todo), &cancel, day("2026-10-16")).is_err()
        );
    }
}
