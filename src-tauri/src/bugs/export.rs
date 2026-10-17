use std::collections::BTreeMap;

use chrono::Local;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{Bug, BugActivityKind, BugStats, BugStatus, Space};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugExportInput {
    pub space: Space,
    #[serde(default)]
    pub query: crate::models::BugQuery,
    #[serde(default)]
    pub selected_ids: Vec<String>,
    #[serde(default)]
    pub include_archived: bool,
    pub format: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub group_by_status: bool,
    #[serde(default)]
    pub include_description: bool,
    #[serde(default)]
    pub include_notes: bool,
    #[serde(default)]
    pub include_activities: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugExport {
    pub export_id: String,
    pub title: String,
    pub file_name: String,
    pub markdown: String,
    pub generated_at: String,
    pub item_count: usize,
    pub revisions: BTreeMap<String, i64>,
    pub stats: BugStats,
}

pub fn render_export(input: &BugExportInput, mut bugs: Vec<Bug>) -> BugExport {
    bugs.sort_by(|left, right| {
        status_rank(&left.status)
            .cmp(&status_rank(&right.status))
            .then_with(|| left.due_date.cmp(&right.due_date))
            .then_with(|| left.code.cmp(&right.code))
            .then_with(|| left.id.cmp(&right.id))
    });
    let generated_at = Local::now().to_rfc3339();
    let title = if input.title.trim().is_empty() {
        "BUG 任务列表".to_string()
    } else {
        input.title.trim().to_string()
    };
    let mut markdown = format!("# {}\n\n", title.replace('\n', " "));
    markdown.push_str(&format!("- 导出时间：{}\n", &generated_at[..10]));
    markdown.push_str(&format!("- 空间：{}\n", space_label(&input.space)));
    markdown.push_str(&format!("- BUG 数量：{}\n\n", bugs.len()));

    let stats = calculate_stats(&bugs);
    let mut revisions = BTreeMap::new();
    for bug in &bugs {
        revisions.insert(bug.id.clone(), bug.revision);
    }

    if input.format == "compact" {
        render_table(&mut markdown, &bugs);
    } else if input.group_by_status {
        let mut groups: BTreeMap<&str, Vec<&Bug>> = BTreeMap::new();
        for bug in &bugs {
            groups
                .entry(status_label(&bug.status))
                .or_default()
                .push(bug);
        }
        for (status, rows) in groups {
            markdown.push_str(&format!("## {status}\n\n"));
            for bug in rows {
                render_detail(&mut markdown, bug, input);
            }
        }
    } else {
        for bug in &bugs {
            render_detail(&mut markdown, bug, input);
        }
    }

    BugExport {
        export_id: Uuid::new_v4().to_string(),
        title: title.clone(),
        file_name: format!(
            "{}-{}.md",
            safe_file_stem(&title),
            Local::now().format("%Y%m%d")
        ),
        markdown,
        generated_at,
        item_count: bugs.len(),
        revisions,
        stats,
    }
}

fn render_table(markdown: &mut String, bugs: &[Bug]) {
    markdown.push_str("| 编号 | BUG | 状态 | 优先级 | 严重度 | BUG 日期 | 截止日期 | 完成日期 |\n");
    markdown.push_str("| --- | --- | --- | --- | --- | --- | --- | --- |\n");
    for bug in bugs {
        markdown.push_str(&format!(
            "| {} | {} | {} | {} | {} | {} | {} | {} |\n",
            table_cell(&bug.code),
            table_cell(&bug.title),
            status_label(&bug.status),
            bug.priority.as_str().to_ascii_uppercase(),
            bug.severity.as_str().to_ascii_uppercase(),
            table_cell(&bug.bug_date),
            optional_cell(bug.due_date.as_deref()),
            optional_cell(bug.completed_date.as_deref()),
        ));
    }
}

fn render_detail(markdown: &mut String, bug: &Bug, input: &BugExportInput) {
    markdown.push_str(&format!(
        "### [{}] {}\n\n",
        inline(&bug.code),
        inline(&bug.title)
    ));
    markdown.push_str(&format!("- 状态：{}\n", status_label(&bug.status)));
    markdown.push_str(&format!(
        "- 优先级：{} · 严重度：{}\n",
        bug.priority.as_str().to_ascii_uppercase(),
        bug.severity.as_str().to_ascii_uppercase()
    ));
    markdown.push_str(&format!(
        "- BUG 日期：{} · 截止日期：{} · 完成日期：{}\n",
        bug.bug_date,
        value_or_dash(bug.due_date.as_deref()),
        value_or_dash(bug.completed_date.as_deref())
    ));
    if let Some(project) = bug.project_id.as_deref() {
        markdown.push_str(&format!("- 项目：{}\n", inline(project)));
    }
    if !bug.module.is_empty() {
        markdown.push_str(&format!("- 模块：{}\n", inline(&bug.module)));
    }
    if !bug.version.is_empty() {
        markdown.push_str(&format!("- 版本：{}\n", inline(&bug.version)));
    }
    if !bug.assignee.is_empty() {
        markdown.push_str(&format!("- 负责人：{}\n", inline(&bug.assignee)));
    }
    if !bug.tags.is_empty() {
        markdown.push_str(&format!(
            "- 标签：{}\n",
            bug.tags
                .iter()
                .map(|tag| format!("`{}`", inline(tag)))
                .collect::<Vec<_>>()
                .join(" ")
        ));
    }
    if let Some(resolution) = &bug.resolution {
        markdown.push_str(&format!(
            "- 取消原因：{}{}\n",
            resolution_label(&resolution.reason),
            if resolution.note.trim().is_empty() {
                String::new()
            } else {
                format!("（{}）", inline(&resolution.note))
            }
        ));
    }
    if input.include_description && !bug.description.trim().is_empty() {
        markdown.push_str(&format!("\n**描述**\n\n{}\n", block(&bug.description)));
    }
    if input.include_notes && !bug.notes.trim().is_empty() {
        markdown.push_str(&format!("\n**备注**\n\n{}\n", block(&bug.notes)));
    }
    if input.include_activities && !bug.activities.is_empty() {
        markdown.push_str("\n**处理记录**\n\n");
        for activity in &bug.activities {
            let kind = match &activity.kind {
                BugActivityKind::Created => "创建",
                BugActivityKind::Imported => "导入",
                BugActivityKind::Updated => "更新",
                BugActivityKind::StatusChanged => "状态变更",
                BugActivityKind::CommentAdded => "备注",
                BugActivityKind::Reopened => "重新打开",
                BugActivityKind::Reactivated => "重新激活",
                BugActivityKind::VerificationFailed => "验证未通过",
            };
            markdown.push_str(&format!(
                "- {} · {}{}\n",
                activity.occurred_at,
                kind,
                if activity.message.trim().is_empty() {
                    String::new()
                } else {
                    format!("：{}", inline(&activity.message))
                }
            ));
        }
    }
    markdown.push('\n');
}

fn calculate_stats(bugs: &[Bug]) -> BugStats {
    let mut stats = BugStats {
        total: bugs.len(),
        ..BugStats::default()
    };
    for bug in bugs {
        match &bug.status {
            BugStatus::Todo => stats.todo += 1,
            BugStatus::InProgress => stats.in_progress += 1,
            BugStatus::Blocked => stats.blocked += 1,
            BugStatus::PendingVerification => stats.pending_verification += 1,
            BugStatus::Deferred => stats.deferred += 1,
            BugStatus::Done => stats.completed += 1,
            BugStatus::Cancelled => stats.cancelled += 1,
        }
        if bug.favorite {
            stats.favorite += 1;
        }
    }
    let denominator = stats.total.saturating_sub(stats.cancelled);
    stats.completion_rate = if denominator == 0 {
        0
    } else {
        (stats.completed * 100) / denominator
    };
    stats
}

fn table_cell(value: &str) -> String {
    value
        .replace('|', "\\|")
        .replace('\r', " ")
        .replace('\n', "<br>")
}

fn optional_cell(value: Option<&str>) -> String {
    value.map(table_cell).unwrap_or_else(|| "—".into())
}

fn value_or_dash(value: Option<&str>) -> String {
    value.unwrap_or("—").to_string()
}

fn inline(value: &str) -> String {
    value
        .replace('|', "\\|")
        .replace('\r', " ")
        .replace('\n', " ")
        .trim()
        .to_string()
}

fn block(value: &str) -> String {
    value.replace('\r', "").trim().to_string()
}

fn safe_file_stem(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&char) {
                char
            } else {
                '-'
            }
        })
        .collect::<String>();
    let cleaned = cleaned.trim_matches('-');
    if cleaned.is_empty() {
        "bugs".into()
    } else {
        cleaned.chars().take(60).collect()
    }
}

fn status_label(status: &BugStatus) -> &'static str {
    match status {
        BugStatus::Todo => "待处理",
        BugStatus::InProgress => "处理中",
        BugStatus::Blocked => "已阻塞",
        BugStatus::PendingVerification => "待验证",
        BugStatus::Deferred => "暂缓",
        BugStatus::Done => "已完成",
        BugStatus::Cancelled => "已取消",
    }
}

fn status_rank(status: &BugStatus) -> u8 {
    match status {
        BugStatus::Todo => 0,
        BugStatus::InProgress => 1,
        BugStatus::Blocked => 2,
        BugStatus::PendingVerification => 3,
        BugStatus::Deferred => 4,
        BugStatus::Done => 5,
        BugStatus::Cancelled => 6,
    }
}

fn resolution_label(reason: &crate::models::BugResolutionReason) -> &'static str {
    match reason {
        crate::models::BugResolutionReason::Duplicate => "重复 BUG",
        crate::models::BugResolutionReason::NotBug => "确认为非 BUG",
        crate::models::BugResolutionReason::CannotReproduce => "无法复现",
        crate::models::BugResolutionReason::WontFix => "暂不修复",
        crate::models::BugResolutionReason::Other => "其他",
    }
}

fn space_label(space: &Space) -> &'static str {
    match space {
        Space::All => "全部空间",
        Space::Personal => "个人空间",
        Space::Work => "工作空间",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bug(status: BugStatus) -> Bug {
        Bug {
            schema_version: 1,
            id: "id-1".into(),
            code: "BUG-ABC123".into(),
            title: "标题 | 换行\n第二行".into(),
            description: "说明".into(),
            notes: "备注".into(),
            environment: String::new(),
            status,
            priority: crate::models::BugPriority::P1,
            severity: crate::models::BugSeverity::S2,
            bug_date: "2026-10-16".into(),
            due_date: Some("2026-10-17".into()),
            completed_date: Some("2026-10-16".into()),
            space: Space::Personal,
            project_id: None,
            module: String::new(),
            version: String::new(),
            assignee: String::new(),
            reporter: String::new(),
            tags: vec![],
            resolution: None,
            reopen_count: 0,
            favorite: false,
            archived: false,
            activities: vec![],
            source: crate::models::BugSource {
                kind: crate::models::BugSourceKind::Manual,
                batch_id: None,
                row_id: None,
                line_number: None,
                copied_from_id: None,
            },
            created_at: String::new(),
            updated_at: String::new(),
            device_id: String::new(),
            workspace_id: String::new(),
            revision: 2,
        }
    }

    fn input(format: &str) -> BugExportInput {
        BugExportInput {
            space: Space::Personal,
            query: Default::default(),
            selected_ids: vec![],
            include_archived: false,
            format: format.into(),
            title: "回归清单".into(),
            group_by_status: false,
            include_description: true,
            include_notes: true,
            include_activities: false,
        }
    }

    #[test]
    fn compact_export_keeps_state_and_escapes_table_cells() {
        let export = render_export(&input("compact"), vec![bug(BugStatus::Done)]);
        assert!(export.markdown.contains("| BUG-ABC123 | 标题 \\| 换行<br>第二行 | 已完成 | P1 | S2 | 2026-10-16 | 2026-10-17 | 2026-10-16 |"));
        assert_eq!(export.item_count, 1);
    }

    #[test]
    fn full_export_includes_requested_details_and_status() {
        let export = render_export(&input("full"), vec![bug(BugStatus::InProgress)]);
        assert!(export.markdown.contains("状态：处理中"));
        assert!(export.markdown.contains("**描述**"));
        assert!(export.markdown.contains("**备注**"));
    }

    #[test]
    fn completion_stats_exclude_cancelled_items() {
        let stats = calculate_stats(&[bug(BugStatus::Done), bug(BugStatus::Cancelled)]);
        assert_eq!(stats.completion_rate, 100);
    }
}
