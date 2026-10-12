export type Space = "all" | "personal" | "work";
export type ContentSpace = Exclude<Space, "all">;
export type PageId = "overview" | "inbox" | "sparks" | "today" | "tasks" | "notes" | "projects" | "schedule" | "checklists" | "templates" | "knowledge" | "documents" | "plugins" | "archive" | "trash" | "settings";
export type TaskStatus = "todo" | "in_progress" | "waiting" | "done" | "cancelled";
export type TaskPriority = "urgent" | "high" | "normal" | "low";
export type SparkStage = "new" | "developing" | "converted";
export type InboxKind = "note" | "task" | "memo" | "checklist" | "spark";

export interface Note {
  id: string;
  title: string;
  content: string;
  space: ContentSpace;
  projectId: string | null;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
  revision: number;
}

export type KnowledgeNodeKind = "folder" | "page";

export interface KnowledgeNode {
  id: string;
  title: string;
  kind: KnowledgeNodeKind;
  parentId: string | null;
  space: ContentSpace;
  archived: boolean;
  updatedAt: string;
  position: number;
}

export interface KnowledgeFolder {
  id: string;
  name: string;
  parentId: string | null;
  space: ContentSpace;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
  revision: number;
}

export interface KnowledgePage {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  space: ContentSpace;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
  revision: number;
}

export interface WikiLink {
  id: string;
  sourceId: string;
  sourceKind: string;
  sourceTitle: string;
  targetTitle: string;
  targetId: string | null;
  targetKind: string | null;
  space: ContentSpace;
  resolved: boolean;
}

export type DocumentKind = "note" | "knowledge_page";

export type SaveType = "auto" | "manual";

export interface SaveRecord {
  id: string;
  entityId: string;
  entityKind: DocumentKind;
  title: string;
  content: string;
  createdAt: string;
  revision: number;
  saveType: SaveType;
  charCount: number;
  lineCount: number;
  wordCount: number;
}

export interface DocumentVersion {
  id: string;
  entityId: string;
  entityKind: DocumentKind;
  title: string;
  content: string;
  snapshot: Record<string, unknown>;
  space: ContentSpace;
  createdAt: string;
  revision: number;
}

export interface TrashItem {
  id: string;
  entityId: string;
  kind: string;
  title: string;
  space: ContentSpace;
  originalFolder: string;
  deletedAt: string;
  purgeAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  space: ContentSpace;
  projectId: string | null;
  tags: string[];
  parentId: string | null;
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
  revision: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: "planning" | "active" | "paused" | "completed" | "archived";
  progress: number;
  space: ContentSpace;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
  revision: number;
}

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  kind: InboxKind;
  sparkStage: SparkStage | null;
  space: ContentSpace;
  tags: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  notes: string;
  taskId: string | null;
  projectId: string | null;
  space: ContentSpace;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
  revision: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  position: number;
}

export interface Checklist {
  id: string;
  title: string;
  description: string;
  items: ChecklistItem[];
  space: ContentSpace;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
  revision: number;
}

export type TemplateKind = "note" | "task" | "project" | "checklist";

export interface Template {
  id: string;
  name: string;
  description: string;
  kind: TemplateKind;
  payload: Record<string, unknown>;
  space: ContentSpace;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
  revision: number;
}

export interface SearchResult {
  id: string;
  kind: "note" | "task" | "project" | "inbox" | "event" | "checklist" | "knowledge_page" | "pdf";
  title: string;
  snippet: string;
  space: ContentSpace;
  updatedAt: string;
  tags: string[];
  score?: number;
}

export interface BackupInfo {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

export interface SyncSettings {
  provider: "none" | "git" | "webdav" | "local_folder" | "s3" | "sftp" | "smb";
  gitRemoteUrl: string | null;
  gitBranch: string;
  webdavUrl: string | null;
  webdavUsername: string | null;
  webdavPassword: string | null;
  localFolderPath: string | null;
  smbPath: string | null;
  sftpHost: string | null;
  sftpPort: number;
  sftpUsername: string | null;
  sftpPassword: string | null;
  sftpPrivateKey: string | null;
  sftpRemotePath: string | null;
  s3Endpoint: string | null;
  s3Bucket: string | null;
  s3Region: string | null;
  s3AccessKey: string | null;
  s3SecretKey: string | null;
  s3Prefix: string | null;
  backupSchedule: "manual" | "daily" | "weekly";
  backupRetention: number;
}

export type AiProvider = "none" | "local" | "openai_compatible" | "custom";

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  endpoint: string | null;
  apiKey: string | null;
  model: string;
  maxContextChars: number;
  allowExternal: boolean;
}

export interface OcrSettings {
  enabled: boolean;
  command: string;
  arguments: string[];
  timeoutSeconds: number;
}

export interface SemanticSettings {
  enabled: boolean;
  resultLimit: number;
}

export type PdfOcrStatus = "not_run" | "pending" | "completed" | "failed";

export interface PdfDocument {
  id: string;
  title: string;
  fileName: string;
  relativePath: string;
  space: ContentSpace;
  size: number;
  sha256: string;
  pageCount: number;
  extractedText: string;
  ocrStatus: PdfOcrStatus;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  workspaceId: string;
  revision: number;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  entry: string | null;
  permissions: string[];
  enabled: boolean;
  installedAt: string | null;
  updatedAt: string | null;
}

export interface AiRequest {
  operation: "summary" | "title" | "tags" | "meeting" | "tasks" | "qa";
  content: string;
  context?: string;
  question?: string | null;
}

export interface AiResult {
  operation: string;
  content: string;
  provider: AiProvider;
  model: string;
}

export interface SyncReport {
  provider: string;
  action: string;
  message: string;
  changedFiles: number;
  conflicts: string[];
}

export type SyncAction = "status" | "pull" | "push" | "force_pull" | "force_push";

export interface SyncHistoryEntry {
  id: string;
  provider: string;
  action: string;
  status: string;
  message: string;
  changedFiles: number;
  conflicts: string[];
  createdAt: string;
}

export interface AppSettings {
  workspaceRoot: string;
  deviceId: string;
  defaultSpace: ContentSpace;
  trashRetentionDays: number;
  sync: SyncSettings;
  ai: AiSettings;
  ocr: OcrSettings;
  semantic: SemanticSettings;
}

export interface TagSummary {
  name: string;
  count: number;
}
