use base64::Engine;
use tauri::State;

use crate::{
    backup,
    error::{AppError, AppResult},
    models::{
        AiRequest, AiResult, AppSettings, BackupInfo, Checklist, ChecklistInput, DocumentKind,
        DocumentVersion, InboxInput, InboxItem, KnowledgeFolder, KnowledgeFolderInput,
        KnowledgeNode, KnowledgePage, KnowledgePageInput, Note, NoteInput, PdfDocument,
        PluginManifest, Project, ProjectInput, ScheduleEvent, ScheduleEventInput, SearchResult,
        Space, SparkStage, SyncHistoryEntry, SyncReport, TagSummary, Task, TaskInput, Template,
        TemplateInput, TrashItem, WikiLink,
    },
    sync, AppState,
};

fn repository<'a>(
    state: &'a State<'_, AppState>,
) -> AppResult<std::sync::MutexGuard<'a, crate::workspace::WorkspaceRepository>> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::Command("Workspace 正在被其他操作占用".into()))
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    Ok(repository(&state)?.settings())
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> AppResult<AppSettings> {
    repository(&state)?.update_settings(settings)
}

#[tauri::command]
pub fn list_notes(
    state: State<'_, AppState>,
    space: Space,
    include_archived: bool,
) -> AppResult<Vec<Note>> {
    repository(&state)?.list_notes(space, include_archived)
}

#[tauri::command]
pub fn get_note(state: State<'_, AppState>, id: String) -> AppResult<Note> {
    repository(&state)?.get_note(&id)
}

#[tauri::command]
pub fn create_note(state: State<'_, AppState>, input: NoteInput) -> AppResult<Note> {
    repository(&state)?.create_note(input)
}

#[tauri::command]
pub fn update_note(state: State<'_, AppState>, note: Note) -> AppResult<Note> {
    repository(&state)?.update_note(note)
}

#[tauri::command]
pub fn archive_note(state: State<'_, AppState>, id: String, archived: bool) -> AppResult<Note> {
    repository(&state)?.archive_note(&id, archived)
}

#[tauri::command]
pub fn delete_note(state: State<'_, AppState>, id: String) -> AppResult<TrashItem> {
    repository(&state)?.delete_note(&id)
}

#[tauri::command]
pub fn list_tasks(
    state: State<'_, AppState>,
    space: Space,
    include_archived: bool,
) -> AppResult<Vec<Task>> {
    repository(&state)?.list_tasks(space, include_archived)
}

#[tauri::command]
pub fn create_task(state: State<'_, AppState>, input: TaskInput) -> AppResult<Task> {
    repository(&state)?.create_task(input)
}

#[tauri::command]
pub fn update_task(state: State<'_, AppState>, task: Task) -> AppResult<Task> {
    repository(&state)?.update_task(task)
}

#[tauri::command]
pub fn archive_task(state: State<'_, AppState>, id: String, archived: bool) -> AppResult<Task> {
    repository(&state)?.archive_task(&id, archived)
}

#[tauri::command]
pub fn delete_task(state: State<'_, AppState>, id: String) -> AppResult<TrashItem> {
    repository(&state)?.delete_task(&id)
}

#[tauri::command]
pub fn list_projects(
    state: State<'_, AppState>,
    space: Space,
    include_archived: bool,
) -> AppResult<Vec<Project>> {
    repository(&state)?.list_projects(space, include_archived)
}

#[tauri::command]
pub fn create_project(state: State<'_, AppState>, input: ProjectInput) -> AppResult<Project> {
    repository(&state)?.create_project(input)
}

#[tauri::command]
pub fn update_project(state: State<'_, AppState>, project: Project) -> AppResult<Project> {
    repository(&state)?.update_project(project)
}

#[tauri::command]
pub fn archive_project(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> AppResult<Project> {
    repository(&state)?.archive_project(&id, archived)
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, id: String) -> AppResult<TrashItem> {
    repository(&state)?.delete_project(&id)
}

#[tauri::command]
pub fn list_inbox(
    state: State<'_, AppState>,
    space: Space,
    include_archived: bool,
) -> AppResult<Vec<InboxItem>> {
    repository(&state)?.list_inbox(space, include_archived)
}

#[tauri::command]
pub fn create_inbox_item(state: State<'_, AppState>, input: InboxInput) -> AppResult<InboxItem> {
    repository(&state)?.create_inbox_item(input)
}

#[tauri::command]
pub fn update_inbox_item(state: State<'_, AppState>, item: InboxItem) -> AppResult<InboxItem> {
    repository(&state)?.update_inbox_item(item)
}

#[tauri::command]
pub fn archive_inbox_item(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> AppResult<InboxItem> {
    repository(&state)?.archive_inbox_item(&id, archived)
}

#[tauri::command]
pub fn move_inbox_item(
    state: State<'_, AppState>,
    id: String,
    space: Space,
) -> AppResult<InboxItem> {
    repository(&state)?.move_inbox_item(&id, space)
}

#[tauri::command]
pub fn update_spark_stage(
    state: State<'_, AppState>,
    id: String,
    stage: SparkStage,
) -> AppResult<InboxItem> {
    repository(&state)?.update_spark_stage(&id, stage)
}

#[tauri::command]
pub fn delete_inbox_item(state: State<'_, AppState>, id: String) -> AppResult<TrashItem> {
    repository(&state)?.delete_inbox_item(&id)
}

#[tauri::command]
pub fn list_events(
    state: State<'_, AppState>,
    space: Space,
    start_date: Option<String>,
    end_date: Option<String>,
    include_archived: bool,
) -> AppResult<Vec<ScheduleEvent>> {
    repository(&state)?.list_events(space, start_date, end_date, include_archived)
}

#[tauri::command]
pub fn get_event(state: State<'_, AppState>, id: String) -> AppResult<ScheduleEvent> {
    repository(&state)?.get_event(&id)
}

#[tauri::command]
pub fn create_event(
    state: State<'_, AppState>,
    input: ScheduleEventInput,
) -> AppResult<ScheduleEvent> {
    repository(&state)?.create_event(input)
}

#[tauri::command]
pub fn update_event(state: State<'_, AppState>, event: ScheduleEvent) -> AppResult<ScheduleEvent> {
    repository(&state)?.update_event(event)
}

#[tauri::command]
pub fn archive_event(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> AppResult<ScheduleEvent> {
    repository(&state)?.archive_event(&id, archived)
}

#[tauri::command]
pub fn delete_event(state: State<'_, AppState>, id: String) -> AppResult<TrashItem> {
    repository(&state)?.delete_event(&id)
}

#[tauri::command]
pub fn list_checklists(
    state: State<'_, AppState>,
    space: Space,
    include_archived: bool,
) -> AppResult<Vec<Checklist>> {
    repository(&state)?.list_checklists(space, include_archived)
}

#[tauri::command]
pub fn get_checklist(state: State<'_, AppState>, id: String) -> AppResult<Checklist> {
    repository(&state)?.get_checklist(&id)
}

#[tauri::command]
pub fn create_checklist(state: State<'_, AppState>, input: ChecklistInput) -> AppResult<Checklist> {
    repository(&state)?.create_checklist(input)
}

#[tauri::command]
pub fn update_checklist(state: State<'_, AppState>, checklist: Checklist) -> AppResult<Checklist> {
    repository(&state)?.update_checklist(checklist)
}

#[tauri::command]
pub fn archive_checklist(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> AppResult<Checklist> {
    repository(&state)?.archive_checklist(&id, archived)
}

#[tauri::command]
pub fn delete_checklist(state: State<'_, AppState>, id: String) -> AppResult<TrashItem> {
    repository(&state)?.delete_checklist(&id)
}

#[tauri::command]
pub fn list_templates(
    state: State<'_, AppState>,
    space: Space,
    include_archived: bool,
) -> AppResult<Vec<Template>> {
    repository(&state)?.list_templates(space, include_archived)
}

#[tauri::command]
pub fn get_template(state: State<'_, AppState>, id: String) -> AppResult<Template> {
    repository(&state)?.get_template(&id)
}

#[tauri::command]
pub fn create_template(state: State<'_, AppState>, input: TemplateInput) -> AppResult<Template> {
    repository(&state)?.create_template(input)
}

#[tauri::command]
pub fn update_template(state: State<'_, AppState>, template: Template) -> AppResult<Template> {
    repository(&state)?.update_template(template)
}

#[tauri::command]
pub fn archive_template(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> AppResult<Template> {
    repository(&state)?.archive_template(&id, archived)
}

#[tauri::command]
pub fn delete_template(state: State<'_, AppState>, id: String) -> AppResult<TrashItem> {
    repository(&state)?.delete_template(&id)
}

#[tauri::command]
pub fn list_knowledge_nodes(
    state: State<'_, AppState>,
    space: Space,
    include_archived: bool,
) -> AppResult<Vec<KnowledgeNode>> {
    repository(&state)?.list_knowledge_nodes(space, include_archived)
}

#[tauri::command]
pub fn get_knowledge_page(state: State<'_, AppState>, id: String) -> AppResult<KnowledgePage> {
    repository(&state)?.get_knowledge_page(&id)
}

#[tauri::command]
pub fn get_knowledge_folder(state: State<'_, AppState>, id: String) -> AppResult<KnowledgeFolder> {
    repository(&state)?.get_knowledge_folder(&id)
}

#[tauri::command]
pub fn create_knowledge_folder(
    state: State<'_, AppState>,
    input: KnowledgeFolderInput,
) -> AppResult<KnowledgeFolder> {
    repository(&state)?.create_knowledge_folder(input)
}

#[tauri::command]
pub fn update_knowledge_folder(
    state: State<'_, AppState>,
    folder: KnowledgeFolder,
) -> AppResult<KnowledgeFolder> {
    repository(&state)?.update_knowledge_folder(folder)
}

#[tauri::command]
pub fn create_knowledge_page(
    state: State<'_, AppState>,
    input: KnowledgePageInput,
) -> AppResult<KnowledgePage> {
    repository(&state)?.create_knowledge_page(input)
}

#[tauri::command]
pub fn update_knowledge_page(
    state: State<'_, AppState>,
    page: KnowledgePage,
) -> AppResult<KnowledgePage> {
    repository(&state)?.update_knowledge_page(page)
}

#[tauri::command]
pub fn delete_knowledge_page(state: State<'_, AppState>, id: String) -> AppResult<TrashItem> {
    repository(&state)?.delete_knowledge_page(&id)
}

#[tauri::command]
pub fn delete_knowledge_folder(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<TrashItem>> {
    repository(&state)?.delete_knowledge_folder(&id)
}

#[tauri::command]
pub fn copy_note_to_knowledge(
    state: State<'_, AppState>,
    note_id: String,
    space: Space,
    parent_id: Option<String>,
    move_source: bool,
) -> AppResult<KnowledgePage> {
    repository(&state)?.copy_note_to_knowledge(&note_id, space, parent_id, move_source)
}

#[tauri::command]
pub fn list_wiki_links(
    state: State<'_, AppState>,
    id: String,
    kind: String,
) -> AppResult<Vec<WikiLink>> {
    repository(&state)?.list_wiki_links(&id, &kind)
}

#[tauri::command]
pub fn list_wiki_backlinks(
    state: State<'_, AppState>,
    id: String,
    kind: String,
) -> AppResult<Vec<WikiLink>> {
    repository(&state)?.list_wiki_backlinks(&id, &kind)
}

#[tauri::command]
pub fn list_versions(
    state: State<'_, AppState>,
    id: String,
    kind: DocumentKind,
) -> AppResult<Vec<DocumentVersion>> {
    repository(&state)?.list_versions(&id, kind)
}

#[tauri::command]
pub fn get_version(state: State<'_, AppState>, id: String) -> AppResult<DocumentVersion> {
    repository(&state)?.get_version(&id)
}

#[tauri::command]
pub fn restore_version(state: State<'_, AppState>, id: String) -> AppResult<serde_json::Value> {
    repository(&state)?.restore_version(&id)
}

#[tauri::command]
pub fn list_trash(state: State<'_, AppState>, space: Space) -> AppResult<Vec<TrashItem>> {
    repository(&state)?.list_trash(space)
}

#[tauri::command]
pub fn restore_trash_item(state: State<'_, AppState>, id: String) -> AppResult<serde_json::Value> {
    repository(&state)?.restore_trash_item(&id)
}

#[tauri::command]
pub fn permanently_delete_trash_item(state: State<'_, AppState>, id: String) -> AppResult<()> {
    repository(&state)?.permanently_delete_trash_item(&id)
}

#[tauri::command]
pub fn purge_trash(state: State<'_, AppState>) -> AppResult<i64> {
    repository(&state)?.purge_expired_trash()
}

#[tauri::command]
pub fn create_from_template(
    state: State<'_, AppState>,
    id: String,
    space: Space,
) -> AppResult<serde_json::Value> {
    repository(&state)?.create_from_template(&id, space)
}

#[tauri::command]
pub fn promote_inbox_item(
    state: State<'_, AppState>,
    id: String,
    target: String,
) -> AppResult<serde_json::Value> {
    repository(&state)?.promote_inbox_item(&id, &target)
}

#[tauri::command]
pub fn search(
    state: State<'_, AppState>,
    query: String,
    space: Space,
) -> AppResult<Vec<SearchResult>> {
    repository(&state)?.search(&query, space)
}

#[tauri::command]
pub fn semantic_search(
    state: State<'_, AppState>,
    query: String,
    space: Space,
) -> AppResult<Vec<SearchResult>> {
    repository(&state)?.semantic_search(&query, space)
}

#[tauri::command]
pub fn list_documents(state: State<'_, AppState>, space: Space) -> AppResult<Vec<PdfDocument>> {
    repository(&state)?.list_documents(space)
}

#[tauri::command]
pub fn get_document(state: State<'_, AppState>, id: String) -> AppResult<PdfDocument> {
    repository(&state)?.get_document(&id)
}

#[tauri::command]
pub fn import_pdf(
    state: State<'_, AppState>,
    source_path: String,
    space: Space,
) -> AppResult<PdfDocument> {
    repository(&state)?.import_pdf(&source_path, space)
}

#[tauri::command]
pub fn read_pdf(state: State<'_, AppState>, id: String) -> AppResult<String> {
    Ok(base64::engine::general_purpose::STANDARD.encode(repository(&state)?.read_pdf(&id)?))
}

#[tauri::command]
pub fn export_pdf(
    state: State<'_, AppState>,
    id: String,
    target_path: String,
) -> AppResult<String> {
    repository(&state)?.export_pdf(&id, &target_path)
}

#[tauri::command]
pub fn ocr_pdf(state: State<'_, AppState>, id: String) -> AppResult<PdfDocument> {
    repository(&state)?.ocr_pdf(&id)
}

#[tauri::command]
pub fn delete_document(state: State<'_, AppState>, id: String) -> AppResult<TrashItem> {
    repository(&state)?.delete_document(&id)
}

#[tauri::command]
pub fn run_ai(state: State<'_, AppState>, request: AiRequest) -> AppResult<AiResult> {
    repository(&state)?.run_ai(request)
}

#[tauri::command]
pub fn list_plugins(state: State<'_, AppState>) -> AppResult<Vec<PluginManifest>> {
    repository(&state)?.list_plugins()
}

#[tauri::command]
pub fn install_plugin(
    state: State<'_, AppState>,
    source_path: String,
) -> AppResult<PluginManifest> {
    repository(&state)?.install_plugin(&source_path)
}

#[tauri::command]
pub fn set_plugin_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> AppResult<PluginManifest> {
    repository(&state)?.set_plugin_enabled(&id, enabled)
}

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>, space: Space) -> AppResult<Vec<TagSummary>> {
    repository(&state)?.list_tags(space)
}

#[tauri::command]
pub fn add_attachment(
    state: State<'_, AppState>,
    source_path: String,
    space: Space,
    entity_id: Option<String>,
) -> AppResult<String> {
    repository(&state)?.add_attachment(&source_path, space, entity_id)
}

#[tauri::command]
pub fn create_backup(state: State<'_, AppState>) -> AppResult<BackupInfo> {
    let repo = repository(&state)?;
    backup::create(&repo)
}

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> AppResult<Vec<BackupInfo>> {
    let repo = repository(&state)?;
    backup::list(&repo)
}

#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, name: String) -> AppResult<String> {
    let mut repo = repository(&state)?;
    backup::restore(&mut repo, &name)
}

#[tauri::command]
pub fn sync(state: State<'_, AppState>, action: String) -> AppResult<SyncReport> {
    let action = sync::SyncAction::parse(&action)?;
    let mut repo = repository(&state)?;
    sync::run(&mut repo, action)
}

#[tauri::command]
pub fn list_sync_history(state: State<'_, AppState>) -> AppResult<Vec<SyncHistoryEntry>> {
    let repo = repository(&state)?;
    sync::history(repo.root())
}
