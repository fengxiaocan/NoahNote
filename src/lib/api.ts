import { invoke } from "@tauri-apps/api/core";
import type {
    AppSettings,
    AiRequest,
    AiResult,
    BackupInfo,
    Checklist,
    ChecklistItem,
    DocumentKind,
    DocumentVersion,
    InboxItem,
    KnowledgeFolder,
    KnowledgeNode,
    KnowledgePage,
    Note,
    PdfDocument,
    PluginManifest,
    Project,
    SearchResult,
    ScheduleEvent,
    Space,
    SparkStage,
    SyncAction,
    SyncHistoryEntry,
    SyncReport,
    Task,
    TagSummary,
    Template,
    TemplateKind,
    TrashItem,
    WikiLink,
} from "../types";

export interface NoteInput {
  title: string;
  content: string;
  space: Exclude<Space, "all">;
  projectId?: string | null;
  tags?: string[];
}

export interface TaskInput {
  title: string;
  description?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  dueDate?: string | null;
  space: Exclude<Space, "all">;
  projectId?: string | null;
  parentId?: string | null;
  tags?: string[];
}

export interface ProjectInput {
  name: string;
  description?: string;
  status?: Project["status"];
  progress?: number;
  space: Exclude<Space, "all">;
  tags?: string[];
}

export interface InboxInput {
  title: string;
  body?: string;
  kind?: InboxItem["kind"];
  sparkStage?: SparkStage | null;
  space: Exclude<Space, "all">;
  tags?: string[];
}

export interface KnowledgeFolderInput {
  name: string;
  parentId?: string | null;
  space: Exclude<Space, "all">;
  position?: number;
}

export interface KnowledgePageInput {
  title: string;
  content?: string;
  parentId?: string | null;
  space: Exclude<Space, "all">;
  tags?: string[];
}

export interface ScheduleEventInput {
  title: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  notes?: string;
  taskId?: string | null;
  projectId?: string | null;
  space: Exclude<Space, "all">;
  tags?: string[];
}

export interface ChecklistInput {
  title: string;
  description?: string;
  items?: ChecklistItem[];
  space: Exclude<Space, "all">;
  tags?: string[];
}

export interface TemplateInput {
  name: string;
  description?: string;
  kind: TemplateKind;
  payload: Record<string, unknown>;
  space: Exclude<Space, "all">;
}

const call = <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args);

export const api = {
  getSettings: () => call<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) => call<AppSettings>("update_settings", { settings }),
  listNotes: (space: Space, includeArchived = false) =>
    call<Note[]>("list_notes", { space, includeArchived }),
  getNote: (id: string) => call<Note>("get_note", { id }),
  createNote: (input: NoteInput) => call<Note>("create_note", { input }),
  updateNote: (note: Note) => call<Note>("update_note", { note }),
  archiveNote: (id: string, archived: boolean) => call<Note>("archive_note", { id, archived }),
  deleteNote: (id: string) => call<TrashItem>("delete_note", { id }),
  listTasks: (space: Space, includeArchived = false) =>
    call<Task[]>("list_tasks", { space, includeArchived }),
  createTask: (input: TaskInput) => call<Task>("create_task", { input }),
  updateTask: (task: Task) => call<Task>("update_task", { task }),
  archiveTask: (id: string, archived: boolean) => call<Task>("archive_task", { id, archived }),
  deleteTask: (id: string) => call<TrashItem>("delete_task", { id }),
  listProjects: (space: Space, includeArchived = false) =>
    call<Project[]>("list_projects", { space, includeArchived }),
  createProject: (input: ProjectInput) => call<Project>("create_project", { input }),
  updateProject: (project: Project) => call<Project>("update_project", { project }),
  archiveProject: (id: string, archived: boolean) =>
    call<Project>("archive_project", { id, archived }),
  deleteProject: (id: string) => call<TrashItem>("delete_project", { id }),
  listInbox: (space: Space, includeArchived = false) =>
    call<InboxItem[]>("list_inbox", { space, includeArchived }),
  createInboxItem: (input: InboxInput) => call<InboxItem>("create_inbox_item", { input }),
  updateInboxItem: (item: InboxItem) => call<InboxItem>("update_inbox_item", { item }),
  archiveInboxItem: (id: string, archived: boolean) =>
    call<InboxItem>("archive_inbox_item", { id, archived }),
  moveInboxItem: (id: string, space: Exclude<Space, "all">) =>
    call<InboxItem>("move_inbox_item", { id, space }),
  updateSparkStage: (id: string, stage: SparkStage) =>
    call<InboxItem>("update_spark_stage", { id, stage }),
  deleteInboxItem: (id: string) => call<TrashItem>("delete_inbox_item", { id }),
  listEvents: (space: Space, startDate?: string | null, endDate?: string | null, includeArchived = false) =>
    call<ScheduleEvent[]>("list_events", { space, startDate, endDate, includeArchived }),
  getEvent: (id: string) => call<ScheduleEvent>("get_event", { id }),
  createEvent: (input: ScheduleEventInput) => call<ScheduleEvent>("create_event", { input }),
  updateEvent: (event: ScheduleEvent) => call<ScheduleEvent>("update_event", { event }),
  archiveEvent: (id: string, archived: boolean) =>
    call<ScheduleEvent>("archive_event", { id, archived }),
  deleteEvent: (id: string) => call<TrashItem>("delete_event", { id }),
  listChecklists: (space: Space, includeArchived = false) =>
    call<Checklist[]>("list_checklists", { space, includeArchived }),
  getChecklist: (id: string) => call<Checklist>("get_checklist", { id }),
  createChecklist: (input: ChecklistInput) => call<Checklist>("create_checklist", { input }),
  updateChecklist: (checklist: Checklist) => call<Checklist>("update_checklist", { checklist }),
  archiveChecklist: (id: string, archived: boolean) =>
    call<Checklist>("archive_checklist", { id, archived }),
  deleteChecklist: (id: string) => call<TrashItem>("delete_checklist", { id }),
  listTemplates: (space: Space, includeArchived = false) =>
    call<Template[]>("list_templates", { space, includeArchived }),
  getTemplate: (id: string) => call<Template>("get_template", { id }),
  createTemplate: (input: TemplateInput) => call<Template>("create_template", { input }),
  updateTemplate: (template: Template) => call<Template>("update_template", { template }),
  archiveTemplate: (id: string, archived: boolean) =>
    call<Template>("archive_template", { id, archived }),
  deleteTemplate: (id: string) => call<TrashItem>("delete_template", { id }),
  createFromTemplate: (id: string, space: Exclude<Space, "all">) =>
    call<unknown>("create_from_template", { id, space }),
  listKnowledgeNodes: (space: Space, includeArchived = false) =>
    call<KnowledgeNode[]>("list_knowledge_nodes", { space, includeArchived }),
  getKnowledgePage: (id: string) => call<KnowledgePage>("get_knowledge_page", { id }),
  getKnowledgeFolder: (id: string) => call<KnowledgeFolder>("get_knowledge_folder", { id }),
  createKnowledgeFolder: (input: KnowledgeFolderInput) =>
    call<KnowledgeFolder>("create_knowledge_folder", { input }),
  updateKnowledgeFolder: (folder: KnowledgeFolder) =>
    call<KnowledgeFolder>("update_knowledge_folder", { folder }),
  createKnowledgePage: (input: KnowledgePageInput) =>
    call<KnowledgePage>("create_knowledge_page", { input }),
  updateKnowledgePage: (page: KnowledgePage) =>
    call<KnowledgePage>("update_knowledge_page", { page }),
  deleteKnowledgePage: (id: string) => call<TrashItem>("delete_knowledge_page", { id }),
  deleteKnowledgeFolder: (id: string) =>
    call<TrashItem[]>("delete_knowledge_folder", { id }),
  moveKnowledgeFolderSpace: (id: string, space: Exclude<Space, "all">) =>
    call<KnowledgeFolder>("move_knowledge_folder_space", { id, space }),
  copyNoteToKnowledge: (noteId: string, space: Exclude<Space, "all">, parentId?: string | null, moveSource = false) =>
    call<KnowledgePage>("copy_note_to_knowledge", { noteId, space, parentId, moveSource }),
  listWikiLinks: (id: string, kind: DocumentKind) =>
    call<WikiLink[]>("list_wiki_links", { id, kind }),
  listWikiBacklinks: (id: string, kind: DocumentKind) =>
    call<WikiLink[]>("list_wiki_backlinks", { id, kind }),
  listVersions: (id: string, kind: DocumentKind) =>
    call<DocumentVersion[]>("list_versions", { id, kind }),
  getVersion: (id: string) => call<DocumentVersion>("get_version", { id }),
  restoreVersion: (id: string) => call<unknown>("restore_version", { id }),
  listTrash: (space: Space) => call<TrashItem[]>("list_trash", { space }),
  restoreTrashItem: (id: string) => call<unknown>("restore_trash_item", { id }),
  permanentlyDeleteTrashItem: (id: string) => call<void>("permanently_delete_trash_item", { id }),
  purgeTrash: () => call<number>("purge_trash"),
  promoteInboxItem: (id: string, target: "note" | "task") =>
    call<Note | Task>("promote_inbox_item", { id, target }),
  search: (query: string, space: Space) => call<SearchResult[]>("search", { query, space }),
  semanticSearch: (query: string, space: Space) => call<SearchResult[]>("semantic_search", { query, space }),
  listDocuments: (space: Space) => call<PdfDocument[]>("list_documents", { space }),
  getDocument: (id: string) => call<PdfDocument>("get_document", { id }),
  importPdf: (sourcePath: string, space: Exclude<Space, "all">) =>
    call<PdfDocument>("import_pdf", { sourcePath, space }),
  readPdf: (id: string) => call<string>("read_pdf", { id }),
  exportPdf: (id: string, targetPath: string) => call<string>("export_pdf", { id, targetPath }),
  ocrPdf: (id: string) => call<PdfDocument>("ocr_pdf", { id }),
  deleteDocument: (id: string) => call<TrashItem>("delete_document", { id }),
  moveDocumentSpace: (id: string, space: Exclude<Space, "all">) =>
    call<PdfDocument>("move_document_space", { id, space }),
  runAi: (request: AiRequest) => call<AiResult>("run_ai", { request }),
  listPlugins: () => call<PluginManifest[]>("list_plugins"),
  installPlugin: (sourcePath: string) => call<PluginManifest>("install_plugin", { sourcePath }),
  setPluginEnabled: (id: string, enabled: boolean) =>
    call<PluginManifest>("set_plugin_enabled", { id, enabled }),
  listTags: (space: Space) => call<TagSummary[]>("list_tags", { space }),
  addAttachment: (sourcePath: string, space: Exclude<Space, "all">, entityId?: string | null) =>
    call<string>("add_attachment", { sourcePath, space, entityId }),
  readTextFile: (sourcePath: string) => call<string>("read_text_file", { sourcePath }),
  batchCreateNotes: (inputs: NoteInput[]) => call<Note[]>("batch_create_notes", { inputs }),
  scanMarkdownFiles: (folderPath: string) => call<string[]>("scan_markdown_files", { folderPath }),
  createBackup: () => call<BackupInfo>("create_backup"),
  listBackups: () => call<BackupInfo[]>("list_backups"),
  restoreBackup: (name: string) => call<string>("restore_backup", { name }),
  sync: (action: SyncAction) => call<SyncReport>("sync", { action }),
  listSyncHistory: () => call<SyncHistoryEntry[]>("list_sync_history"),
};

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
