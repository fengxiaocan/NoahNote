use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

use chrono::{Duration, NaiveTime, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    ai,
    error::{AppError, AppResult},
    models::{
        AiRequest, AiResult, AppSettings, Checklist, ChecklistInput, ChecklistItem, DocumentKind,
        DocumentVersion, InboxInput, InboxItem, InboxKind, KnowledgeFolder, KnowledgeFolderInput,
        KnowledgeNode, KnowledgeNodeKind, KnowledgePage, KnowledgePageInput, Note, NoteInput,
        PdfDocument, PdfOcrStatus, PluginManifest, Project, ProjectInput, ScheduleEvent,
        ScheduleEventInput, SearchResult, Space, SparkStage, TagSummary, Task, TaskInput,
        TaskPriority, TaskStatus, Template, TemplateInput, TemplateKind, TrashItem, WikiLink,
    },
    pdf, plugins, semantic,
    storage::Database,
};

const WORKSPACE_ID: &str = "default-workspace";

pub struct WorkspaceRepository {
    root: PathBuf,
    database: Database,
    settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteMetadata {
    id: String,
    title: String,
    space: Space,
    project_id: Option<String>,
    tags: Vec<String>,
    favorite: bool,
    archived: bool,
    created_at: String,
    updated_at: String,
    device_id: String,
    workspace_id: String,
    revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgePageMetadata {
    id: String,
    title: String,
    parent_id: Option<String>,
    space: Space,
    tags: Vec<String>,
    favorite: bool,
    archived: bool,
    created_at: String,
    updated_at: String,
    device_id: String,
    workspace_id: String,
    revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentMetadata {
    id: String,
    file_name: String,
    stored_name: String,
    entity_id: Option<String>,
    space: Space,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrashManifest {
    item: TrashItem,
    payload: serde_json::Value,
}

impl WorkspaceRepository {
    pub fn open(root: PathBuf) -> AppResult<Self> {
        create_workspace_dirs(&root)?;
        let settings_path = root.join("config").join("settings.json");
        let mut settings = if settings_path.exists() {
            read_json(&settings_path)?
        } else {
            AppSettings {
                workspace_root: root.to_string_lossy().to_string(),
                device_id: Uuid::new_v4().to_string(),
                default_space: Space::Personal,
                trash_retention_days: 30,
                sync: Default::default(),
                ai: Default::default(),
                ocr: Default::default(),
                semantic: Default::default(),
            }
        };
        settings.workspace_root = root.to_string_lossy().to_string();
        if !settings_path.exists() {
            write_json_atomic(&settings_path, &settings)?;
        }
        let database = Database::open(&root.join("database").join("workspace.db"))?;
        let mut repository = Self {
            root,
            database,
            settings,
        };
        repository.reindex_files()?;
        repository.purge_expired_trash()?;
        Ok(repository)
    }

    pub fn settings(&self) -> AppSettings {
        self.settings.clone()
    }

    pub fn update_settings(&mut self, mut settings: AppSettings) -> AppResult<AppSettings> {
        settings.workspace_root = self.root.to_string_lossy().to_string();
        if settings.device_id.trim().is_empty() {
            settings.device_id = self.settings.device_id.clone();
        }
        self.settings = settings;
        write_json_atomic(&self.settings_path(), &self.settings)?;
        self.rebuild_semantic_index()?;
        Ok(self.settings.clone())
    }

    pub fn list_notes(&self, space: Space, include_archived: bool) -> AppResult<Vec<Note>> {
        self.database.list_notes(&space, include_archived)
    }
    pub fn get_note(&self, id: &str) -> AppResult<Note> {
        self.database.get_note(id)
    }
    pub fn list_tasks(&self, space: Space, include_archived: bool) -> AppResult<Vec<Task>> {
        self.database.list_tasks(&space, include_archived)
    }
    pub fn list_projects(&self, space: Space, include_archived: bool) -> AppResult<Vec<Project>> {
        self.database.list_projects(&space, include_archived)
    }
    pub fn list_inbox(&self, space: Space, include_archived: bool) -> AppResult<Vec<InboxItem>> {
        self.database.list_inbox(&space, include_archived)
    }
    pub fn list_events(
        &self,
        space: Space,
        start_date: Option<String>,
        end_date: Option<String>,
        include_archived: bool,
    ) -> AppResult<Vec<ScheduleEvent>> {
        self.database.list_events(
            &space,
            start_date.as_deref(),
            end_date.as_deref(),
            include_archived,
        )
    }
    pub fn get_event(&self, id: &str) -> AppResult<ScheduleEvent> {
        self.database.get_event(id)
    }
    pub fn list_checklists(
        &self,
        space: Space,
        include_archived: bool,
    ) -> AppResult<Vec<Checklist>> {
        self.database.list_checklists(&space, include_archived)
    }
    pub fn get_checklist(&self, id: &str) -> AppResult<Checklist> {
        self.database.get_checklist(id)
    }
    pub fn list_templates(&self, space: Space, include_archived: bool) -> AppResult<Vec<Template>> {
        self.database.list_templates(&space, include_archived)
    }
    pub fn get_template(&self, id: &str) -> AppResult<Template> {
        self.database.get_template(id)
    }
    pub fn list_knowledge_nodes(
        &self,
        space: Space,
        include_archived: bool,
    ) -> AppResult<Vec<KnowledgeNode>> {
        self.database.list_knowledge_nodes(&space, include_archived)
    }
    pub fn get_knowledge_page(&self, id: &str) -> AppResult<KnowledgePage> {
        self.database.get_knowledge_page(id)
    }
    pub fn get_knowledge_folder(&self, id: &str) -> AppResult<KnowledgeFolder> {
        self.database.get_knowledge_folder(id)
    }
    pub fn list_knowledge_pages(
        &self,
        space: Space,
        include_archived: bool,
    ) -> AppResult<Vec<KnowledgePage>> {
        self.database.list_knowledge_pages(&space, include_archived)
    }
    pub fn list_wiki_links(&self, id: &str, kind: &str) -> AppResult<Vec<WikiLink>> {
        self.database.list_wiki_links(id, kind)
    }
    pub fn list_wiki_backlinks(&self, id: &str, kind: &str) -> AppResult<Vec<WikiLink>> {
        self.database.list_wiki_backlinks(id, kind)
    }
    pub fn list_versions(
        &self,
        entity_id: &str,
        entity_kind: DocumentKind,
    ) -> AppResult<Vec<DocumentVersion>> {
        self.database.list_versions(entity_id, &entity_kind)
    }
    pub fn get_version(&self, id: &str) -> AppResult<DocumentVersion> {
        self.database.get_version(id)
    }
    pub fn restore_version(&mut self, id: &str) -> AppResult<serde_json::Value> {
        let version = self.database.get_version(id)?;
        match version.entity_kind {
            DocumentKind::Note => {
                let current = self.database.get_note(&version.entity_id)?;
                let mut note: Note = serde_json::from_value(version.snapshot)?;
                note.id = current.id;
                note.revision = current.revision + 1;
                note.updated_at = now();
                note.device_id = self.settings.device_id.clone();
                note.workspace_id = WORKSPACE_ID.into();
                self.persist_note(&note)?;
                self.database.upsert_note(&note)?;
                self.index_note_semantics(&note)?;
                self.save_note_version(&note)?;
                self.rebuild_wiki_links()?;
                Ok(serde_json::to_value(note)?)
            }
            DocumentKind::KnowledgePage => {
                let current = self.database.get_knowledge_page(&version.entity_id)?;
                let mut page: KnowledgePage = serde_json::from_value(version.snapshot)?;
                page.id = current.id;
                page.revision = current.revision + 1;
                page.updated_at = now();
                page.device_id = self.settings.device_id.clone();
                page.workspace_id = WORKSPACE_ID.into();
                self.persist_knowledge_page(&page)?;
                self.database.upsert_knowledge_page(&page)?;
                self.index_knowledge_semantics(&page)?;
                self.save_knowledge_page_version(&page)?;
                self.rebuild_wiki_links()?;
                Ok(serde_json::to_value(page)?)
            }
        }
    }
    pub fn list_trash(&self, space: Space) -> AppResult<Vec<TrashItem>> {
        self.database.list_trash(&space)
    }
    pub fn search(&self, query: &str, space: Space) -> AppResult<Vec<SearchResult>> {
        self.database.search(query, &space)
    }
    pub fn semantic_search(&self, query: &str, space: Space) -> AppResult<Vec<SearchResult>> {
        if !self.settings.semantic.enabled {
            return self.database.search(query, &space);
        }
        semantic::search(
            &self.database,
            query,
            &space,
            self.settings.semantic.result_limit.clamp(1, 100) as usize,
        )
    }
    pub fn run_ai(&self, request: AiRequest) -> AppResult<AiResult> {
        ai::run(&self.settings.ai, request)
    }
    pub fn list_documents(&self, space: Space) -> AppResult<Vec<PdfDocument>> {
        self.database.list_pdf_documents(&space)
    }
    pub fn get_document(&self, id: &str) -> AppResult<PdfDocument> {
        self.database.get_pdf_document(id)
    }
    pub fn move_document_space(&mut self, id: &str, space: Space) -> AppResult<PdfDocument> {
        validate_space(&space)?;
        let mut document = self.database.get_pdf_document(id)?;
        if document.space == space {
            return Ok(document);
        }

        let previous = document.clone();
        let previous_pdf = self.pdf_path(&previous);
        let previous_metadata = self.pdf_metadata_path(&previous);
        document.space = space;
        document.relative_path = format!("{}/documents/pdfs/{}.pdf", document.space.as_str(), document.id);
        document.updated_at = now();
        document.revision += 1;
        document.device_id = self.settings.device_id.clone();
        let next_pdf = self.pdf_path(&document);
        let next_metadata = self.pdf_metadata_path(&document);
        if next_pdf.exists() || next_metadata.exists() {
            return Err(AppError::Validation("目标空间中已存在这份 PDF".into()));
        }
        if let Some(parent) = next_pdf.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&previous_pdf, &next_pdf)?;

        let update_result = (|| -> AppResult<()> {
            self.persist_pdf_document(&document)?;
            self.database.upsert_pdf_document(&document)?;
            self.index_pdf_semantics(&document)?;
            remove_if_exists(&previous_metadata)?;
            Ok(())
        })();
        if let Err(error) = update_result {
            let _ = remove_if_exists(&next_metadata);
            let _ = fs::rename(&next_pdf, &previous_pdf);
            let _ = self.persist_pdf_document(&previous);
            let _ = self.database.upsert_pdf_document(&previous);
            let _ = self.index_pdf_semantics(&previous);
            return Err(error);
        }
        Ok(document)
    }
    pub fn import_pdf(&mut self, source_path: &str, space: Space) -> AppResult<PdfDocument> {
        validate_space(&space)?;
        let source = PathBuf::from(source_path);
        if !source.is_file() {
            return Err(AppError::Validation(format!("PDF 不存在：{source_path}")));
        }
        if source
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("pdf"))
            != Some(true)
        {
            return Err(AppError::Validation("只支持导入 PDF 文件".into()));
        }
        let file_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::Validation("无法读取 PDF 文件名".into()))?
            .to_string();
        let title = source
            .file_stem()
            .and_then(|value| value.to_str())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("未命名 PDF")
            .trim()
            .to_string();
        let bytes = fs::read(&source)?;
        let id = new_id();
        let relative_path = format!("{}/documents/pdfs/{id}.pdf", space.as_str());
        let destination = self.root.join(&relative_path);
        if source
            .canonicalize()
            .ok()
            .zip(
                destination
                    .parent()
                    .and_then(|path| path.canonicalize().ok()),
            )
            .is_some_and(|(source, parent)| source == parent.join(destination.file_name().unwrap()))
        {
            return Err(AppError::Validation("不能把 PDF 导入到自身".into()));
        }
        let timestamp = now();
        let document = PdfDocument {
            id,
            title: required_title(&title)?,
            file_name,
            relative_path,
            space,
            size: bytes.len() as u64,
            sha256: pdf::sha256(&bytes),
            page_count: pdf::page_count(&bytes),
            extracted_text: pdf::read_pdf_text(&source),
            ocr_status: PdfOcrStatus::NotRun,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
            revision: 1,
        };
        fs::copy(&source, &destination)?;
        if let Err(error) = self.persist_pdf_document(&document).and_then(|_| {
            self.database.upsert_pdf_document(&document)?;
            self.index_pdf_semantics(&document)
        }) {
            let _ = remove_if_exists(&destination);
            let _ = remove_if_exists(&self.pdf_metadata_path(&document));
            return Err(error);
        }
        Ok(document)
    }
    pub fn read_pdf(&self, id: &str) -> AppResult<Vec<u8>> {
        let document = self.database.get_pdf_document(id)?;
        Ok(fs::read(self.pdf_path(&document))?)
    }
    pub fn export_pdf(&self, id: &str, target_path: &str) -> AppResult<String> {
        let document = self.database.get_pdf_document(id)?;
        let target = PathBuf::from(target_path);
        if target.as_os_str().is_empty() || target.is_dir() {
            return Err(AppError::Validation("导出目标文件无效".into()));
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(self.pdf_path(&document), &target)?;
        Ok(target.to_string_lossy().to_string())
    }
    pub fn ocr_pdf(&mut self, id: &str) -> AppResult<PdfDocument> {
        let mut document = self.database.get_pdf_document(id)?;
        document.ocr_status = PdfOcrStatus::Pending;
        self.persist_pdf_document(&document)?;
        self.database.upsert_pdf_document(&document)?;
        match pdf::run_ocr(&self.settings.ocr, &self.pdf_path(&document)) {
            Ok(text) => {
                if !text.trim().is_empty() {
                    document.extracted_text = if document.extracted_text.trim().is_empty() {
                        text.trim().to_string()
                    } else {
                        format!("{}\n\n{}", document.extracted_text.trim(), text.trim())
                    };
                }
                document.ocr_status = PdfOcrStatus::Completed;
                document.updated_at = now();
                document.revision += 1;
                document.device_id = self.settings.device_id.clone();
                self.persist_pdf_document(&document)?;
                self.database.upsert_pdf_document(&document)?;
                self.index_pdf_semantics(&document)?;
                Ok(document)
            }
            Err(error) => {
                document.ocr_status = PdfOcrStatus::Failed;
                document.updated_at = now();
                document.revision += 1;
                self.persist_pdf_document(&document)?;
                self.database.upsert_pdf_document(&document)?;
                Err(error)
            }
        }
    }
    pub fn delete_document(&mut self, id: &str) -> AppResult<TrashItem> {
        let document = self.database.get_pdf_document(id)?;
        let item = self.trash_payload(
            "pdf",
            &document.id,
            &document.title,
            &document.space,
            "documents/pdfs",
            serde_json::to_value(&document)?,
        )?;
        let binary_trash = self
            .root
            .join("backups")
            .join("trash")
            .join(&item.id)
            .join(format!("{}.pdf", document.id));
        if let Err(error) = (|| -> AppResult<()> {
            if let Some(parent) = binary_trash.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(self.pdf_path(&document), &binary_trash)?;
            Ok(())
        })() {
            let _ = self.remove_trash_manifest(&item);
            let _ = self.database.delete_trash_item(&item.id);
            return Err(error);
        }
        remove_if_exists(&self.pdf_path(&document))?;
        remove_if_exists(&self.pdf_metadata_path(&document))?;
        self.database.delete_pdf_document(&document.id)?;
        Ok(item)
    }
    pub fn list_plugins(&self) -> AppResult<Vec<PluginManifest>> {
        plugins::list(&self.root)
    }
    pub fn install_plugin(&self, source_path: &str) -> AppResult<PluginManifest> {
        plugins::install(&self.root, Path::new(source_path))
    }
    pub fn set_plugin_enabled(&self, id: &str, enabled: bool) -> AppResult<PluginManifest> {
        plugins::set_enabled(&self.root, id, enabled)
    }
    pub fn list_tags(&self, space: Space) -> AppResult<Vec<TagSummary>> {
        self.database.list_tags(&space)
    }

    pub fn create_note(&mut self, input: NoteInput) -> AppResult<Note> {
        validate_space(&input.space)?;
        let now = now();
        let note = Note {
            id: new_id(),
            title: required_title(&input.title)?,
            content: input.content,
            space: input.space,
            project_id: input.project_id,
            tags: normalized_tags(input.tags),
            favorite: false,
            archived: false,
            created_at: now.clone(),
            updated_at: now,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
            revision: 1,
        };
        self.persist_note(&note)?;
        self.database.upsert_note(&note)?;
        self.index_note_semantics(&note)?;
        self.save_note_version(&note)?;
        self.rebuild_wiki_links()?;
        Ok(note)
    }

    pub fn update_note(&mut self, incoming: Note) -> AppResult<Note> {
        validate_space(&incoming.space)?;
        let current = self.database.get_note(&incoming.id)?;
        let mut note = incoming;
        note.title = required_title(&note.title)?;
        note.updated_at = now();
        note.revision = current.revision + 1;
        note.device_id = self.settings.device_id.clone();
        note.workspace_id = WORKSPACE_ID.into();
        if current.space != note.space {
            self.remove_note_files(&current)?;
        }
        self.persist_note(&note)?;
        self.database.upsert_note(&note)?;
        self.index_note_semantics(&note)?;
        self.save_note_version(&note)?;
        self.rebuild_wiki_links()?;
        Ok(note)
    }

    pub fn archive_note(&mut self, id: &str, archived: bool) -> AppResult<Note> {
        let mut note = self.database.get_note(id)?;
        note.archived = archived;
        self.update_note(note)
    }

    pub fn create_knowledge_folder(
        &mut self,
        input: KnowledgeFolderInput,
    ) -> AppResult<KnowledgeFolder> {
        validate_space(&input.space)?;
        self.validate_knowledge_parent(&input.space, input.parent_id.as_deref(), None)?;
        self.ensure_knowledge_title_available(&input.space, &input.name, None)?;
        let timestamp = now();
        let folder = KnowledgeFolder {
            id: new_id(),
            name: required_title(&input.name)?,
            parent_id: input.parent_id,
            space: input.space,
            position: input.position,
            archived: false,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
            revision: 1,
        };
        self.persist_knowledge_folder(&folder)?;
        self.database.upsert_knowledge_folder(&folder)?;
        Ok(folder)
    }

    pub fn update_knowledge_folder(
        &mut self,
        incoming: KnowledgeFolder,
    ) -> AppResult<KnowledgeFolder> {
        validate_space(&incoming.space)?;
        let current = self.database.get_knowledge_folder(&incoming.id)?;
        self.validate_knowledge_parent(
            &incoming.space,
            incoming.parent_id.as_deref(),
            Some(&incoming.id),
        )?;
        self.ensure_knowledge_title_available(&incoming.space, &incoming.name, Some(&incoming.id))?;
        let mut folder = incoming;
        folder.name = required_title(&folder.name)?;
        folder.updated_at = now();
        folder.revision = current.revision + 1;
        folder.device_id = self.settings.device_id.clone();
        folder.workspace_id = WORKSPACE_ID.into();
        if current.space != folder.space {
            self.remove_knowledge_folder_file(&current)?;
        }
        self.persist_knowledge_folder(&folder)?;
        self.database.upsert_knowledge_folder(&folder)?;
        Ok(folder)
    }

    pub fn move_knowledge_folder_space(
        &mut self,
        id: &str,
        space: Space,
    ) -> AppResult<KnowledgeFolder> {
        validate_space(&space)?;
        let root = self.database.get_knowledge_folder(id)?;
        if root.space == space {
            return Ok(root);
        }

        let all_folders = self.database.list_knowledge_folders(&Space::All, true)?;
        let all_pages = self.database.list_knowledge_pages(&Space::All, true)?;
        let mut folder_ids = BTreeSet::new();
        folder_ids.insert(root.id.clone());
        loop {
            let previous_count = folder_ids.len();
            for folder in &all_folders {
                if folder
                    .parent_id
                    .as_ref()
                    .is_some_and(|parent_id| folder_ids.contains(parent_id))
                {
                    folder_ids.insert(folder.id.clone());
                }
            }
            if folder_ids.len() == previous_count {
                break;
            }
        }

        let mut folders = all_folders
            .iter()
            .filter(|folder| folder_ids.contains(&folder.id))
            .cloned()
            .collect::<Vec<_>>();
        folders.sort_by_key(|folder| {
            let mut depth = 0;
            let mut parent_id = folder.parent_id.as_deref();
            while let Some(id) = parent_id {
                if !folder_ids.contains(id) {
                    break;
                }
                depth += 1;
                parent_id = all_folders
                    .iter()
                    .find(|candidate| candidate.id == id)
                    .and_then(|candidate| candidate.parent_id.as_deref());
            }
            depth
        });
        let mut pages = all_pages
            .into_iter()
            .filter(|page| {
                page.parent_id
                    .as_ref()
                    .is_some_and(|parent_id| folder_ids.contains(parent_id))
            })
            .collect::<Vec<_>>();

        let mut titles = BTreeSet::new();
        for title in folders
            .iter()
            .filter(|folder| !folder.archived)
            .map(|folder| (folder.id.as_str(), folder.name.as_str()))
            .chain(
                pages
                    .iter()
                    .filter(|page| !page.archived)
                    .map(|page| (page.id.as_str(), page.title.as_str())),
            )
        {
            if !titles.insert(title.1.to_string()) {
                return Err(AppError::Validation("知识库目录中存在重复名称，无法移动".into()));
            }
            self.ensure_knowledge_title_available(&space, title.1, Some(title.0))?;
        }

        for mut folder in folders.drain(..) {
            let previous = folder.clone();
            folder.space = space.clone();
            if folder.id == root.id
                || !folder
                    .parent_id
                    .as_ref()
                    .is_some_and(|parent_id| folder_ids.contains(parent_id))
            {
                folder.parent_id = None;
            }
            folder.updated_at = now();
            folder.revision = previous.revision + 1;
            folder.device_id = self.settings.device_id.clone();
            folder.workspace_id = WORKSPACE_ID.into();
            self.persist_knowledge_folder(&folder)?;
            self.database.upsert_knowledge_folder(&folder)?;
            self.remove_knowledge_folder_file(&previous)?;
        }

        for mut page in pages.drain(..) {
            let previous = page.clone();
            page.space = space.clone();
            if !page
                .parent_id
                .as_ref()
                .is_some_and(|parent_id| folder_ids.contains(parent_id))
            {
                page.parent_id = None;
            }
            page.updated_at = now();
            page.revision = previous.revision + 1;
            page.device_id = self.settings.device_id.clone();
            page.workspace_id = WORKSPACE_ID.into();
            self.persist_knowledge_page(&page)?;
            self.database.upsert_knowledge_page(&page)?;
            self.remove_knowledge_page_files(&previous)?;
            self.index_knowledge_semantics(&page)?;
            self.save_knowledge_page_version(&page)?;
        }
        self.rebuild_wiki_links()?;
        self.database.get_knowledge_folder(id)
    }

    pub fn create_knowledge_page(&mut self, input: KnowledgePageInput) -> AppResult<KnowledgePage> {
        validate_space(&input.space)?;
        self.validate_knowledge_parent(&input.space, input.parent_id.as_deref(), None)?;
        self.ensure_knowledge_title_available(&input.space, &input.title, None)?;
        let timestamp = now();
        let page = KnowledgePage {
            id: new_id(),
            title: required_title(&input.title)?,
            content: input.content,
            parent_id: input.parent_id,
            space: input.space,
            tags: normalized_tags(input.tags),
            favorite: false,
            archived: false,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
            revision: 1,
        };
        self.persist_knowledge_page(&page)?;
        self.database.upsert_knowledge_page(&page)?;
        self.index_knowledge_semantics(&page)?;
        self.save_knowledge_page_version(&page)?;
        self.rebuild_wiki_links()?;
        Ok(page)
    }

    pub fn update_knowledge_page(&mut self, incoming: KnowledgePage) -> AppResult<KnowledgePage> {
        validate_space(&incoming.space)?;
        let current = self.database.get_knowledge_page(&incoming.id)?;
        self.validate_knowledge_parent(&incoming.space, incoming.parent_id.as_deref(), None)?;
        self.ensure_knowledge_title_available(
            &incoming.space,
            &incoming.title,
            Some(&incoming.id),
        )?;
        let mut page = incoming;
        page.title = required_title(&page.title)?;
        page.tags = normalized_tags(page.tags);
        page.updated_at = now();
        page.revision = current.revision + 1;
        page.device_id = self.settings.device_id.clone();
        page.workspace_id = WORKSPACE_ID.into();
        if current.space != page.space {
            self.remove_knowledge_page_files(&current)?;
        }
        self.persist_knowledge_page(&page)?;
        self.database.upsert_knowledge_page(&page)?;
        self.index_knowledge_semantics(&page)?;
        self.save_knowledge_page_version(&page)?;
        self.rebuild_wiki_links()?;
        Ok(page)
    }

    pub fn copy_note_to_knowledge(
        &mut self,
        note_id: &str,
        space: Space,
        parent_id: Option<String>,
        move_source: bool,
    ) -> AppResult<KnowledgePage> {
        validate_space(&space)?;
        let note = self.database.get_note(note_id)?;
        let page = self.create_knowledge_page(KnowledgePageInput {
            title: note.title.clone(),
            content: note.content.clone(),
            parent_id,
            space,
            tags: note.tags.clone(),
        })?;
        if move_source {
            self.delete_note(note_id)?;
        }
        Ok(page)
    }

    pub fn delete_knowledge_page(&mut self, id: &str) -> AppResult<TrashItem> {
        let page = self.database.get_knowledge_page(id)?;
        let item = self.trash_payload(
            "knowledge_page",
            &page.id,
            &page.title,
            &page.space,
            "knowledge/pages",
            serde_json::to_value(&page)?,
        )?;
        self.remove_knowledge_page_files(&page)?;
        self.database.delete_knowledge_page(&page.id)?;
        self.rebuild_wiki_links()?;
        Ok(item)
    }

    pub fn delete_knowledge_folder(&mut self, id: &str) -> AppResult<Vec<TrashItem>> {
        let folder = self.database.get_knowledge_folder(id)?;
        let nodes = self.database.list_knowledge_nodes(&folder.space, true)?;
        let mut descendants = vec![folder.id.clone()];
        loop {
            let previous_len = descendants.len();
            for node in &nodes {
                if node
                    .parent_id
                    .as_deref()
                    .is_some_and(|parent| descendants.iter().any(|id| id == parent))
                    && !descendants.iter().any(|id| id == &node.id)
                {
                    descendants.push(node.id.clone());
                }
            }
            if previous_len == descendants.len() {
                break;
            }
        }

        let mut deleted = Vec::new();
        for node in nodes.iter().filter(|node| {
            descendants.iter().any(|id| id == &node.id) && node.kind == KnowledgeNodeKind::Page
        }) {
            deleted.push(self.delete_knowledge_page(&node.id)?);
        }
        for node in nodes.iter().filter(|node| {
            descendants.iter().any(|id| id == &node.id) && node.kind == KnowledgeNodeKind::Folder
        }) {
            let child = self.database.get_knowledge_folder(&node.id)?;
            deleted.push(self.trash_payload(
                "knowledge_folder",
                &child.id,
                &child.name,
                &child.space,
                "knowledge/folders",
                serde_json::to_value(&child)?,
            )?);
            self.remove_knowledge_folder_file(&child)?;
            self.database.delete_knowledge_folder(&child.id)?;
        }
        self.rebuild_wiki_links()?;
        Ok(deleted)
    }

    pub fn create_task(&mut self, input: TaskInput) -> AppResult<Task> {
        validate_space(&input.space)?;
        let now = now();
        let task = Task {
            id: new_id(),
            title: required_title(&input.title)?,
            description: input.description,
            status: input.status,
            priority: input.priority,
            due_date: normalize_date(input.due_date)?,
            space: input.space,
            project_id: input.project_id,
            tags: normalized_tags(input.tags),
            parent_id: input.parent_id,
            favorite: false,
            archived: false,
            created_at: now.clone(),
            updated_at: now,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
            revision: 1,
        };
        self.persist_json_entity("tasks", &task)?;
        self.database.upsert_task(&task)?;
        self.index_task_semantics(&task)?;
        Ok(task)
    }

    pub fn update_task(&mut self, incoming: Task) -> AppResult<Task> {
        validate_space(&incoming.space)?;
        let current = self.database.get_task(&incoming.id)?;
        let mut task = incoming;
        task.title = required_title(&task.title)?;
        task.due_date = normalize_date(task.due_date)?;
        task.updated_at = now();
        task.revision = current.revision + 1;
        task.device_id = self.settings.device_id.clone();
        task.workspace_id = WORKSPACE_ID.into();
        if current.space != task.space {
            self.remove_json_entity("tasks", &current.space, &current.id)?;
        }
        self.persist_json_entity("tasks", &task)?;
        self.database.upsert_task(&task)?;
        self.index_task_semantics(&task)?;
        Ok(task)
    }

    pub fn archive_task(&mut self, id: &str, archived: bool) -> AppResult<Task> {
        let mut task = self.database.get_task(id)?;
        task.archived = archived;
        self.update_task(task)
    }

    pub fn create_project(&mut self, input: ProjectInput) -> AppResult<Project> {
        validate_space(&input.space)?;
        let now = now();
        let project = Project {
            id: new_id(),
            name: required_title(&input.name)?,
            description: input.description,
            status: input.status,
            progress: input.progress.clamp(0, 100),
            space: input.space,
            tags: normalized_tags(input.tags),
            favorite: false,
            archived: false,
            created_at: now.clone(),
            updated_at: now,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
            revision: 1,
        };
        self.persist_json_entity("projects", &project)?;
        self.database.upsert_project(&project)?;
        self.index_project_semantics(&project)?;
        Ok(project)
    }

    pub fn update_project(&mut self, incoming: Project) -> AppResult<Project> {
        validate_space(&incoming.space)?;
        let current = self.database.get_project(&incoming.id)?;
        let mut project = incoming;
        project.name = required_title(&project.name)?;
        project.progress = project.progress.clamp(0, 100);
        project.updated_at = now();
        project.revision = current.revision + 1;
        project.device_id = self.settings.device_id.clone();
        project.workspace_id = WORKSPACE_ID.into();
        if current.space != project.space {
            self.remove_json_entity("projects", &current.space, &current.id)?;
        }
        self.persist_json_entity("projects", &project)?;
        self.database.upsert_project(&project)?;
        self.index_project_semantics(&project)?;
        Ok(project)
    }

    pub fn archive_project(&mut self, id: &str, archived: bool) -> AppResult<Project> {
        let mut project = self.database.get_project(id)?;
        project.archived = archived;
        self.update_project(project)
    }

    pub fn create_inbox_item(&mut self, input: InboxInput) -> AppResult<InboxItem> {
        validate_space(&input.space)?;
        let now = now();
        let item = InboxItem {
            id: new_id(),
            title: required_title(&input.title)?,
            body: input.body,
            kind: input.kind.clone(),
            spark_stage: if input.kind == InboxKind::Spark {
                Some(input.spark_stage.unwrap_or_default())
            } else {
                None
            },
            space: input.space,
            tags: normalized_tags(input.tags),
            archived: false,
            created_at: now.clone(),
            updated_at: now,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
        };
        self.persist_json_entity("inbox", &item)?;
        self.database.upsert_inbox(&item)?;
        self.index_inbox_semantics(&item)?;
        Ok(item)
    }

    pub fn update_inbox_item(&mut self, incoming: InboxItem) -> AppResult<InboxItem> {
        validate_space(&incoming.space)?;
        let current = self.database.get_inbox(&incoming.id)?;
        let mut item = incoming;
        item.title = required_title(&item.title)?;
        item.spark_stage = if item.kind == InboxKind::Spark {
            Some(item.spark_stage.unwrap_or_default())
        } else {
            None
        };
        item.tags = normalized_tags(item.tags);
        item.updated_at = now();
        item.device_id = self.settings.device_id.clone();
        item.workspace_id = WORKSPACE_ID.into();
        if current.space != item.space {
            self.remove_json_entity("inbox", &current.space, &current.id)?;
        }
        self.persist_json_entity("inbox", &item)?;
        self.database.upsert_inbox(&item)?;
        self.index_inbox_semantics(&item)?;
        Ok(item)
    }

    pub fn archive_inbox_item(&mut self, id: &str, archived: bool) -> AppResult<InboxItem> {
        let mut item = self.database.get_inbox(id)?;
        item.archived = archived;
        item.updated_at = now();
        self.persist_json_entity("inbox", &item)?;
        self.database.upsert_inbox(&item)?;
        self.index_inbox_semantics(&item)?;
        Ok(item)
    }

    pub fn move_inbox_item(&mut self, id: &str, space: Space) -> AppResult<InboxItem> {
        validate_space(&space)?;
        let mut item = self.database.get_inbox(id)?;
        if item.space != space {
            self.remove_json_entity("inbox", &item.space, &item.id)?;
        }
        item.space = space;
        item.updated_at = now();
        item.device_id = self.settings.device_id.clone();
        item.workspace_id = WORKSPACE_ID.into();
        self.persist_json_entity("inbox", &item)?;
        self.database.upsert_inbox(&item)?;
        self.index_inbox_semantics(&item)?;
        Ok(item)
    }

    pub fn update_spark_stage(&mut self, id: &str, stage: SparkStage) -> AppResult<InboxItem> {
        let mut item = self.database.get_inbox(id)?;
        if item.kind != InboxKind::Spark {
            return Err(AppError::Validation("只有思维灵光可以修改灵光状态".into()));
        }
        item.spark_stage = Some(stage);
        item.updated_at = now();
        self.persist_json_entity("inbox", &item)?;
        self.database.upsert_inbox(&item)?;
        self.index_inbox_semantics(&item)?;
        Ok(item)
    }

    pub fn create_event(&mut self, input: ScheduleEventInput) -> AppResult<ScheduleEvent> {
        validate_space(&input.space)?;
        let (start_time, end_time) =
            normalize_event_times(input.all_day, input.start_time, input.end_time)?;
        let now = now();
        let event = ScheduleEvent {
            id: new_id(),
            title: required_title(&input.title)?,
            date: required_date(&input.date)?,
            start_time,
            end_time,
            all_day: input.all_day,
            notes: input.notes.trim().to_string(),
            task_id: input.task_id,
            project_id: input.project_id,
            space: input.space,
            tags: normalized_tags(input.tags),
            favorite: false,
            archived: false,
            created_at: now.clone(),
            updated_at: now,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
            revision: 1,
        };
        self.persist_json_entity("events", &event)?;
        self.database.upsert_event(&event)?;
        self.index_event_semantics(&event)?;
        Ok(event)
    }

    pub fn update_event(&mut self, incoming: ScheduleEvent) -> AppResult<ScheduleEvent> {
        validate_space(&incoming.space)?;
        let current = self.database.get_event(&incoming.id)?;
        let mut event = incoming;
        event.title = required_title(&event.title)?;
        event.date = required_date(&event.date)?;
        (event.start_time, event.end_time) =
            normalize_event_times(event.all_day, event.start_time, event.end_time)?;
        event.notes = event.notes.trim().to_string();
        event.updated_at = now();
        event.revision = current.revision + 1;
        event.device_id = self.settings.device_id.clone();
        event.workspace_id = WORKSPACE_ID.into();
        if current.space != event.space {
            self.remove_json_entity("events", &current.space, &current.id)?;
        }
        self.persist_json_entity("events", &event)?;
        self.database.upsert_event(&event)?;
        self.index_event_semantics(&event)?;
        Ok(event)
    }

    pub fn archive_event(&mut self, id: &str, archived: bool) -> AppResult<ScheduleEvent> {
        let mut event = self.database.get_event(id)?;
        event.archived = archived;
        self.update_event(event)
    }

    pub fn create_checklist(&mut self, input: ChecklistInput) -> AppResult<Checklist> {
        validate_space(&input.space)?;
        let now = now();
        let checklist = Checklist {
            id: new_id(),
            title: required_title(&input.title)?,
            description: input.description.trim().to_string(),
            items: normalize_checklist_items(input.items),
            space: input.space,
            tags: normalized_tags(input.tags),
            favorite: false,
            archived: false,
            created_at: now.clone(),
            updated_at: now,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
            revision: 1,
        };
        self.persist_json_entity("checklists", &checklist)?;
        self.database.upsert_checklist(&checklist)?;
        self.index_checklist_semantics(&checklist)?;
        Ok(checklist)
    }

    pub fn update_checklist(&mut self, incoming: Checklist) -> AppResult<Checklist> {
        validate_space(&incoming.space)?;
        let current = self.database.get_checklist(&incoming.id)?;
        let mut checklist = incoming;
        checklist.title = required_title(&checklist.title)?;
        checklist.description = checklist.description.trim().to_string();
        checklist.items = normalize_checklist_items(checklist.items);
        checklist.updated_at = now();
        checklist.revision = current.revision + 1;
        checklist.device_id = self.settings.device_id.clone();
        checklist.workspace_id = WORKSPACE_ID.into();
        if current.space != checklist.space {
            self.remove_json_entity("checklists", &current.space, &current.id)?;
        }
        self.persist_json_entity("checklists", &checklist)?;
        self.database.upsert_checklist(&checklist)?;
        self.index_checklist_semantics(&checklist)?;
        Ok(checklist)
    }

    pub fn archive_checklist(&mut self, id: &str, archived: bool) -> AppResult<Checklist> {
        let mut checklist = self.database.get_checklist(id)?;
        checklist.archived = archived;
        self.update_checklist(checklist)
    }

    pub fn create_template(&mut self, input: TemplateInput) -> AppResult<Template> {
        validate_space(&input.space)?;
        validate_template_payload(&input.kind, &input.payload)?;
        let now = now();
        let template = Template {
            id: new_id(),
            name: required_title(&input.name)?,
            description: input.description.trim().to_string(),
            kind: input.kind,
            payload: input.payload,
            space: input.space,
            archived: false,
            created_at: now.clone(),
            updated_at: now,
            device_id: self.settings.device_id.clone(),
            workspace_id: WORKSPACE_ID.into(),
            revision: 1,
        };
        self.persist_json_entity("templates", &template)?;
        self.database.upsert_template(&template)?;
        self.index_template_semantics(&template)?;
        Ok(template)
    }

    pub fn update_template(&mut self, incoming: Template) -> AppResult<Template> {
        validate_space(&incoming.space)?;
        validate_template_payload(&incoming.kind, &incoming.payload)?;
        let current = self.database.get_template(&incoming.id)?;
        let mut template = incoming;
        template.name = required_title(&template.name)?;
        template.description = template.description.trim().to_string();
        template.updated_at = now();
        template.revision = current.revision + 1;
        template.device_id = self.settings.device_id.clone();
        template.workspace_id = WORKSPACE_ID.into();
        if current.space != template.space {
            self.remove_json_entity("templates", &current.space, &current.id)?;
        }
        self.persist_json_entity("templates", &template)?;
        self.database.upsert_template(&template)?;
        self.index_template_semantics(&template)?;
        Ok(template)
    }

    pub fn archive_template(&mut self, id: &str, archived: bool) -> AppResult<Template> {
        let mut template = self.database.get_template(id)?;
        template.archived = archived;
        self.update_template(template)
    }

    pub fn delete_note(&mut self, id: &str) -> AppResult<TrashItem> {
        let note = self.database.get_note(id)?;
        let item = self.trash_payload(
            "note",
            &note.id,
            &note.title,
            &note.space,
            "notes",
            serde_json::to_value(&note)?,
        )?;
        self.remove_note_files(&note)?;
        self.database.delete_note(&note.id)?;
        self.rebuild_wiki_links()?;
        Ok(item)
    }

    pub fn delete_task(&mut self, id: &str) -> AppResult<TrashItem> {
        let task = self.database.get_task(id)?;
        let item = self.trash_payload(
            "task",
            &task.id,
            &task.title,
            &task.space,
            "tasks",
            serde_json::to_value(&task)?,
        )?;
        self.remove_json_entity("tasks", &task.space, &task.id)?;
        self.database.delete_task(&task.id)?;
        Ok(item)
    }

    pub fn delete_project(&mut self, id: &str) -> AppResult<TrashItem> {
        let project = self.database.get_project(id)?;
        let item = self.trash_payload(
            "project",
            &project.id,
            &project.name,
            &project.space,
            "projects",
            serde_json::to_value(&project)?,
        )?;
        self.remove_json_entity("projects", &project.space, &project.id)?;
        self.database.delete_project(&project.id)?;
        Ok(item)
    }

    pub fn delete_inbox_item(&mut self, id: &str) -> AppResult<TrashItem> {
        let item_value = self.database.get_inbox(id)?;
        let item = self.trash_payload(
            "inbox",
            &item_value.id,
            &item_value.title,
            &item_value.space,
            "inbox",
            serde_json::to_value(&item_value)?,
        )?;
        self.remove_json_entity("inbox", &item_value.space, &item_value.id)?;
        self.database.delete_inbox(&item_value.id)?;
        Ok(item)
    }

    pub fn delete_event(&mut self, id: &str) -> AppResult<TrashItem> {
        let event = self.database.get_event(id)?;
        let item = self.trash_payload(
            "event",
            &event.id,
            &event.title,
            &event.space,
            "events",
            serde_json::to_value(&event)?,
        )?;
        self.remove_json_entity("events", &event.space, &event.id)?;
        self.database.delete_event(&event.id)?;
        Ok(item)
    }

    pub fn delete_checklist(&mut self, id: &str) -> AppResult<TrashItem> {
        let checklist = self.database.get_checklist(id)?;
        let item = self.trash_payload(
            "checklist",
            &checklist.id,
            &checklist.title,
            &checklist.space,
            "checklists",
            serde_json::to_value(&checklist)?,
        )?;
        self.remove_json_entity("checklists", &checklist.space, &checklist.id)?;
        self.database.delete_checklist(&checklist.id)?;
        Ok(item)
    }

    pub fn delete_template(&mut self, id: &str) -> AppResult<TrashItem> {
        let template = self.database.get_template(id)?;
        let item = self.trash_payload(
            "template",
            &template.id,
            &template.name,
            &template.space,
            "templates",
            serde_json::to_value(&template)?,
        )?;
        self.remove_json_entity("templates", &template.space, &template.id)?;
        self.database.delete_template(&template.id)?;
        Ok(item)
    }

    pub fn restore_trash_item(&mut self, id: &str) -> AppResult<serde_json::Value> {
        let (item, payload) = self.database.get_trash_record(id)?;
        self.ensure_trash_restore_target_free(&item)?;
        let restored = match item.kind.as_str() {
            "note" => {
                let note: Note = serde_json::from_value(payload)?;
                self.persist_note(&note)?;
                self.database.upsert_note(&note)?;
                self.save_note_version(&note)?;
                self.index_note_semantics(&note)?;
                serde_json::to_value(note)?
            }
            "task" => {
                let task: Task = serde_json::from_value(payload)?;
                self.persist_json_entity("tasks", &task)?;
                self.database.upsert_task(&task)?;
                self.index_task_semantics(&task)?;
                serde_json::to_value(task)?
            }
            "project" => {
                let project: Project = serde_json::from_value(payload)?;
                self.persist_json_entity("projects", &project)?;
                self.database.upsert_project(&project)?;
                self.index_project_semantics(&project)?;
                serde_json::to_value(project)?
            }
            "inbox" => {
                let inbox: InboxItem = serde_json::from_value(payload)?;
                self.persist_json_entity("inbox", &inbox)?;
                self.database.upsert_inbox(&inbox)?;
                self.index_inbox_semantics(&inbox)?;
                serde_json::to_value(inbox)?
            }
            "event" => {
                let event: ScheduleEvent = serde_json::from_value(payload)?;
                self.persist_json_entity("events", &event)?;
                self.database.upsert_event(&event)?;
                self.index_event_semantics(&event)?;
                serde_json::to_value(event)?
            }
            "checklist" => {
                let checklist: Checklist = serde_json::from_value(payload)?;
                self.persist_json_entity("checklists", &checklist)?;
                self.database.upsert_checklist(&checklist)?;
                self.index_checklist_semantics(&checklist)?;
                serde_json::to_value(checklist)?
            }
            "template" => {
                let template: Template = serde_json::from_value(payload)?;
                self.persist_json_entity("templates", &template)?;
                self.database.upsert_template(&template)?;
                self.index_template_semantics(&template)?;
                serde_json::to_value(template)?
            }
            "knowledge_page" => {
                let page: KnowledgePage = serde_json::from_value(payload)?;
                self.persist_knowledge_page(&page)?;
                self.database.upsert_knowledge_page(&page)?;
                self.save_knowledge_page_version(&page)?;
                self.index_knowledge_semantics(&page)?;
                serde_json::to_value(page)?
            }
            "knowledge_folder" => {
                let folder: KnowledgeFolder = serde_json::from_value(payload)?;
                self.persist_knowledge_folder(&folder)?;
                self.database.upsert_knowledge_folder(&folder)?;
                serde_json::to_value(folder)?
            }
            "pdf" => {
                let document: PdfDocument = serde_json::from_value(payload)?;
                let path = self.pdf_path(&document);
                let source = self
                    .root
                    .join("backups")
                    .join("trash")
                    .join(&item.id)
                    .join(format!("{}.pdf", document.id));
                if !source.is_file() {
                    return Err(AppError::NotFound("回收站中的 PDF 文件已不存在".into()));
                }
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(source, &path)?;
                self.persist_pdf_document(&document)?;
                self.database.upsert_pdf_document(&document)?;
                self.index_pdf_semantics(&document)?;
                serde_json::to_value(document)?
            }
            _ => return Err(AppError::Validation("回收站内容类型无效".into())),
        };
        self.remove_trash_manifest(&item)?;
        self.database.delete_trash_item(&item.id)?;
        if item.kind == "pdf" {
            remove_if_exists(
                &self
                    .root
                    .join("backups")
                    .join("trash")
                    .join(&item.id)
                    .join(format!("{}.pdf", item.entity_id)),
            )?;
        }
        self.rebuild_wiki_links()?;
        Ok(restored)
    }

    pub fn permanently_delete_trash_item(&mut self, id: &str) -> AppResult<()> {
        let (item, _) = self.database.get_trash_record(id)?;
        self.remove_trash_manifest(&item)?;
        if item.kind == "pdf" {
            remove_if_exists(
                &self
                    .root
                    .join("backups")
                    .join("trash")
                    .join(&item.id)
                    .join(format!("{}.pdf", item.entity_id)),
            )?;
        }
        self.database.delete_trash_item(&item.id)
    }

    pub fn purge_expired_trash(&mut self) -> AppResult<i64> {
        let now = Utc::now();
        let items = self.database.list_trash(&Space::All)?;
        let mut purged = 0;
        for item in items {
            let expired = chrono::DateTime::parse_from_rfc3339(&item.purge_at)
                .map(|date| date.with_timezone(&Utc) <= now)
                .unwrap_or(false);
            if expired {
                self.permanently_delete_trash_item(&item.id)?;
                purged += 1;
            }
        }
        Ok(purged)
    }

    pub fn create_from_template(&mut self, id: &str, space: Space) -> AppResult<serde_json::Value> {
        validate_space(&space)?;
        let template = self.database.get_template(id)?;
        let payload = template_payload_with_space(&template.payload, &space)?;
        match template.kind {
            TemplateKind::Note => Ok(serde_json::to_value(
                self.create_note(serde_json::from_value(payload)?)?,
            )?),
            TemplateKind::Task => Ok(serde_json::to_value(
                self.create_task(serde_json::from_value(payload)?)?,
            )?),
            TemplateKind::Project => Ok(serde_json::to_value(
                self.create_project(serde_json::from_value(payload)?)?,
            )?),
            TemplateKind::Checklist => Ok(serde_json::to_value(
                self.create_checklist(serde_json::from_value(payload)?)?,
            )?),
        }
    }

    pub fn promote_inbox_item(&mut self, id: &str, target: &str) -> AppResult<serde_json::Value> {
        let item = self.database.get_inbox(id)?;
        let promoted = match target {
            "note" => serde_json::to_value(self.create_note(NoteInput {
                title: item.title.clone(),
                content: item.body.clone(),
                space: item.space.clone(),
                project_id: None,
                tags: item.tags.clone(),
            })?)?,
            "task" => serde_json::to_value(self.create_task(TaskInput {
                title: item.title.clone(),
                description: item.body.clone(),
                status: TaskStatus::Todo,
                priority: TaskPriority::Normal,
                due_date: None,
                space: item.space.clone(),
                project_id: None,
                parent_id: None,
                tags: item.tags.clone(),
            })?)?,
            _ => return Err(AppError::Validation("只能转为笔记或任务".into())),
        };
        if item.kind == InboxKind::Spark {
            self.update_spark_stage(id, SparkStage::Converted)?;
        } else {
            self.archive_inbox_item(id, true)?;
        }
        Ok(promoted)
    }

    pub fn add_attachment(
        &mut self,
        source_path: &str,
        space: Space,
        entity_id: Option<String>,
    ) -> AppResult<String> {
        validate_space(&space)?;
        let source = PathBuf::from(source_path);
        if !source.is_file() {
            return Err(AppError::Validation(format!("附件不存在：{source_path}")));
        }
        let file_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::Validation("无法读取附件名称".into()))?;
        let safe_name = file_name.replace(['/', '\\', ':'], "_");
        let id = new_id();
        let destination = self
            .space_dir(&space)
            .join("attachments")
            .join(format!("{id}-{safe_name}"));
        let stored_name = destination
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::Validation("无法生成附件名称".into()))?
            .to_string();
        fs::create_dir_all(destination.parent().unwrap_or(self.root()))?;
        fs::copy(&source, &destination)?;
        let metadata = AttachmentMetadata {
            id: id.clone(),
            file_name: file_name.to_string(),
            stored_name,
            entity_id: entity_id.clone(),
            space: space.clone(),
            created_at: now(),
        };
        if let Err(error) =
            write_json_atomic(&destination.with_file_name(format!("{id}.json")), &metadata)
        {
            let _ = fs::remove_file(&destination);
            return Err(error);
        }
        self.database.add_attachment(
            &id,
            file_name,
            &destination.to_string_lossy(),
            entity_id.as_deref(),
            &space,
            &metadata.created_at,
        )?;
        Ok(destination.to_string_lossy().to_string())
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn database(&self) -> &Database {
        &self.database
    }
    pub fn reindex(&self) -> AppResult<()> {
        self.reindex_files()
    }
    pub fn reload_settings(&mut self) -> AppResult<()> {
        self.settings = read_json(&self.settings_path())?;
        self.settings.workspace_root = self.root.to_string_lossy().to_string();
        Ok(())
    }

    pub(crate) fn ensure_structure(&self) -> AppResult<()> {
        create_workspace_dirs(&self.root)
    }

    fn reindex_files(&self) -> AppResult<()> {
        self.database.clear_content()?;
        for space in [Space::Personal, Space::Work] {
            self.reindex_notes(&space)?;
            self.reindex_json_entities::<Task, _>(&space, "tasks", |database, task| {
                database.upsert_task(task)
            })?;
            self.reindex_json_entities::<Project, _>(&space, "projects", |database, project| {
                database.upsert_project(project)
            })?;
            self.reindex_json_entities::<InboxItem, _>(&space, "inbox", |database, item| {
                database.upsert_inbox(item)
            })?;
            self.reindex_json_entities::<ScheduleEvent, _>(&space, "events", |database, event| {
                database.upsert_event(event)
            })?;
            self.reindex_json_entities::<Checklist, _>(
                &space,
                "checklists",
                |database, checklist| database.upsert_checklist(checklist),
            )?;
            self.reindex_json_entities::<Template, _>(
                &space,
                "templates",
                |database, template| database.upsert_template(template),
            )?;
            self.reindex_knowledge(&space)?;
            self.reindex_documents(&space)?;
            self.reindex_attachments(&space)?;
        }
        self.reindex_versions()?;
        self.reindex_trash()?;
        self.rebuild_wiki_links()?;
        self.rebuild_semantic_index()?;
        Ok(())
    }

    fn reindex_knowledge(&self, space: &Space) -> AppResult<()> {
        let folders = self.space_dir(space).join("knowledge").join("folders");
        for entry in fs::read_dir(folders)? {
            let path = entry?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let folder: KnowledgeFolder = read_json(&path)?;
            self.database.upsert_knowledge_folder(&folder)?;
        }

        let pages = self.space_dir(space).join("knowledge").join("pages");
        for entry in fs::read_dir(pages)? {
            let path = entry?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let metadata: KnowledgePageMetadata = read_json(&path)?;
            let page = KnowledgePage {
                id: metadata.id,
                title: metadata.title,
                content: fs::read_to_string(path.with_extension("md")).unwrap_or_default(),
                parent_id: metadata.parent_id,
                space: metadata.space,
                tags: metadata.tags,
                favorite: metadata.favorite,
                archived: metadata.archived,
                created_at: metadata.created_at,
                updated_at: metadata.updated_at,
                device_id: metadata.device_id,
                workspace_id: metadata.workspace_id,
                revision: metadata.revision,
            };
            self.database.upsert_knowledge_page(&page)?;
        }
        Ok(())
    }

    fn reindex_documents(&self, space: &Space) -> AppResult<()> {
        let directory = self.space_dir(space).join("documents").join("pdfs");
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let document: PdfDocument = read_json(&path)?;
            if document.space != *space || !self.pdf_path(&document).is_file() {
                continue;
            }
            self.database.upsert_pdf_document(&document)?;
        }
        Ok(())
    }

    fn rebuild_semantic_index(&self) -> AppResult<()> {
        self.database.clear_semantic_index()?;
        if !self.settings.semantic.enabled {
            return Ok(());
        }
        for space in [Space::Personal, Space::Work] {
            for note in self.database.list_notes(&space, true)? {
                self.index_note_semantics(&note)?;
            }
            for task in self.database.list_tasks(&space, true)? {
                self.index_task_semantics(&task)?;
            }
            for project in self.database.list_projects(&space, true)? {
                self.index_project_semantics(&project)?;
            }
            for item in self.database.list_inbox(&space, true)? {
                self.index_inbox_semantics(&item)?;
            }
            for event in self.database.list_events(&space, None, None, true)? {
                self.index_event_semantics(&event)?;
            }
            for checklist in self.database.list_checklists(&space, true)? {
                self.index_checklist_semantics(&checklist)?;
            }
            for template in self.database.list_templates(&space, true)? {
                self.index_template_semantics(&template)?;
            }
            for page in self.database.list_knowledge_pages(&space, true)? {
                self.index_knowledge_semantics(&page)?;
            }
            for document in self.database.list_pdf_documents(&space)? {
                self.index_pdf_semantics(&document)?;
            }
        }
        Ok(())
    }

    fn reindex_versions(&self) -> AppResult<()> {
        for space in [Space::Personal, Space::Work] {
            let directory = self.space_dir(&space).join("history");
            for entry in WalkDir::new(directory).into_iter().filter_map(Result::ok) {
                let path = entry.path();
                if !entry.file_type().is_file()
                    || path.extension().and_then(|value| value.to_str()) != Some("json")
                {
                    continue;
                }
                let version: DocumentVersion = read_json(path)?;
                self.database.upsert_version(&version)?;
            }
        }
        Ok(())
    }

    fn reindex_trash(&self) -> AppResult<()> {
        for space in [Space::Personal, Space::Work] {
            let directory = self.space_dir(&space).join("trash");
            for entry in WalkDir::new(directory).into_iter().filter_map(Result::ok) {
                let path = entry.path();
                if !entry.file_type().is_file()
                    || path.extension().and_then(|value| value.to_str()) != Some("json")
                {
                    continue;
                }
                let manifest: TrashManifest = read_json(path)?;
                self.database
                    .upsert_trash_item(&manifest.item, &manifest.payload)?;
            }
        }
        Ok(())
    }

    fn reindex_notes(&self, space: &Space) -> AppResult<()> {
        let directory = self.space_dir(space).join("notes");
        for entry in fs::read_dir(&directory)? {
            let path = entry?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let metadata: NoteMetadata = read_json(&path)?;
            let markdown_path = path.with_extension("md");
            let content = fs::read_to_string(markdown_path).unwrap_or_default();
            let note = Note {
                id: metadata.id,
                title: metadata.title,
                content,
                space: metadata.space,
                project_id: metadata.project_id,
                tags: metadata.tags,
                favorite: metadata.favorite,
                archived: metadata.archived,
                created_at: metadata.created_at,
                updated_at: metadata.updated_at,
                device_id: metadata.device_id,
                workspace_id: metadata.workspace_id,
                revision: metadata.revision,
            };
            self.database.upsert_note(&note)?;
        }
        Ok(())
    }

    fn reindex_json_entities<T, F>(
        &self,
        space: &Space,
        folder: &str,
        mut upsert: F,
    ) -> AppResult<()>
    where
        T: DeserializeOwned,
        F: FnMut(&Database, &T) -> AppResult<()>,
    {
        let directory = self.space_dir(space).join(folder);
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let entity: T = read_json(&path)?;
            upsert(&self.database, &entity)?;
        }
        Ok(())
    }

    fn reindex_attachments(&self, space: &Space) -> AppResult<()> {
        let directory = self.space_dir(space).join("attachments");
        for entry in fs::read_dir(&directory)? {
            let path = entry?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let metadata: AttachmentMetadata = read_json(&path)?;
            if metadata.space != *space {
                continue;
            }
            let attachment_path = directory.join(&metadata.stored_name);
            if !attachment_path.is_file() {
                continue;
            }
            self.database.add_attachment(
                &metadata.id,
                &metadata.file_name,
                &attachment_path.to_string_lossy(),
                metadata.entity_id.as_deref(),
                space,
                &metadata.created_at,
            )?;
        }
        Ok(())
    }

    fn validate_knowledge_parent(
        &self,
        space: &Space,
        parent_id: Option<&str>,
        current_id: Option<&str>,
    ) -> AppResult<()> {
        let Some(parent_id) = parent_id else {
            return Ok(());
        };
        if current_id == Some(parent_id) {
            return Err(AppError::Validation("知识库目录不能移动到自身下面".into()));
        }
        let parent = self.database.get_knowledge_folder(parent_id)?;
        if parent.space != *space || parent.archived {
            return Err(AppError::Validation(
                "知识库父目录不存在或不属于当前空间".into(),
            ));
        }
        let mut visited = BTreeSet::new();
        let mut cursor = Some(parent);
        while let Some(folder) = cursor {
            if !visited.insert(folder.id.clone()) {
                return Err(AppError::Validation("知识库目录树存在循环引用".into()));
            }
            if current_id == Some(folder.id.as_str()) {
                return Err(AppError::Validation(
                    "知识库目录不能移动到子目录下面".into(),
                ));
            }
            cursor = folder
                .parent_id
                .as_deref()
                .map(|id| self.database.get_knowledge_folder(id))
                .transpose()?;
        }
        Ok(())
    }

    fn ensure_knowledge_title_available(
        &self,
        space: &Space,
        title: &str,
        current_id: Option<&str>,
    ) -> AppResult<()> {
        let title = title.trim();
        let page_exists = self
            .database
            .list_knowledge_pages(space, false)?
            .into_iter()
            .any(|page| page.title == title && Some(page.id.as_str()) != current_id);
        let folder_exists = self
            .database
            .list_knowledge_folders(space, false)?
            .into_iter()
            .any(|folder| folder.name == title && Some(folder.id.as_str()) != current_id);
        if page_exists || folder_exists {
            return Err(AppError::Validation("知识库页面或目录名称已存在".into()));
        }
        Ok(())
    }

    fn persist_knowledge_folder(&self, folder: &KnowledgeFolder) -> AppResult<()> {
        write_json_atomic(
            &self
                .space_dir(&folder.space)
                .join("knowledge")
                .join("folders")
                .join(format!("{}.json", folder.id)),
            folder,
        )
    }

    fn persist_knowledge_page(&self, page: &KnowledgePage) -> AppResult<()> {
        let directory = self.space_dir(&page.space).join("knowledge").join("pages");
        write_atomic(
            &directory.join(format!("{}.md", page.id)),
            page.content.as_bytes(),
        )?;
        let metadata = KnowledgePageMetadata {
            id: page.id.clone(),
            title: page.title.clone(),
            parent_id: page.parent_id.clone(),
            space: page.space.clone(),
            tags: page.tags.clone(),
            favorite: page.favorite,
            archived: page.archived,
            created_at: page.created_at.clone(),
            updated_at: page.updated_at.clone(),
            device_id: page.device_id.clone(),
            workspace_id: page.workspace_id.clone(),
            revision: page.revision,
        };
        write_json_atomic(&directory.join(format!("{}.json", page.id)), &metadata)
    }

    fn persist_pdf_document(&self, document: &PdfDocument) -> AppResult<()> {
        write_json_atomic(&self.pdf_metadata_path(document), document)
    }

    fn pdf_path(&self, document: &PdfDocument) -> PathBuf {
        self.space_dir(&document.space)
            .join("documents")
            .join("pdfs")
            .join(format!("{}.pdf", document.id))
    }

    fn pdf_metadata_path(&self, document: &PdfDocument) -> PathBuf {
        self.space_dir(&document.space)
            .join("documents")
            .join("pdfs")
            .join(format!("{}.json", document.id))
    }

    fn index_note_semantics(&self, note: &Note) -> AppResult<()> {
        self.index_semantics(
            &note.id,
            DocumentKind::Note.as_str(),
            &note.title,
            &note.content,
            &note.space,
            &note.updated_at,
            &note.tags,
            note.archived,
        )
    }

    fn index_knowledge_semantics(&self, page: &KnowledgePage) -> AppResult<()> {
        self.index_semantics(
            &page.id,
            DocumentKind::KnowledgePage.as_str(),
            &page.title,
            &page.content,
            &page.space,
            &page.updated_at,
            &page.tags,
            page.archived,
        )
    }

    fn index_pdf_semantics(&self, document: &PdfDocument) -> AppResult<()> {
        self.index_semantics(
            &document.id,
            "pdf",
            &document.title,
            &document.extracted_text,
            &document.space,
            &document.updated_at,
            &[],
            false,
        )
    }

    fn index_task_semantics(&self, task: &Task) -> AppResult<()> {
        self.index_semantics(
            &task.id,
            "task",
            &task.title,
            &task.description,
            &task.space,
            &task.updated_at,
            &task.tags,
            task.archived,
        )
    }

    fn index_project_semantics(&self, project: &Project) -> AppResult<()> {
        self.index_semantics(
            &project.id,
            "project",
            &project.name,
            &project.description,
            &project.space,
            &project.updated_at,
            &project.tags,
            project.archived,
        )
    }

    fn index_inbox_semantics(&self, item: &InboxItem) -> AppResult<()> {
        self.index_semantics(
            &item.id,
            "inbox",
            &item.title,
            &item.body,
            &item.space,
            &item.updated_at,
            &item.tags,
            item.archived,
        )
    }

    fn index_event_semantics(&self, event: &ScheduleEvent) -> AppResult<()> {
        let content = format!(
            "{} {} {} {}",
            event.date,
            event.start_time.as_deref().unwrap_or_default(),
            event.end_time.as_deref().unwrap_or_default(),
            event.notes
        );
        self.index_semantics(
            &event.id,
            "event",
            &event.title,
            &content,
            &event.space,
            &event.updated_at,
            &event.tags,
            event.archived,
        )
    }

    fn index_checklist_semantics(&self, checklist: &Checklist) -> AppResult<()> {
        let items = checklist
            .items
            .iter()
            .map(|item| item.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        let content = format!("{} {}", checklist.description, items);
        self.index_semantics(
            &checklist.id,
            "checklist",
            &checklist.title,
            &content,
            &checklist.space,
            &checklist.updated_at,
            &checklist.tags,
            checklist.archived,
        )
    }

    fn index_template_semantics(&self, template: &Template) -> AppResult<()> {
        let content = format!(
            "{} {} {}",
            template.description,
            template.kind.as_str(),
            serde_json::to_string(&template.payload)?
        );
        self.index_semantics(
            &template.id,
            "template",
            &template.name,
            &content,
            &template.space,
            &template.updated_at,
            &[],
            template.archived,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn index_semantics(
        &self,
        id: &str,
        kind: &str,
        title: &str,
        content: &str,
        space: &Space,
        updated_at: &str,
        tags: &[String],
        archived: bool,
    ) -> AppResult<()> {
        if !self.settings.semantic.enabled || archived {
            return self.database.delete_semantic_document(id);
        }
        semantic::index_document(
            &self.database,
            semantic::IndexInput {
                id,
                kind,
                title,
                content,
                space,
                updated_at,
                tags,
            },
        )
    }

    fn remove_knowledge_page_files(&self, page: &KnowledgePage) -> AppResult<()> {
        let directory = self.space_dir(&page.space).join("knowledge").join("pages");
        remove_if_exists(&directory.join(format!("{}.md", page.id)))?;
        remove_if_exists(&directory.join(format!("{}.json", page.id)))
    }

    fn remove_knowledge_folder_file(&self, folder: &KnowledgeFolder) -> AppResult<()> {
        remove_if_exists(
            &self
                .space_dir(&folder.space)
                .join("knowledge")
                .join("folders")
                .join(format!("{}.json", folder.id)),
        )
    }

    fn save_note_version(&self, note: &Note) -> AppResult<DocumentVersion> {
        self.save_document_version(
            &note.id,
            DocumentKind::Note,
            &note.title,
            &note.content,
            &note.space,
            note.revision,
            note,
        )
    }

    fn save_knowledge_page_version(&self, page: &KnowledgePage) -> AppResult<DocumentVersion> {
        self.save_document_version(
            &page.id,
            DocumentKind::KnowledgePage,
            &page.title,
            &page.content,
            &page.space,
            page.revision,
            page,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn save_document_version<T: Serialize>(
        &self,
        entity_id: &str,
        entity_kind: DocumentKind,
        title: &str,
        content: &str,
        space: &Space,
        revision: i64,
        snapshot: &T,
    ) -> AppResult<DocumentVersion> {
        let version = DocumentVersion {
            id: new_id(),
            entity_id: entity_id.into(),
            entity_kind,
            title: title.into(),
            content: content.into(),
            snapshot: serde_json::to_value(snapshot)?,
            space: space.clone(),
            created_at: now(),
            revision,
        };
        let path = self
            .space_dir(space)
            .join("history")
            .join(version.entity_kind.as_str())
            .join(entity_id)
            .join(format!("{}.json", version.id));
        write_json_atomic(&path, &version)?;
        if let Err(error) = self.database.upsert_version(&version) {
            let _ = remove_if_exists(&path);
            return Err(error);
        }
        Ok(version)
    }

    fn trash_payload(
        &self,
        kind: &str,
        entity_id: &str,
        title: &str,
        space: &Space,
        original_folder: &str,
        payload: serde_json::Value,
    ) -> AppResult<TrashItem> {
        let deleted_at = Utc::now();
        let item = TrashItem {
            id: new_id(),
            entity_id: entity_id.into(),
            kind: kind.into(),
            title: title.into(),
            space: space.clone(),
            original_folder: original_folder.into(),
            deleted_at: deleted_at.to_rfc3339(),
            purge_at: (deleted_at + Duration::days(self.settings.trash_retention_days.max(0)))
                .to_rfc3339(),
        };
        let manifest = TrashManifest {
            item: item.clone(),
            payload: payload.clone(),
        };
        let path = self.trash_manifest_path(&item);
        write_json_atomic(&path, &manifest)?;
        if let Err(error) = self.database.upsert_trash_item(&item, &payload) {
            let _ = remove_if_exists(&path);
            return Err(error);
        }
        Ok(item)
    }

    fn trash_manifest_path(&self, item: &TrashItem) -> PathBuf {
        self.space_dir(&item.space)
            .join("trash")
            .join(&item.kind)
            .join(format!("{}.json", item.id))
    }

    fn remove_trash_manifest(&self, item: &TrashItem) -> AppResult<()> {
        remove_if_exists(&self.trash_manifest_path(item))
    }

    fn ensure_trash_restore_target_free(&self, item: &TrashItem) -> AppResult<()> {
        let directory = self.space_dir(&item.space).join(&item.original_folder);
        let json_path = directory.join(format!("{}.json", item.entity_id));
        if json_path.exists()
            || (item.kind == "note" && directory.join(format!("{}.md", item.entity_id)).exists())
            || (item.kind == "pdf" && directory.join(format!("{}.pdf", item.entity_id)).exists())
        {
            return Err(AppError::Validation(
                "恢复目标已存在，请先处理同 ID 内容".into(),
            ));
        }
        Ok(())
    }

    fn rebuild_wiki_links(&self) -> AppResult<()> {
        for space in [Space::Personal, Space::Work] {
            for note in self.database.list_notes(&space, true)? {
                self.database.upsert_wiki_links(
                    &note.id,
                    DocumentKind::Note.as_str(),
                    &note.title,
                    &note.space,
                    &wiki_targets(&note.content),
                )?;
            }
            for page in self.database.list_knowledge_pages(&space, true)? {
                self.database.upsert_wiki_links(
                    &page.id,
                    DocumentKind::KnowledgePage.as_str(),
                    &page.title,
                    &page.space,
                    &wiki_targets(&page.content),
                )?;
            }
        }
        Ok(())
    }

    fn persist_note(&self, note: &Note) -> AppResult<()> {
        let directory = self.space_dir(&note.space).join("notes");
        let markdown_path = directory.join(format!("{}.md", note.id));
        let metadata_path = directory.join(format!("{}.json", note.id));
        write_atomic(&markdown_path, note.content.as_bytes())?;
        let metadata = NoteMetadata {
            id: note.id.clone(),
            title: note.title.clone(),
            space: note.space.clone(),
            project_id: note.project_id.clone(),
            tags: note.tags.clone(),
            favorite: note.favorite,
            archived: note.archived,
            created_at: note.created_at.clone(),
            updated_at: note.updated_at.clone(),
            device_id: note.device_id.clone(),
            workspace_id: note.workspace_id.clone(),
            revision: note.revision,
        };
        write_json_atomic(&metadata_path, &metadata)
    }

    fn persist_json_entity<T: Serialize>(&self, folder: &str, entity: &T) -> AppResult<()> {
        let value = serde_json::to_value(entity)?;
        let space = value
            .get("space")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::Validation("实体缺少空间".into()))?;
        let id = value
            .get("id")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::Validation("实体缺少 ID".into()))?;
        let space = match space {
            "personal" => Space::Personal,
            "work" => Space::Work,
            _ => return Err(AppError::Validation("实体空间无效".into())),
        };
        write_json_atomic(
            &self
                .space_dir(&space)
                .join(folder)
                .join(format!("{id}.json")),
            entity,
        )
    }

    fn remove_note_files(&self, note: &Note) -> AppResult<()> {
        let directory = self.space_dir(&note.space).join("notes");
        remove_if_exists(&directory.join(format!("{}.md", note.id)))?;
        remove_if_exists(&directory.join(format!("{}.json", note.id)))
    }

    fn remove_json_entity(&self, folder: &str, space: &Space, id: &str) -> AppResult<()> {
        remove_if_exists(
            &self
                .space_dir(space)
                .join(folder)
                .join(format!("{id}.json")),
        )
    }

    fn space_dir(&self, space: &Space) -> PathBuf {
        self.root.join(match space {
            Space::Personal => "personal",
            Space::Work => "work",
            Space::All => "",
        })
    }

    fn settings_path(&self) -> PathBuf {
        self.root.join("config").join("settings.json")
    }
}

fn create_workspace_dirs(root: &Path) -> AppResult<()> {
    for space in ["personal", "work"] {
        for folder in [
            "notes",
            "tasks",
            "projects",
            "inbox",
            "events",
            "checklists",
            "templates",
            "knowledge/pages",
            "knowledge/folders",
            "documents/pdfs",
            "history",
            "trash",
            "attachments",
        ] {
            fs::create_dir_all(root.join(space).join(folder))?;
        }
    }
    fs::create_dir_all(root.join("database"))?;
    fs::create_dir_all(root.join("backups"))?;
    fs::create_dir_all(root.join("backups").join("trash"))?;
    fs::create_dir_all(root.join("plugins"))?;
    fs::create_dir_all(root.join("config"))?;
    Ok(())
}

fn read_json<T: DeserializeOwned>(path: &Path) -> AppResult<T> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}
fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    write_atomic(path, &serde_json::to_vec_pretty(value)?)
}
fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_file_name(format!(
        ".{}-tmp-{}",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("file"),
        Uuid::new_v4()
    ));
    fs::write(&temporary, bytes)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(error.into());
    }
    Ok(())
}
fn remove_if_exists(path: &Path) -> AppResult<()> {
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
fn new_id() -> String {
    Uuid::new_v4().to_string()
}
fn now() -> String {
    Utc::now().to_rfc3339()
}
fn required_title(value: &str) -> AppResult<String> {
    let title = value.trim();
    if title.is_empty() {
        return Err(AppError::Validation("标题不能为空".into()));
    }
    if title.chars().count() > 200 {
        return Err(AppError::Validation("标题不能超过 200 个字符".into()));
    }
    Ok(title.to_string())
}
fn required_date(value: &str) -> AppResult<String> {
    let date = value.trim();
    if chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
        return Err(AppError::Validation("日期格式应为 YYYY-MM-DD".into()));
    }
    Ok(date.to_string())
}
fn normalize_event_times(
    all_day: bool,
    start_time: Option<String>,
    end_time: Option<String>,
) -> AppResult<(Option<String>, Option<String>)> {
    if all_day {
        return Ok((None, None));
    }
    let start = normalize_time(start_time, "开始时间")?;
    let end = normalize_time(end_time, "结束时间")?;
    if start >= end {
        return Err(AppError::Validation("结束时间必须晚于开始时间".into()));
    }
    Ok((Some(start), Some(end)))
}
fn normalize_time(value: Option<String>, label: &str) -> AppResult<String> {
    let value = value.unwrap_or_default();
    let value = value.trim();
    if NaiveTime::parse_from_str(value, "%H:%M").is_err() {
        return Err(AppError::Validation(format!("{label}格式应为 HH:mm")));
    }
    Ok(value.to_string())
}
fn normalize_checklist_items(items: Vec<ChecklistItem>) -> Vec<ChecklistItem> {
    items
        .into_iter()
        .enumerate()
        .filter_map(|(position, mut item)| {
            let text = item.text.trim().to_string();
            if text.is_empty() {
                return None;
            }
            if item.id.trim().is_empty() {
                item.id = new_id();
            }
            item.text = text;
            item.position = position as i64;
            Some(item)
        })
        .collect()
}
fn template_payload_with_space(
    payload: &serde_json::Value,
    space: &Space,
) -> AppResult<serde_json::Value> {
    let mut object = payload
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::Validation("模板内容必须是对象".into()))?;
    object.insert("space".into(), serde_json::to_value(space)?);
    Ok(serde_json::Value::Object(object))
}
fn validate_template_payload(kind: &TemplateKind, payload: &serde_json::Value) -> AppResult<()> {
    let payload = template_payload_with_space(payload, &Space::Personal)?;
    match kind {
        TemplateKind::Note => serde_json::from_value::<NoteInput>(payload)
            .map(|_| ())
            .map_err(|error| AppError::Validation(format!("模板内容无效：{error}"))),
        TemplateKind::Task => serde_json::from_value::<TaskInput>(payload)
            .map(|_| ())
            .map_err(|error| AppError::Validation(format!("模板内容无效：{error}"))),
        TemplateKind::Project => serde_json::from_value::<ProjectInput>(payload)
            .map(|_| ())
            .map_err(|error| AppError::Validation(format!("模板内容无效：{error}"))),
        TemplateKind::Checklist => serde_json::from_value::<ChecklistInput>(payload)
            .map(|_| ())
            .map_err(|error| AppError::Validation(format!("模板内容无效：{error}"))),
    }
}
fn validate_space(space: &Space) -> AppResult<()> {
    if space.is_content_space() {
        Ok(())
    } else {
        Err(AppError::Validation("内容必须属于个人或工作空间".into()))
    }
}
fn normalize_date(value: Option<String>) -> AppResult<Option<String>> {
    match value {
        Some(date) if !date.trim().is_empty() => {
            if date.len() != 10
                || date.as_bytes().get(4) != Some(&b'-')
                || date.as_bytes().get(7) != Some(&b'-')
            {
                return Err(AppError::Validation("日期格式应为 YYYY-MM-DD".into()));
            }
            Ok(Some(date))
        }
        _ => Ok(None),
    }
}
fn normalized_tags(tags: Vec<String>) -> Vec<String> {
    let mut result = BTreeSet::new();
    for tag in tags {
        let tag = tag.trim().trim_start_matches('#');
        if !tag.is_empty() {
            result.insert(tag.to_string());
        }
    }
    result.into_iter().collect()
}

fn wiki_targets(content: &str) -> Vec<String> {
    let mut result = BTreeSet::new();
    let mut cursor = content;
    while let Some(start) = cursor.find("[[") {
        let remainder = &cursor[start + 2..];
        let Some(end) = remainder.find("]]") else {
            break;
        };
        let target = remainder[..end]
            .split_once('|')
            .map(|(title, _)| title)
            .unwrap_or(&remainder[..end])
            .trim();
        if !target.is_empty() {
            result.insert(target.to_string());
        }
        cursor = &remainder[end + 2..];
    }
    result.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{DocumentKind, InboxKind, SparkStage, TemplateKind};
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn note_is_written_as_markdown_and_metadata() {
        let directory = tempdir().unwrap();
        let mut repository = WorkspaceRepository::open(directory.path().join("workspace")).unwrap();
        let note = repository
            .create_note(NoteInput {
                title: "本地笔记".into(),
                content: "# Hello".into(),
                space: Space::Personal,
                project_id: None,
                tags: vec!["test".into()],
            })
            .unwrap();
        assert_eq!(
            fs::read_to_string(
                directory
                    .path()
                    .join("workspace/personal/notes")
                    .join(format!("{}.md", note.id))
            )
            .unwrap(),
            "# Hello"
        );
        assert!(directory
            .path()
            .join("workspace/personal/notes")
            .join(format!("{}.json", note.id))
            .exists());
        assert_eq!(
            repository.list_notes(Space::Personal, false).unwrap().len(),
            1
        );
    }

    #[test]
    fn inbox_item_can_move_between_spaces_without_a_stale_file() {
        let directory = tempdir().unwrap();
        let mut repository = WorkspaceRepository::open(directory.path().join("workspace")).unwrap();
        let item = repository
            .create_inbox_item(InboxInput {
                title: "待整理内容".into(),
                body: "稍后归类".into(),
                kind: InboxKind::Note,
                spark_stage: None,
                space: Space::Personal,
                tags: vec![],
            })
            .unwrap();

        repository.move_inbox_item(&item.id, Space::Work).unwrap();

        assert!(repository
            .list_inbox(Space::Personal, false)
            .unwrap()
            .is_empty());
        assert_eq!(repository.list_inbox(Space::Work, false).unwrap().len(), 1);
        assert!(!directory
            .path()
            .join("workspace/personal/inbox")
            .join(format!("{}.json", item.id))
            .exists());
    }

    #[test]
    fn spark_can_develop_and_promote_without_losing_the_original() {
        let directory = tempdir().unwrap();
        let mut repository = WorkspaceRepository::open(directory.path().join("workspace")).unwrap();
        let item = repository
            .create_inbox_item(InboxInput {
                title: "把灵感做成一个晨间仪表盘".into(),
                body: "先记录，再考虑如何拆成可执行的小步骤".into(),
                kind: InboxKind::Spark,
                spark_stage: None,
                space: Space::Personal,
                tags: vec!["产品".into()],
            })
            .unwrap();

        assert_eq!(item.spark_stage, Some(SparkStage::New));
        let developing = repository
            .update_spark_stage(&item.id, SparkStage::Developing)
            .unwrap();
        assert_eq!(developing.spark_stage, Some(SparkStage::Developing));

        repository.promote_inbox_item(&item.id, "task").unwrap();

        let sparks = repository.list_inbox(Space::Personal, false).unwrap();
        assert_eq!(sparks.len(), 1);
        assert_eq!(sparks[0].spark_stage, Some(SparkStage::Converted));
        assert!(!sparks[0].archived);
        assert_eq!(
            repository.list_tasks(Space::Personal, false).unwrap().len(),
            1
        );
    }

    #[test]
    fn schedule_event_validates_time_order_and_persists() {
        let directory = tempdir().unwrap();
        let root = directory.path().join("workspace");
        let mut repository = WorkspaceRepository::open(root.clone()).unwrap();

        assert!(repository
            .create_event(ScheduleEventInput {
                title: "无效日程".into(),
                date: "2026-09-16".into(),
                start_time: Some("10:00".into()),
                end_time: Some("09:00".into()),
                all_day: false,
                notes: String::new(),
                task_id: None,
                project_id: None,
                space: Space::Personal,
                tags: vec![],
            })
            .is_err());

        let event = repository
            .create_event(ScheduleEventInput {
                title: "周会".into(),
                date: "2026-09-16".into(),
                start_time: Some("09:00".into()),
                end_time: Some("10:00".into()),
                all_day: false,
                notes: "同步进度".into(),
                task_id: None,
                project_id: None,
                space: Space::Personal,
                tags: vec!["#例会".into(), "例会".into()],
            })
            .unwrap();
        assert_eq!(event.start_time.as_deref(), Some("09:00"));
        assert_eq!(event.tags, vec!["例会"]);
        assert!(root
            .join("personal/events")
            .join(format!("{}.json", event.id))
            .exists());

        let all_day = repository
            .create_event(ScheduleEventInput {
                title: "发布日".into(),
                date: "2026-09-17".into(),
                start_time: Some("09:00".into()),
                end_time: Some("10:00".into()),
                all_day: true,
                notes: String::new(),
                task_id: None,
                project_id: None,
                space: Space::Personal,
                tags: vec![],
            })
            .unwrap();
        assert!(all_day.start_time.is_none());
        assert!(all_day.end_time.is_none());
        assert_eq!(
            repository
                .list_events(Space::Personal, None, None, false)
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn checklist_and_template_survive_reopen_and_template_uses_target_space() {
        let directory = tempdir().unwrap();
        let root = directory.path().join("workspace");
        let template_id;
        let checklist_id;
        {
            let mut repository = WorkspaceRepository::open(root.clone()).unwrap();
            let checklist = repository
                .create_checklist(ChecklistInput {
                    title: "发布前检查".into(),
                    description: "上线前逐项确认".into(),
                    items: vec![
                        ChecklistItem {
                            id: String::new(),
                            text: "  运行测试  ".into(),
                            completed: false,
                            position: 99,
                        },
                        ChecklistItem {
                            id: "".into(),
                            text: "   ".into(),
                            completed: false,
                            position: 100,
                        },
                    ],
                    space: Space::Personal,
                    tags: vec![],
                })
                .unwrap();
            checklist_id = checklist.id.clone();
            assert_eq!(checklist.items.len(), 1);
            assert_eq!(checklist.items[0].position, 0);
            assert!(!checklist.items[0].id.is_empty());

            let template = repository
                .create_template(TemplateInput {
                    name: "会议纪要模板".into(),
                    description: "快速开始一篇会议笔记".into(),
                    kind: TemplateKind::Note,
                    payload: json!({
                        "title": "会议纪要",
                        "content": "## 议题\n\n- ",
                        "projectId": null,
                        "tags": ["会议"]
                    }),
                    space: Space::Personal,
                })
                .unwrap();
            template_id = template.id;

            let created = repository
                .create_from_template(&template_id, Space::Work)
                .unwrap();
            assert_eq!(created["space"], "work");
            assert_eq!(repository.list_notes(Space::Work, false).unwrap().len(), 1);
        }

        let repository = WorkspaceRepository::open(root).unwrap();
        assert_eq!(
            repository
                .list_checklists(Space::Personal, false)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            repository.get_checklist(&checklist_id).unwrap().items.len(),
            1
        );
        assert_eq!(
            repository
                .list_templates(Space::Personal, false)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn knowledge_tree_links_and_versions_round_trip() {
        let directory = tempdir().unwrap();
        let root = directory.path().join("workspace");
        let mut repository = WorkspaceRepository::open(root.clone()).unwrap();
        let folder = repository
            .create_knowledge_folder(KnowledgeFolderInput {
                name: "Android".into(),
                parent_id: None,
                space: Space::Personal,
                position: 0,
            })
            .unwrap();
        let target = repository
            .create_knowledge_page(KnowledgePageInput {
                title: "VPN 基础".into(),
                content: "网络基础".into(),
                parent_id: Some(folder.id.clone()),
                space: Space::Personal,
                tags: vec!["网络".into()],
            })
            .unwrap();
        let mut source = repository
            .create_knowledge_page(KnowledgePageInput {
                title: "VPN 排障".into(),
                content: "参见 [[VPN 基础]]，以及 [[未完成页面]]。".into(),
                parent_id: Some(folder.id.clone()),
                space: Space::Personal,
                tags: vec![],
            })
            .unwrap();

        let links = repository
            .list_wiki_links(&source.id, DocumentKind::KnowledgePage.as_str())
            .unwrap();
        assert_eq!(links.len(), 2);
        assert!(links
            .iter()
            .any(|link| link.target_id.as_deref() == Some(target.id.as_str())));
        assert!(links.iter().any(|link| !link.resolved));
        assert_eq!(
            repository
                .list_wiki_backlinks(&target.id, DocumentKind::KnowledgePage.as_str())
                .unwrap()
                .len(),
            1
        );

        source.content = "更新后的排障内容".into();
        source = repository.update_knowledge_page(source).unwrap();
        let versions = repository
            .list_versions(&source.id, DocumentKind::KnowledgePage)
            .unwrap();
        assert_eq!(versions.len(), 2);
        repository.restore_version(&versions[1].id).unwrap();
        assert_eq!(
            repository.get_knowledge_page(&source.id).unwrap().content,
            "参见 [[VPN 基础]]，以及 [[未完成页面]]。"
        );
        assert!(root
            .join("personal/knowledge/pages")
            .join(format!("{}.md", source.id))
            .exists());
        assert_eq!(
            repository
                .list_knowledge_nodes(Space::Personal, false)
                .unwrap()
                .len(),
            3
        );
    }

    #[test]
    fn note_can_move_to_knowledge_and_trash_can_restore_or_purge() {
        let directory = tempdir().unwrap();
        let root = directory.path().join("workspace");
        let mut repository = WorkspaceRepository::open(root).unwrap();
        let note = repository
            .create_note(NoteInput {
                title: "迁移笔记".into(),
                content: "保留这段内容".into(),
                space: Space::Personal,
                project_id: None,
                tags: vec![],
            })
            .unwrap();
        let page = repository
            .copy_note_to_knowledge(&note.id, Space::Work, None, true)
            .unwrap();
        assert_eq!(page.space, Space::Work);
        assert!(repository
            .list_notes(Space::Personal, false)
            .unwrap()
            .is_empty());
        assert_eq!(
            repository
                .list_knowledge_pages(Space::Work, false)
                .unwrap()
                .len(),
            1
        );

        let task = repository
            .create_task(TaskInput {
                title: "可恢复任务".into(),
                description: String::new(),
                status: TaskStatus::Todo,
                priority: TaskPriority::Normal,
                due_date: None,
                space: Space::Personal,
                project_id: None,
                parent_id: None,
                tags: vec![],
            })
            .unwrap();
        let trash = repository.delete_task(&task.id).unwrap();
        assert!(repository
            .list_tasks(Space::Personal, false)
            .unwrap()
            .is_empty());
        assert_eq!(repository.list_trash(Space::Personal).unwrap().len(), 2);
        repository.restore_trash_item(&trash.id).unwrap();
        assert_eq!(
            repository.list_tasks(Space::Personal, false).unwrap().len(),
            1
        );

        let indexed_note = repository
            .create_note(NoteInput {
                title: "可恢复语义笔记".into(),
                content: "恢复后仍然可以被离线搜索".into(),
                space: Space::Personal,
                project_id: None,
                tags: vec!["恢复".into()],
            })
            .unwrap();
        let indexed_note_trash = repository.delete_note(&indexed_note.id).unwrap();
        assert!(!repository
            .semantic_search("可恢复语义笔记", Space::Personal)
            .unwrap()
            .iter()
            .any(|result| result.id == indexed_note.id));
        repository
            .restore_trash_item(&indexed_note_trash.id)
            .unwrap();
        assert!(repository
            .semantic_search("可恢复语义笔记", Space::Personal)
            .unwrap()
            .iter()
            .any(|result| result.id == indexed_note.id));

        let mut settings = repository.settings();
        settings.trash_retention_days = 0;
        repository.update_settings(settings).unwrap();
        let task = repository
            .list_tasks(Space::Personal, false)
            .unwrap()
            .remove(0);
        repository.delete_task(&task.id).unwrap();
        assert!(repository.purge_expired_trash().unwrap() >= 1);
    }

    #[test]
    fn pdf_import_indexes_and_restores_from_trash() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("设计说明.pdf");
        fs::write(&source, b"%PDF-1.7 /Type /Page Noah offline search").unwrap();
        let root = directory.path().join("workspace");
        let mut repository = WorkspaceRepository::open(root.clone()).unwrap();
        let document = repository
            .import_pdf(source.to_str().unwrap(), Space::Personal)
            .unwrap();
        assert_eq!(document.page_count, 1);
        assert_eq!(repository.list_documents(Space::Personal).unwrap().len(), 1);
        assert!(!repository.read_pdf(&document.id).unwrap().is_empty());
        assert!(repository
            .semantic_search("设计说明", Space::Personal)
            .unwrap()
            .iter()
            .any(|result| result.id == document.id));

        let trash = repository.delete_document(&document.id).unwrap();
        assert!(repository
            .list_documents(Space::Personal)
            .unwrap()
            .is_empty());
        assert!(root
            .join("backups/trash")
            .join(&trash.id)
            .join(format!("{}.pdf", document.id))
            .exists());
        repository.restore_trash_item(&trash.id).unwrap();
        assert_eq!(repository.list_documents(Space::Personal).unwrap().len(), 1);
    }

    #[test]
    fn structured_content_is_kept_in_the_semantic_index() {
        let directory = tempdir().unwrap();
        let mut repository = WorkspaceRepository::open(directory.path().join("workspace")).unwrap();
        let task = repository
            .create_task(TaskInput {
                title: "语义任务".into(),
                description: "整理离线索引".into(),
                status: TaskStatus::Todo,
                priority: TaskPriority::Normal,
                due_date: None,
                space: Space::Personal,
                project_id: None,
                parent_id: None,
                tags: vec!["索引".into()],
            })
            .unwrap();
        let project = repository
            .create_project(ProjectInput {
                name: "语义项目".into(),
                description: "本地搜索验证".into(),
                status: Default::default(),
                progress: 0,
                space: Space::Personal,
                tags: vec![],
            })
            .unwrap();
        let inbox = repository
            .create_inbox_item(InboxInput {
                title: "语义收件箱".into(),
                body: "待整理内容".into(),
                kind: InboxKind::Memo,
                spark_stage: None,
                space: Space::Personal,
                tags: vec![],
            })
            .unwrap();
        let event = repository
            .create_event(ScheduleEventInput {
                title: "语义日程".into(),
                date: "2026-09-16".into(),
                start_time: None,
                end_time: None,
                all_day: true,
                notes: "检查索引".into(),
                task_id: None,
                project_id: None,
                space: Space::Personal,
                tags: vec![],
            })
            .unwrap();
        let checklist = repository
            .create_checklist(ChecklistInput {
                title: "语义清单".into(),
                description: "验证内容".into(),
                items: vec![ChecklistItem {
                    id: String::new(),
                    text: "检查向量".into(),
                    completed: false,
                    position: 0,
                }],
                space: Space::Personal,
                tags: vec![],
            })
            .unwrap();
        let template = repository
            .create_template(TemplateInput {
                name: "语义模板".into(),
                description: "离线模板".into(),
                kind: TemplateKind::Note,
                payload: json!({"title": "模板标题", "content": "索引内容"}),
                space: Space::Personal,
            })
            .unwrap();

        let records = repository
            .database
            .list_semantic_documents(&Space::Personal)
            .unwrap();
        for id in [
            task.id,
            project.id,
            inbox.id,
            event.id,
            checklist.id,
            template.id,
        ] {
            assert!(records.iter().any(|record| record.id == id));
        }

        let mut settings = repository.settings();
        settings.semantic.enabled = false;
        repository.update_settings(settings.clone()).unwrap();
        assert!(repository
            .database
            .list_semantic_documents(&Space::Personal)
            .unwrap()
            .is_empty());
        settings.semantic.enabled = true;
        repository.update_settings(settings).unwrap();
        assert_eq!(
            repository
                .database
                .list_semantic_documents(&Space::Personal)
                .unwrap()
                .len(),
            6
        );
    }
}
