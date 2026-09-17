use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Space {
    All,
    Personal,
    Work,
}

impl Space {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Personal => "personal",
            Self::Work => "work",
        }
    }

    pub fn is_content_space(&self) -> bool {
        !matches!(self, Self::All)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    #[default]
    Todo,
    InProgress,
    Waiting,
    Done,
    Cancelled,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::Waiting => "waiting",
            Self::Done => "done",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Urgent,
    High,
    #[default]
    Normal,
    Low,
}

impl TaskPriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Urgent => "urgent",
            Self::High => "high",
            Self::Normal => "normal",
            Self::Low => "low",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ProjectStatus {
    #[default]
    Planning,
    Active,
    Paused,
    Completed,
    Archived,
}

impl ProjectStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Planning => "planning",
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Archived => "archived",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum InboxKind {
    #[default]
    Note,
    Task,
    Memo,
    Checklist,
    Spark,
}

impl InboxKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Task => "task",
            Self::Memo => "memo",
            Self::Checklist => "checklist",
            Self::Spark => "spark",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SparkStage {
    #[default]
    New,
    Developing,
    Converted,
}

impl SparkStage {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::New => "new",
            Self::Developing => "developing",
            Self::Converted => "converted",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub space: Space,
    pub project_id: Option<String>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum KnowledgeNodeKind {
    Folder,
    Page,
}

impl KnowledgeNodeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Folder => "folder",
            Self::Page => "page",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFolder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub space: Space,
    pub position: i64,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFolderInput {
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub space: Space,
    #[serde(default)]
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgePage {
    pub id: String,
    pub title: String,
    pub content: String,
    pub parent_id: Option<String>,
    pub space: Space,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgePageInput {
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub space: Space,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNode {
    pub id: String,
    pub title: String,
    pub kind: KnowledgeNodeKind,
    pub parent_id: Option<String>,
    pub space: Space,
    pub archived: bool,
    pub updated_at: String,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiLink {
    pub id: String,
    pub source_id: String,
    pub source_kind: String,
    pub source_title: String,
    pub target_title: String,
    pub target_id: Option<String>,
    pub target_kind: Option<String>,
    pub space: Space,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DocumentKind {
    Note,
    KnowledgePage,
}

impl DocumentKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::KnowledgePage => "knowledge_page",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersion {
    pub id: String,
    pub entity_id: String,
    pub entity_kind: DocumentKind,
    pub title: String,
    pub content: String,
    pub snapshot: serde_json::Value,
    pub space: Space,
    pub created_at: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub id: String,
    pub entity_id: String,
    pub kind: String,
    pub title: String,
    pub space: Space,
    pub original_folder: String,
    pub deleted_at: String,
    pub purge_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub space: Space,
    pub project_id: Option<String>,
    pub tags: Vec<String>,
    pub parent_id: Option<String>,
    pub favorite: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: ProjectStatus,
    pub progress: i64,
    pub space: Space,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub id: String,
    pub title: String,
    pub body: String,
    pub kind: InboxKind,
    #[serde(default)]
    pub spark_stage: Option<SparkStage>,
    pub space: Space,
    pub tags: Vec<String>,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleEvent {
    pub id: String,
    pub title: String,
    pub date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub notes: String,
    pub task_id: Option<String>,
    pub project_id: Option<String>,
    pub space: Space,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleEventInput {
    pub title: String,
    pub date: String,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    pub space: Space,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItem {
    pub id: String,
    pub text: String,
    pub completed: bool,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checklist {
    pub id: String,
    pub title: String,
    pub description: String,
    pub items: Vec<ChecklistItem>,
    pub space: Space,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub items: Vec<ChecklistItem>,
    pub space: Space,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TemplateKind {
    #[default]
    Note,
    Task,
    Project,
    Checklist,
}

impl TemplateKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Task => "task",
            Self::Project => "project",
            Self::Checklist => "checklist",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: String,
    pub kind: TemplateKind,
    pub payload: serde_json::Value,
    pub space: Space,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub kind: TemplateKind,
    pub payload: serde_json::Value,
    pub space: Space,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub snippet: String,
    pub space: Space,
    pub updated_at: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSummary {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SyncProvider {
    #[default]
    None,
    Git,
    Webdav,
    #[serde(rename = "local_folder")]
    LocalFolder,
    S3,
    Sftp,
    Smb,
}

impl SyncProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Git => "git",
            Self::Webdav => "webdav",
            Self::LocalFolder => "local_folder",
            Self::S3 => "s3",
            Self::Sftp => "sftp",
            Self::Smb => "smb",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackupSchedule {
    #[default]
    Manual,
    Daily,
    Weekly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSettings {
    #[serde(default)]
    pub provider: SyncProvider,
    pub git_remote_url: Option<String>,
    #[serde(default = "default_branch")]
    pub git_branch: String,
    pub webdav_url: Option<String>,
    pub webdav_username: Option<String>,
    pub webdav_password: Option<String>,
    pub local_folder_path: Option<String>,
    pub smb_path: Option<String>,
    pub sftp_host: Option<String>,
    #[serde(default = "default_sftp_port")]
    pub sftp_port: i64,
    pub sftp_username: Option<String>,
    pub sftp_password: Option<String>,
    pub sftp_private_key: Option<String>,
    pub sftp_remote_path: Option<String>,
    pub s3_endpoint: Option<String>,
    pub s3_bucket: Option<String>,
    pub s3_region: Option<String>,
    pub s3_access_key: Option<String>,
    pub s3_secret_key: Option<String>,
    pub s3_prefix: Option<String>,
    #[serde(default)]
    pub backup_schedule: BackupSchedule,
    #[serde(default = "default_retention")]
    pub backup_retention: i64,
}

impl Default for SyncSettings {
    fn default() -> Self {
        Self {
            provider: SyncProvider::None,
            git_remote_url: None,
            git_branch: default_branch(),
            webdav_url: None,
            webdav_username: None,
            webdav_password: None,
            local_folder_path: None,
            smb_path: None,
            sftp_host: None,
            sftp_port: default_sftp_port(),
            sftp_username: None,
            sftp_password: None,
            sftp_private_key: None,
            sftp_remote_path: None,
            s3_endpoint: None,
            s3_bucket: None,
            s3_region: None,
            s3_access_key: None,
            s3_secret_key: None,
            s3_prefix: None,
            backup_schedule: BackupSchedule::Manual,
            backup_retention: default_retention(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    #[default]
    None,
    Local,
    OpenaiCompatible,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub provider: AiProvider,
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
    #[serde(default = "default_ai_model")]
    pub model: String,
    #[serde(default = "default_ai_context_chars")]
    pub max_context_chars: i64,
    #[serde(default)]
    pub allow_external: bool,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: AiProvider::None,
            endpoint: None,
            api_key: None,
            model: default_ai_model(),
            max_context_chars: default_ai_context_chars(),
            allow_external: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_ocr_command")]
    pub command: String,
    #[serde(default)]
    pub arguments: Vec<String>,
    #[serde(default = "default_ocr_timeout_seconds")]
    pub timeout_seconds: i64,
}

impl Default for OcrSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            command: default_ocr_command(),
            arguments: Vec::new(),
            timeout_seconds: default_ocr_timeout_seconds(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSettings {
    #[serde(default = "default_semantic_enabled")]
    pub enabled: bool,
    #[serde(default = "default_semantic_limit")]
    pub result_limit: i64,
}

impl Default for SemanticSettings {
    fn default() -> Self {
        Self {
            enabled: default_semantic_enabled(),
            result_limit: default_semantic_limit(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PdfOcrStatus {
    #[default]
    NotRun,
    Pending,
    Completed,
    Failed,
}

impl PdfOcrStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotRun => "not_run",
            Self::Pending => "pending",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfDocument {
    pub id: String,
    pub title: String,
    pub file_name: String,
    pub relative_path: String,
    pub space: Space,
    pub size: u64,
    pub sha256: String,
    pub page_count: i64,
    pub extracted_text: String,
    #[serde(default)]
    pub ocr_status: PdfOcrStatus,
    pub created_at: String,
    pub updated_at: String,
    pub device_id: String,
    pub workspace_id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticDocumentRecord {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub space: Space,
    pub vector: Vec<f32>,
    pub updated_at: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub entry: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub installed_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub operation: String,
    pub content: String,
    #[serde(default)]
    pub context: String,
    #[serde(default)]
    pub question: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResult {
    pub operation: String,
    pub content: String,
    pub provider: AiProvider,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub workspace_root: String,
    pub device_id: String,
    #[serde(default = "default_space")]
    pub default_space: Space,
    #[serde(default = "default_trash_retention")]
    pub trash_retention_days: i64,
    #[serde(default)]
    pub sync: SyncSettings,
    #[serde(default)]
    pub ai: AiSettings,
    #[serde(default)]
    pub ocr: OcrSettings,
    #[serde(default)]
    pub semantic: SemanticSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub title: String,
    #[serde(default)]
    pub content: String,
    pub space: Space,
    pub project_id: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub status: TaskStatus,
    #[serde(default)]
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub space: Space,
    pub project_id: Option<String>,
    pub parent_id: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub status: ProjectStatus,
    #[serde(default)]
    pub progress: i64,
    pub space: Space,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxInput {
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub kind: InboxKind,
    #[serde(default)]
    pub spark_stage: Option<SparkStage>,
    pub space: Space,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub provider: String,
    pub action: String,
    pub message: String,
    pub changed_files: i64,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncHistoryEntry {
    pub id: String,
    pub provider: String,
    pub action: String,
    pub status: String,
    pub message: String,
    pub changed_files: i64,
    pub conflicts: Vec<String>,
    pub created_at: String,
}

fn default_branch() -> String {
    "main".to_string()
}
fn default_retention() -> i64 {
    7
}
fn default_sftp_port() -> i64 {
    22
}
fn default_ai_model() -> String {
    "local-model".to_string()
}
fn default_ai_context_chars() -> i64 {
    12_000
}
fn default_ocr_command() -> String {
    "tesseract".to_string()
}
fn default_ocr_timeout_seconds() -> i64 {
    120
}
fn default_semantic_enabled() -> bool {
    true
}
fn default_semantic_limit() -> i64 {
    20
}
fn default_space() -> Space {
    Space::Personal
}
fn default_trash_retention() -> i64 {
    30
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_settings_get_safe_phase_three_defaults() {
        let settings: AppSettings = serde_json::from_value(serde_json::json!({
            "workspaceRoot": "C:/workspace",
            "deviceId": "device",
            "defaultSpace": "personal",
            "trashRetentionDays": 30,
            "sync": {
                "provider": "none",
                "gitBranch": "main",
                "backupRetention": 7
            }
        }))
        .unwrap();
        assert!(!settings.ai.enabled);
        assert!(!settings.ocr.enabled);
        assert!(settings.semantic.enabled);
        assert_eq!(settings.sync.sftp_port, 22);
        assert_eq!(settings.sync.backup_schedule, BackupSchedule::Manual);
    }
}
