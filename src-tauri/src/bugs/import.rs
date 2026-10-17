use std::collections::HashMap;

use chrono::Local;
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, AppResult},
    models::{
        BugDraft, BugPriority, BugResolution, BugSeverity, BugSource, BugSourceKind, BugStatus,
        Space,
    },
};

const MAX_IMPORT_BYTES: usize = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS: usize = 2_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugImportDefaults {
    pub space: Space,
    pub bug_date: String,
    pub due_date: Option<String>,
    pub status: BugStatus,
    pub priority: BugPriority,
    pub severity: BugSeverity,
    pub project_id: Option<String>,
    pub module: String,
    pub version: String,
    pub assignee: String,
    pub reporter: String,
    pub tags: Vec<String>,
    pub resolution: Option<BugResolution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugImportPreviewInput {
    pub batch_id: String,
    pub text: String,
    pub defaults: BugImportDefaults,
    pub strip_list_prefixes: bool,
    pub recognize_checkboxes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugImportPreviewRow {
    pub row_id: String,
    pub line_number: usize,
    pub raw: String,
    pub draft: Option<BugDraft>,
    pub warning: Option<String>,
    pub error: Option<String>,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugImportPreview {
    pub batch_id: String,
    pub rows: Vec<BugImportPreviewRow>,
    pub source_line_count: usize,
    pub empty_line_count: usize,
    pub duplicate_line_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugImportCommitRow {
    pub row_id: String,
    pub line_number: usize,
    pub draft: BugDraft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugImportCommitInput {
    pub batch_id: String,
    pub rows: Vec<BugImportCommitRow>,
}

pub fn parse_preview(input: &BugImportPreviewInput) -> AppResult<BugImportPreview> {
    if input.text.len() > MAX_IMPORT_BYTES {
        return Err(AppError::Validation("导入文本不能超过 2 MiB".into()));
    }
    if input.batch_id.trim().is_empty() {
        return Err(AppError::Validation("导入批次编号不能为空".into()));
    }
    if input.defaults.space == Space::All {
        return Err(AppError::Validation("请选择个人或工作空间后再导入".into()));
    }

    let normalized = input.text.replace("\r\n", "\n").replace('\r', "\n");
    let mut rows = Vec::new();
    let mut empty_line_count = 0;
    let mut duplicate_line_count = 0;
    let mut seen = HashMap::<String, usize>::new();
    let mut valid_count = 0;

    for (index, source_line) in normalized.split('\n').enumerate() {
        let line_number = index + 1;
        let raw = if index == 0 {
            source_line.trim_start_matches('\u{feff}')
        } else {
            source_line
        };
        if raw.trim().is_empty() {
            empty_line_count += 1;
            continue;
        }

        let (title, checked) =
            normalize_title(raw, input.strip_list_prefixes, input.recognize_checkboxes);
        let row_id = format!("{}:{line_number}", input.batch_id);
        let (draft, warning, error) = if title.is_empty() {
            (None, None, Some("清理列表标记后没有剩余标题".to_string()))
        } else if title.chars().count() > 300 {
            (None, None, Some("标题不能超过 300 个字符".to_string()))
        } else {
            let key = title.to_lowercase();
            let first_line = seen.get(&key).copied();
            let warning = first_line.map(|line| format!("与第 {line} 行重复；默认仅选中首条"));
            if first_line.is_some() {
                duplicate_line_count += 1;
            } else {
                seen.insert(key, line_number);
            }
            let status = if checked {
                BugStatus::Done
            } else {
                input.defaults.status.clone()
            };
            let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
            let completed_date = (status == BugStatus::Done).then(|| today.clone());
            let draft = BugDraft {
                title: title.clone(),
                space: input.defaults.space.clone(),
                description: String::new(),
                notes: String::new(),
                environment: String::new(),
                status: Some(status),
                priority: Some(input.defaults.priority.clone()),
                severity: Some(input.defaults.severity.clone()),
                bug_date: Some(input.defaults.bug_date.clone()),
                due_date: input.defaults.due_date.clone(),
                completed_date,
                project_id: input.defaults.project_id.clone(),
                module: input.defaults.module.clone(),
                version: input.defaults.version.clone(),
                assignee: input.defaults.assignee.clone(),
                reporter: input.defaults.reporter.clone(),
                tags: input.defaults.tags.clone(),
                resolution: input.defaults.resolution.clone(),
                source: Some(BugSource {
                    kind: BugSourceKind::TextImport,
                    batch_id: Some(input.batch_id.clone()),
                    row_id: Some(row_id.clone()),
                    line_number: Some(line_number),
                    copied_from_id: None,
                }),
            };
            let default_status = BugStatus::Todo;
            let draft_status = draft.status.as_ref().unwrap_or(&default_status);
            let validation = super::validate_dates(
                draft_status,
                draft.bug_date.as_deref().unwrap_or_default(),
                draft.due_date.as_deref(),
                draft.completed_date.as_deref(),
                Local::now().date_naive(),
            )
            .and_then(|_| super::validate_resolution(draft_status, draft.resolution.as_ref()));
            match validation {
                Ok(()) => {
                    valid_count += 1;
                    (Some(draft), warning, None)
                }
                Err(error) => (Some(draft), warning, Some(error.to_string())),
            }
        };
        let selected = error.is_none() && warning.is_none();
        rows.push(BugImportPreviewRow {
            row_id,
            line_number,
            raw: raw.to_string(),
            draft,
            warning,
            error,
            selected,
        });
    }

    if valid_count > MAX_IMPORT_ROWS {
        return Err(AppError::Validation("单次最多导入 2,000 条有效 BUG".into()));
    }
    Ok(BugImportPreview {
        batch_id: input.batch_id.clone(),
        rows,
        source_line_count: normalized.split('\n').count(),
        empty_line_count,
        duplicate_line_count,
    })
}

fn normalize_title(raw: &str, strip_prefix: bool, recognize_checkboxes: bool) -> (String, bool) {
    let mut title = raw.trim();
    let mut checked = false;
    if recognize_checkboxes {
        for prefix in ["- [x] ", "- [X] ", "* [x] ", "* [X] ", "+ [x] ", "+ [X] "] {
            if let Some(value) = title.strip_prefix(prefix) {
                title = value.trim_start();
                checked = true;
                break;
            }
        }
        for prefix in ["- [ ] ", "* [ ] ", "+ [ ] "] {
            if let Some(value) = title.strip_prefix(prefix) {
                title = value.trim_start();
                break;
            }
        }
    }
    if strip_prefix {
        let trimmed = title.trim_start();
        let bullet = ["- ", "* ", "+ "]
            .iter()
            .find_map(|prefix| trimmed.strip_prefix(prefix));
        if let Some(value) = bullet {
            title = value.trim_start();
        } else {
            let digits = trimmed
                .find(|char: char| !char.is_ascii_digit())
                .unwrap_or(trimmed.len());
            if digits > 0 {
                let rest = &trimmed[digits..];
                if let Some(value) = rest.strip_prefix(". ").or_else(|| rest.strip_prefix(") ")) {
                    title = value.trim_start();
                }
            }
        }
    }
    (title.trim().to_string(), checked)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(text: &str) -> BugImportPreviewInput {
        BugImportPreviewInput {
            batch_id: "batch-1".into(),
            text: text.into(),
            defaults: BugImportDefaults {
                space: Space::Personal,
                bug_date: "2026-10-16".into(),
                due_date: None,
                status: BugStatus::Todo,
                priority: BugPriority::P2,
                severity: BugSeverity::S2,
                project_id: None,
                module: String::new(),
                version: String::new(),
                assignee: String::new(),
                reporter: String::new(),
                tags: Vec::new(),
                resolution: None,
            },
            strip_list_prefixes: true,
            recognize_checkboxes: true,
        }
    }

    #[test]
    fn parses_bom_line_endings_and_keeps_original_line_numbers() {
        let preview = parse_preview(&input("\u{feff}- [ ] 首条\r\n\r2. 第二条\r")).unwrap();
        assert_eq!(preview.source_line_count, 4);
        assert_eq!(preview.empty_line_count, 2);
        assert_eq!(preview.rows[0].line_number, 1);
        assert_eq!(preview.rows[0].draft.as_ref().unwrap().title, "首条");
        assert_eq!(preview.rows[1].line_number, 3);
        assert_eq!(preview.rows[1].draft.as_ref().unwrap().title, "第二条");
    }

    #[test]
    fn checked_markdown_items_start_as_done_and_duplicate_rows_are_not_selected() {
        let preview = parse_preview(&input("- [x] 修复登录\n修复登录")).unwrap();
        assert_eq!(
            preview.rows[0].draft.as_ref().unwrap().status,
            Some(BugStatus::Done)
        );
        assert!(preview.rows[0].selected);
        assert!(!preview.rows[1].selected);
        assert_eq!(preview.duplicate_line_count, 1);
    }

    #[test]
    fn rejects_oversized_input_and_more_than_two_thousand_rows() {
        assert!(parse_preview(&input(&"x".repeat(MAX_IMPORT_BYTES + 1))).is_err());
        let text = std::iter::repeat_n("bug", MAX_IMPORT_ROWS + 1)
            .collect::<Vec<_>>()
            .join("\n");
        assert!(parse_preview(&input(&text)).is_err());
    }
}
