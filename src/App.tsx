import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell } from "./components/AppShell";
import { useAppDialogs } from "./components/AppDialogs";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { CreateModal, type CreateKind, type FormValues } from "./components/Modal";
import { api, isTauri } from "./lib/api";
import { normalizeTheme, themeStorageKey, toggleTheme, type Theme } from "./lib/theme";
import { DocumentsPage } from "./pages/DocumentsPage";
import { ArchivePage, type ArchiveEntry } from "./pages/ArchivePage";
import { InboxPage } from "./pages/InboxPage";
import { ChecklistsPage } from "./pages/ChecklistsPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { NotesPage } from "./pages/NotesPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PluginsPage } from "./pages/PluginsPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { SparksPage } from "./pages/SparksPage";
import { TasksPage } from "./pages/TasksPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { TodayPage } from "./pages/TodayPage";
import { TrashPage } from "./pages/TrashPage";
import type { KnowledgeFolderInput, KnowledgePageInput, ScheduleEventInput } from "./lib/api";
import { importedNoteTitle, parseMarkdownNoteImport, parseTaskImport } from "./lib/import";
import {
  applyPreferencesToDom,
  loadPreferences,
  savePreferences,
  toggleSidebarPreference,
  type UserPreferences,
} from "./lib/preferences";
import { cloneChecklist } from "./lib/checklists";
import type { AppSettings, BackupInfo, Checklist, ChecklistItem, ContentSpace, InboxItem, KnowledgeNode, KnowledgePage, Note, PageId, PdfDocument, PluginManifest, Project, ScheduleEvent, SearchResult, Space, SparkStage, SyncAction, SyncHistoryEntry, Task, TaskPriority, TaskStatus, Template, TemplateKind, TrashItem } from "./types";

const defaultSettings: AppSettings = {
  workspaceRoot: "本地 Workspace",
  deviceId: "local-device",
  defaultSpace: "personal",
  trashRetentionDays: 30,
  sync: {
    provider: "none",
    gitRemoteUrl: null,
    gitBranch: "main",
    webdavUrl: null,
    webdavUsername: null,
    webdavPassword: null,
    localFolderPath: null,
    smbPath: null,
    sftpHost: null,
    sftpPort: 22,
    sftpUsername: null,
    sftpPassword: null,
    sftpPrivateKey: null,
    sftpRemotePath: null,
    s3Endpoint: null,
    s3Bucket: null,
    s3Region: null,
    s3AccessKey: null,
    s3SecretKey: null,
    s3Prefix: null,
    backupSchedule: "manual",
    backupRetention: 7,
  },
  ai: {
    enabled: false,
    provider: "none",
    endpoint: null,
    apiKey: null,
    model: "local-model",
    maxContextChars: 12000,
    allowExternal: false,
  },
  ocr: {
    enabled: false,
    command: "tesseract",
    arguments: [],
    timeoutSeconds: 120,
  },
  semantic: {
    enabled: true,
    resultLimit: 20,
  },
};

export default function App() {
  const { confirm } = useAppDialogs();
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());
  const [activePage, setActivePage] = useState<PageId>(() => {
    const prefs = loadPreferences();
    return prefs.defaultStartupPage || "overview";
  });
  const [space, setSpace] = useState<Space>("all");
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>([]);
  const [selectedKnowledgePageId, setSelectedKnowledgePageId] = useState<string | null>(null);
  const [selectedKnowledgePage, setSelectedKnowledgePage] = useState<KnowledgePage | null>(null);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [documents, setDocuments] = useState<PdfDocument[]>([]);
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return normalizeTheme(window.localStorage.getItem(themeStorageKey));
    } catch {
      return "light";
    }
  });
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [modal, setModal] = useState<CreateKind | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [scheduleCreateRequest, setScheduleCreateRequest] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }, []);

  useEffect(() => {
    applyPreferencesToDom(preferences);
    savePreferences(preferences);
  }, [preferences]);

  const toggleSidebar = useCallback(() => {
    setPreferences((current) => toggleSidebarPreference(current));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101721" : "#f7f8fa");
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // The current session still keeps the selected theme if storage is unavailable.
    }
  }, [theme]);

  const toggleAppTheme = useCallback(() => {
    setTheme((current) => toggleTheme(current));
  }, []);

  const changeTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);
  }, []);

  const reload = useCallback(async () => {
    if (!isTauri()) return;
    setLoading(true);
    try {
      const includeArchived = activePage === "archive";
      const [nextNotes, nextTasks, nextProjects, nextInbox, nextEvents, nextChecklists, nextTemplates, nextKnowledgeNodes, nextTrash, nextDocuments, nextPlugins, nextSyncHistory] = await Promise.all([
        api.listNotes(space, includeArchived),
        api.listTasks(space, includeArchived),
        api.listProjects(space, includeArchived),
        api.listInbox(space, includeArchived),
        api.listEvents(space, undefined, undefined, includeArchived),
        api.listChecklists(space, includeArchived),
        api.listTemplates(space, includeArchived),
        api.listKnowledgeNodes(space, includeArchived),
        api.listTrash(space),
        api.listDocuments(space),
        api.listPlugins(),
        api.listSyncHistory(),
      ]);
      setNotes(nextNotes);
      setTasks(nextTasks);
      setProjects(nextProjects);
      setInbox(nextInbox);
      setEvents(nextEvents);
      setChecklists(nextChecklists);
      setTemplates(nextTemplates);
      setKnowledgeNodes(nextKnowledgeNodes);
      setTrashItems(nextTrash);
      setDocuments(nextDocuments);
      setPlugins(nextPlugins);
      setSyncHistory(nextSyncHistory);
      if (activePage === "settings") setBackups(await api.listBackups());
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [activePage, space]);

  useEffect(() => {
    const initialize = async () => {
      if (!isTauri()) return;
      try {
        const nextSettings = await api.getSettings();
        setSettings(nextSettings);
        setSpace(nextSettings.defaultSpace);
        setBackups(await api.listBackups());
      } catch (cause) {
        setError(errorMessage(cause));
      }
    };
    void initialize();
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!selectedKnowledgePageId || !isTauri()) {
      setSelectedKnowledgePage(null);
      return;
    }
    let active = true;
    void api.getKnowledgePage(selectedKnowledgePageId).then((page) => {
      if (!active) return;
      if (space !== "all" && page.space !== space) {
        setSelectedKnowledgePageId(null);
        setSelectedKnowledgePage(null);
        return;
      }
      setSelectedKnowledgePage(page);
    }).catch(() => {
      if (active) setSelectedKnowledgePage(null);
    });
    return () => { active = false; };
  }, [selectedKnowledgePageId, space]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || !isTauri()) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setSearchResults(await api.semanticSearch(query, space));
      } catch {
        setSearchResults([]);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery, space]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key === "\\") {
        event.preventDefault();
        toggleSidebar();
      } else if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (modifier && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (modifier && event.key.toLowerCase() === "n" && !event.shiftKey) {
        event.preventDefault();
        setModal("note");
      } else if (modifier && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setModal("note");
      } else if (modifier && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        setModal("task");
      } else if (modifier && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        setModal("inbox");
      } else if (event.altKey && event.key === "1") {
        event.preventDefault();
        setSpace("all");
      } else if (event.altKey && event.key === "2") {
        event.preventDefault();
        setSpace("personal");
      } else if (event.altKey && event.key === "3") {
        event.preventDefault();
        setSpace("work");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = useCallback(async (action: () => Promise<unknown>, rethrow = false) => {
    if (!isTauri()) {
      const message = "请使用 `npm run tauri dev` 启动桌面应用后操作本地数据。";
      setError(message);
      if (rethrow) throw new Error(message);
      return null;
    }
    try {
      const result = await action();
      await reload();
      setError("");
      return result;
    } catch (cause) {
      setError(errorMessage(cause));
      if (rethrow) throw cause;
      return null;
    }
  }, [reload]);

  const handleCreate = useCallback(async (kind: CreateKind, values: FormValues) => {
    const targetSpace = values.space as Exclude<Space, "all">;
    if (kind === "note") {
      const created = await run(() => api.createNote({ title: String(values.title ?? ""), content: String(values.content ?? ""), space: targetSpace, projectId: stringOrNull(values.projectId), tags: tagsFrom(values.tags) }), true);
      if (created && isNote(created)) {
        setSelectedNoteId(created.id);
        setActivePage("notes");
      }
    } else if (kind === "task") {
      await run(() => api.createTask({ title: String(values.title ?? ""), description: String(values.description ?? ""), status: values.status as Task["status"], priority: values.priority as Task["priority"], dueDate: stringOrNull(values.dueDate), space: targetSpace, projectId: stringOrNull(values.projectId), tags: tagsFrom(values.tags) }), true);
    } else if (kind === "project") {
      const created = await run(() => api.createProject({ name: String(values.name ?? ""), description: String(values.description ?? ""), status: values.status as Project["status"], progress: Number(values.progress ?? 0), space: targetSpace, tags: tagsFrom(values.tags) }), true);
      if (created && isProject(created)) {
        setSelectedProjectId(created.id);
        setActivePage("projects");
      }
    } else if (kind === "checklist") {
      await run(() => api.createChecklist({ title: String(values.title ?? ""), description: String(values.description ?? ""), items: checklistItemsFrom(String(values.items ?? "")), space: targetSpace, tags: tagsFrom(values.tags) }), true);
      setActivePage("checklists");
    } else if (kind === "template") {
      const templateKind = values.templateKind as TemplateKind;
      await run(() => api.createTemplate({ name: String(values.name ?? ""), description: String(values.description ?? ""), kind: templateKind, payload: templatePayloadFrom(values, templateKind), space: targetSpace }), true);
      setActivePage("templates");
    } else {
      const inboxKind = kind === "spark" ? "spark" : values.kind as InboxItem["kind"];
      const created = await run(() => api.createInboxItem({ title: String(values.title ?? ""), body: String(values.body ?? ""), kind: inboxKind, sparkStage: inboxKind === "spark" ? "new" : null, space: targetSpace, tags: tagsFrom(values.tags) }), true);
      if (inboxKind === "spark" && created) setActivePage("sparks");
    }
  }, [run]);

  const updateNote = useCallback((note: Note) => run(() => api.updateNote(note)), [run]);
  const moveNoteToSpace = useCallback((note: Note, nextSpace: ContentSpace) => run(() => api.updateNote({ ...note, space: nextSpace }), true), [run]);
  const toggleFavoriteNote = useCallback((note: Note) => updateNote({ ...note, favorite: !note.favorite }), [updateNote]);
  const archiveNote = useCallback((note: Note) => run(() => api.archiveNote(note.id, !note.archived)), [run]);
  const deleteNote = useCallback(async (note: Note) => {
    if (!await confirm({ title: "删除笔记", message: `删除“${note.title}”？内容会进入回收站。`, confirmLabel: "移入回收站", tone: "danger" })) return;
    await run(() => api.deleteNote(note.id), true);
    setSelectedNoteId(null);
  }, [confirm, run]);
  const updateTask = useCallback((task: Task) => run(() => api.updateTask(task)), [run]);
  const moveTaskToSpace = useCallback((task: Task, nextSpace: ContentSpace) => run(() => api.updateTask({ ...task, space: nextSpace }), true), [run]);
  const archiveTask = useCallback((task: Task) => run(() => api.archiveTask(task.id, true), true), [run]);
  const deleteTask = useCallback(async (task: Task) => {
    if (!await confirm({ title: "删除任务", message: `删除“${task.title}”？内容会进入回收站。`, confirmLabel: "移入回收站", tone: "danger" })) return;
    await run(() => api.deleteTask(task.id), true);
  }, [confirm, run]);
  const quickCreateTask = useCallback(async (draft: {
    title: string;
    priority?: TaskPriority;
    dueDate?: string | null;
    projectId?: string | null;
    status?: TaskStatus;
    parentId?: string | null;
  }) => {
    const targetSpace = space === "all" ? settings.defaultSpace : space;
    await run(() => api.createTask({
      title: draft.title,
      space: targetSpace,
      priority: draft.priority ?? "normal",
      dueDate: draft.dueDate ?? null,
      projectId: draft.projectId ?? null,
      status: draft.status ?? "todo",
      parentId: draft.parentId ?? null,
    }), true);
  }, [run, settings.defaultSpace, space]);
  const updateProject = useCallback((project: Project) => run(() => api.updateProject(project)), [run]);
  const moveProjectToSpace = useCallback((project: Project, nextSpace: ContentSpace) => run(() => api.updateProject({ ...project, space: nextSpace }), true), [run]);
  const toggleFavoriteProject = useCallback((project: Project) => updateProject({ ...project, favorite: !project.favorite }), [updateProject]);
  const archiveProject = useCallback((project: Project) => run(() => api.archiveProject(project.id, !project.archived)), [run]);
  const deleteProject = useCallback(async (project: Project) => {
    if (!await confirm({ title: "删除项目", message: `删除“${project.name}”？内容会进入回收站。`, confirmLabel: "移入回收站", tone: "danger" })) return;
    await run(() => api.deleteProject(project.id), true);
    setSelectedProjectId(null);
  }, [confirm, run]);
  const createTaskForProject = useCallback(async (title: string, projectId: string, targetSpace: Exclude<Space, "all">) => {
    await run(() => api.createTask({
      title,
      space: targetSpace,
      projectId,
      status: "todo",
      priority: "normal",
    }), true);
  }, [run]);
  const createNoteForProject = useCallback(async (title: string, projectId: string, targetSpace: Exclude<Space, "all">) => {
    await run(() => api.createNote({
      title,
      content: "",
      space: targetSpace,
      projectId,
    }), true);
  }, [run]);
  const saveEvent = useCallback(async (draft: ScheduleEventInput, existing?: ScheduleEvent) => {
    if (existing) {
      await run(() => api.updateEvent({ ...existing, ...draft, startTime: draft.startTime ?? null, endTime: draft.endTime ?? null, taskId: draft.taskId ?? null, projectId: draft.projectId ?? null }), true);
    } else {
      await run(() => api.createEvent(draft), true);
    }
  }, [run]);
  const moveEventToSpace = useCallback((event: ScheduleEvent, nextSpace: ContentSpace) => run(() => api.updateEvent({ ...event, space: nextSpace }), true), [run]);
  const archiveEvent = useCallback((event: ScheduleEvent) => run(() => api.archiveEvent(event.id, true)), [run]);
  const deleteEvent = useCallback(async (event: ScheduleEvent) => {
    if (!await confirm({ title: "删除日程", message: `删除“${event.title}”？内容会进入回收站。`, confirmLabel: "移入回收站", tone: "danger" })) return;
    await run(() => api.deleteEvent(event.id), true);
  }, [confirm, run]);
  const clearSelectedEvent = useCallback(() => setSelectedEventId(null), []);
  const updateChecklist = useCallback((checklist: Checklist) => run(() => api.updateChecklist(checklist)), [run]);
  const moveChecklistToSpace = useCallback((checklist: Checklist, nextSpace: ContentSpace) => run(() => api.updateChecklist({ ...checklist, space: nextSpace }), true), [run]);
  const archiveChecklist = useCallback((checklist: Checklist) => run(() => api.archiveChecklist(checklist.id, true)), [run]);
  const deleteChecklist = useCallback(async (checklist: Checklist) => {
    if (!await confirm({ title: "删除清单", message: `删除“${checklist.title}”？内容会进入回收站。`, confirmLabel: "移入回收站", tone: "danger" })) return;
    await run(() => api.deleteChecklist(checklist.id), true);
  }, [confirm, run]);
  const duplicateChecklist = useCallback(async (checklist: Checklist) => {
    const cloned = cloneChecklist(checklist);
    await run(() => api.createChecklist({
      title: cloned.title,
      description: cloned.description,
      items: cloned.items,
      space: cloned.space,
      tags: cloned.tags,
    }), true);
  }, [run]);
  const updateTemplate = useCallback((template: Template) => run(() => api.updateTemplate(template)), [run]);
  const moveTemplateToSpace = useCallback((template: Template, nextSpace: ContentSpace) => run(() => api.updateTemplate({ ...template, space: nextSpace }), true), [run]);
  const archiveTemplate = useCallback((template: Template) => run(() => api.archiveTemplate(template.id, true)), [run]);
  const deleteTemplate = useCallback(async (template: Template) => {
    if (!await confirm({ title: "删除模板", message: `删除“${template.name}”？内容会进入回收站。`, confirmLabel: "移入回收站", tone: "danger" })) return;
    await run(() => api.deleteTemplate(template.id), true);
  }, [confirm, run]);
  const useTemplate = useCallback(async (template: Template) => {
    const created = await run(() => api.createFromTemplate(template.id, createSpaceFor(settings, space)), true);
    if (created) setActivePage(template.kind === "note" ? "notes" : template.kind === "task" ? "tasks" : template.kind === "project" ? "projects" : "checklists");
  }, [run, settings, space]);
  const archiveInboxItem = useCallback((item: InboxItem) => run(() => api.archiveInboxItem(item.id, true)), [run]);
  const updateInboxItem = useCallback((item: InboxItem) => run(() => api.updateInboxItem(item), true), [run]);
  const deleteInboxItem = useCallback(async (item: InboxItem) => {
    if (!await confirm({ title: "删除收件箱内容", message: `删除“${item.title}”？内容会进入回收站。`, confirmLabel: "移入回收站", tone: "danger" })) return;
    await run(() => api.deleteInboxItem(item.id), true);
  }, [confirm, run]);
  const moveInboxItem = useCallback((item: InboxItem, nextSpace: "personal" | "work") => run(() => api.moveInboxItem(item.id, nextSpace)), [run]);
  const updateSparkStage = useCallback((item: InboxItem, stage: SparkStage) => run(() => api.updateSparkStage(item.id, stage)), [run]);
  const promoteInboxItem = useCallback((item: InboxItem, target: "note" | "task") => run(() => api.promoteInboxItem(item.id, target)), [run]);
  const attachToNote = useCallback(async (note: Note) => {
    if (!isTauri()) {
      setError("附件选择需要在桌面应用中运行。");
      return;
    }
    const selected = await open({ multiple: false, directory: false, title: "选择要复制到 Workspace 的附件" });
    const sourcePath = Array.isArray(selected) ? selected[0] : selected;
    if (!sourcePath) return;
    await run(() => api.addAttachment(sourcePath, note.space, note.id));
  }, [run]);

  const importNotes = useCallback(async (options?: { folder?: boolean; projectId?: string | null }) => {
    if (!isTauri()) {
      setError("笔记导入需要在桌面应用中运行。");
      return;
    }

    let paths: string[] = [];

    if (options?.folder) {
      const selectedDir = await open({
        multiple: false,
        directory: true,
        title: "选择包含 Markdown 笔记的文件夹",
      });
      const dirPath = Array.isArray(selectedDir) ? selectedDir[0] : selectedDir;
      if (!dirPath) return;

      try {
        paths = await api.scanMarkdownFiles(dirPath);
        if (paths.length === 0) {
          setError("所选文件夹中未发现任何 Markdown (.md, .markdown, .txt) 文件。");
          return;
        }
      } catch (cause) {
        setError(errorMessage(cause));
        return;
      }
    } else {
      const selected = await open({
        multiple: true,
        directory: false,
        title: "选择要导入的 Markdown 笔记（支持按住 Ctrl / Shift 多选）",
        filters: [{ name: "Markdown / 文本", extensions: ["md", "markdown", "txt"] }],
      });
      if (!selected) return;
      paths = Array.isArray(selected) ? selected : [selected];
    }

    if (paths.length === 0) return;

    try {
      const targetSpace = createSpaceFor(settings, space);
      const inputs = await Promise.all(
        paths.map(async (p) => {
          const raw = await api.readTextFile(p);
          const parsed = parseMarkdownNoteImport(p, raw);
          return {
            title: parsed.title,
            content: parsed.content,
            space: targetSpace,
            projectId: options?.projectId ?? null,
            tags: parsed.tags,
          };
        })
      );

      const createdList = await run(() => api.batchCreateNotes(inputs), true);
      if (Array.isArray(createdList) && createdList.length > 0) {
        setSelectedNoteId(createdList[0].id);
        setActivePage("notes");
        showToast(
          createdList.length === 1
            ? `已成功导入 1 篇 Markdown 笔记「${createdList[0].title}」`
            : `已成功导入 ${createdList.length} 篇 Markdown 笔记`
        );
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [run, settings, showToast, space]);

  const importNoteFiles = useCallback(async (files: File[], projectId?: string | null) => {
    const mdFiles = files.filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt");
    });
    if (mdFiles.length === 0) return;

    try {
      const targetSpace = createSpaceFor(settings, space);
      const inputs = await Promise.all(
        mdFiles.map(async (file) => {
          const raw = await file.text();
          const parsed = parseMarkdownNoteImport(file.name, raw);
          return {
            title: parsed.title,
            content: parsed.content,
            space: targetSpace,
            projectId: projectId ?? null,
            tags: parsed.tags,
          };
        })
      );

      if (isTauri()) {
        const createdList = await run(() => api.batchCreateNotes(inputs), true);
        if (Array.isArray(createdList) && createdList.length > 0) {
          setSelectedNoteId(createdList[0].id);
          setActivePage("notes");
          showToast(
            createdList.length === 1
              ? `已成功导入 1 篇 Markdown 笔记「${createdList[0].title}」`
              : `已成功导入 ${createdList.length} 篇 Markdown 笔记`
          );
        }
      } else {
        const mockCreated = inputs.map((inp, idx) => ({
          id: `note-${Date.now()}-${idx}`,
          title: inp.title,
          content: inp.content,
          space: inp.space,
          projectId: inp.projectId,
          tags: inp.tags,
          favorite: false,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deviceId: "mock-device",
          workspaceId: "mock-workspace",
          revision: 1,
        }));
        setNotes((prev) => [...mockCreated, ...prev]);
        setSelectedNoteId(mockCreated[0].id);
        setActivePage("notes");
        showToast(
          mockCreated.length === 1
            ? `已成功导入 1 篇 Markdown 笔记「${mockCreated[0].title}」`
            : `已成功导入 ${mockCreated.length} 篇 Markdown 笔记`
        );
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [run, settings, showToast, space]);

  const importTasks = useCallback(async () => {
    if (!isTauri()) {
      setError("任务导入需要在桌面应用中运行。");
      return;
    }
    const selected = await open({
      multiple: false,
      directory: false,
      title: "选择要导入的任务文本",
      filters: [{ name: "文本文件", extensions: ["txt", "md", "markdown", "csv"] }],
    });
    const sourcePath = Array.isArray(selected) ? selected[0] : selected;
    if (!sourcePath) return;
    try {
      const titles = parseTaskImport(await api.readTextFile(sourcePath));
      if (titles.length === 0) {
        setError("文件中没有可导入的任务，每行需要有一个任务标题。");
        return;
      }
      await run(async () => {
        for (const title of titles) {
          await api.createTask({
            title,
            description: "",
            status: "todo",
            priority: "normal",
            dueDate: null,
            space: createSpaceFor(settings, space),
            projectId: null,
            parentId: null,
            tags: [],
          });
        }
      });
      setActivePage("tasks");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [run, settings, space]);

  const minimizeToTray = useCallback(async () => {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().hide();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  const createKnowledgeFolder = useCallback(async (input: KnowledgeFolderInput) => {
    await run(() => api.createKnowledgeFolder(input), true);
  }, [run]);
  const updateKnowledgeFolder = useCallback(async (id: string, name: string) => {
    await run(async () => {
      const folder = await api.getKnowledgeFolder(id);
      return api.updateKnowledgeFolder({ ...folder, name });
    }, true);
  }, [run]);
  const moveKnowledgeFolder = useCallback(async (id: string, parentId: string | null) => {
    await run(async () => {
      const folder = await api.getKnowledgeFolder(id);
      return api.updateKnowledgeFolder({ ...folder, parentId });
    }, true);
  }, [run]);
  const moveKnowledgeFolderToSpace = useCallback(async (node: KnowledgeNode, nextSpace: ContentSpace) => {
    const isSelectedPageInFolder = () => {
      let current = knowledgeNodes.find((candidate) => candidate.id === selectedKnowledgePageId);
      while (current) {
        if (current.id === node.id) return true;
        const parentId = current.parentId;
        if (!parentId) break;
        current = knowledgeNodes.find((candidate) => candidate.id === parentId);
      }
      return false;
    };
    const clearSelection = node.kind === "folder" && isSelectedPageInFolder();
    const result = await run(() => api.moveKnowledgeFolderSpace(node.id, nextSpace), true);
    if (clearSelection) {
      setSelectedKnowledgePageId(null);
      setSelectedKnowledgePage(null);
    }
    return result;
  }, [knowledgeNodes, run, selectedKnowledgePageId]);
  const createKnowledgePage = useCallback(async (input: KnowledgePageInput) => {
    const created = await run(() => api.createKnowledgePage(input), true);
    if (isKnowledgePage(created)) {
      setSelectedKnowledgePageId(created.id);
      setSelectedKnowledgePage(created);
    }
  }, [run]);
  const updateKnowledgePage = useCallback(async (page: KnowledgePage) => {
    const updated = await run(() => api.updateKnowledgePage(page), true);
    if (isKnowledgePage(updated)) setSelectedKnowledgePage(updated);
  }, [run]);
  const moveKnowledgePageToSpace = useCallback(async (page: KnowledgePage, nextSpace: ContentSpace) => {
    const updated = await run(() => api.updateKnowledgePage({ ...page, space: nextSpace, parentId: null }), true);
    if (isKnowledgePage(updated)) setSelectedKnowledgePage(updated);
  }, [run]);
  const moveKnowledgeNodeToSpace = useCallback((node: KnowledgeNode, nextSpace: ContentSpace) => {
    if (node.kind === "folder") return moveKnowledgeFolderToSpace(node, nextSpace);
    return run(async () => {
      const page = await api.getKnowledgePage(node.id);
      const updated = await api.updateKnowledgePage({ ...page, space: nextSpace, parentId: null });
      if (isKnowledgePage(updated)) setSelectedKnowledgePage(updated);
      return updated;
    }, true);
  }, [moveKnowledgeFolderToSpace, run]);
  const restoreKnowledgeNode = useCallback((node: KnowledgeNode) => run(async () => {
    const ancestors: KnowledgeNode[] = [];
    let parentId = node.parentId;
    while (parentId) {
      const parent = knowledgeNodes.find((candidate) => candidate.id === parentId && candidate.kind === "folder");
      if (!parent) break;
      if (parent.archived) ancestors.push(parent);
      parentId = parent.parentId;
    }
    for (const ancestor of ancestors.reverse()) {
      const folder = await api.getKnowledgeFolder(ancestor.id);
      if (folder.archived) await api.updateKnowledgeFolder({ ...folder, archived: false });
    }
    if (node.kind === "folder") {
      const folder = await api.getKnowledgeFolder(node.id);
      return api.updateKnowledgeFolder({ ...folder, archived: false });
    }
    const page = await api.getKnowledgePage(node.id);
    return api.updateKnowledgePage({ ...page, archived: false });
  }, true), [knowledgeNodes, run]);
  const deleteKnowledgePage = useCallback(async (page: KnowledgePage) => {
    await run(() => api.deleteKnowledgePage(page.id), true);
    setSelectedKnowledgePageId(null);
    setSelectedKnowledgePage(null);
  }, [run]);
  const deleteKnowledgeFolder = useCallback(async (node: KnowledgeNode) => {
    await run(() => api.deleteKnowledgeFolder(node.id), true);
    setSelectedKnowledgePageId(null);
    setSelectedKnowledgePage(null);
  }, [run]);
  const importPdf = useCallback(async (sourcePath: string, targetSpace: "personal" | "work") => {
    const created = await run(() => api.importPdf(sourcePath, targetSpace), true);
    if (created && isPdfDocument(created)) setSelectedDocumentId(created.id);
  }, [run]);
  const moveDocumentToSpace = useCallback((document: PdfDocument, nextSpace: ContentSpace) => run(() => api.moveDocumentSpace(document.id, nextSpace), true), [run]);
  const ocrPdf = useCallback(async (document: PdfDocument) => {
    const updated = await run(() => api.ocrPdf(document.id), true);
    if (updated && isPdfDocument(updated)) setSelectedDocumentId(updated.id);
  }, [run]);
  const exportPdf = useCallback(async (document: PdfDocument, targetPath: string) => {
    await run(() => api.exportPdf(document.id, targetPath), true);
  }, [run]);
  const deleteDocument = useCallback(async (document: PdfDocument) => {
    await run(() => api.deleteDocument(document.id), true);
    setSelectedDocumentId(null);
  }, [run]);
  const installPlugin = useCallback(async (sourcePath: string) => {
    await run(() => api.installPlugin(sourcePath), true);
  }, [run]);
  const togglePlugin = useCallback(async (plugin: PluginManifest) => {
    await run(() => api.setPluginEnabled(plugin.id, !plugin.enabled), true);
  }, [run]);
  const importNoteToKnowledge = useCallback(async (noteId: string, parentId: string | null, moveSource: boolean) => {
    const created = await run(() => api.copyNoteToKnowledge(noteId, createSpaceFor(settings, space), parentId, moveSource), true);
    if (isKnowledgePage(created)) {
      setSelectedKnowledgePageId(created.id);
      setSelectedKnowledgePage(created);
    }
  }, [run, settings, space]);
  const restoreVersion = useCallback(async (versionId: string) => {
    await run(() => api.restoreVersion(versionId), true);
    if (selectedKnowledgePageId) {
      try { setSelectedKnowledgePage(await api.getKnowledgePage(selectedKnowledgePageId)); } catch { setSelectedKnowledgePage(null); }
    }
  }, [run, selectedKnowledgePageId]);
  const restoreTrash = useCallback(async (item: TrashItem) => {
    await run(() => api.restoreTrashItem(item.id), true);
  }, [run]);
  const permanentlyDeleteTrash = useCallback(async (item: TrashItem) => {
    await run(() => api.permanentlyDeleteTrashItem(item.id), true);
  }, [run]);
  const purgeTrash = useCallback(async () => {
    await run(() => api.purgeTrash(), true);
  }, [run]);

  const saveSettings = useCallback(async (nextSettings: AppSettings) => {
    await run(async () => {
      const saved = await api.updateSettings(nextSettings);
      setSettings(saved);
      return saved;
    }, true);
  }, [run]);

  const createBackup = useCallback(async () => {
    await run(async () => {
      const backup = await api.createBackup();
      setBackups((current) => [backup, ...current.filter((item) => item.name !== backup.name)]);
      return backup;
    });
  }, [run]);

  const restoreBackup = useCallback(async (name: string) => {
    if (!await confirm({ title: "恢复备份", message: `恢复 ${name} 前会自动创建当前数据的安全备份。要继续吗？`, confirmLabel: "恢复备份" })) return;
    await run(() => api.restoreBackup(name));
  }, [confirm, run]);

  const sync = useCallback(async (action: SyncAction) => {
    if (!isTauri()) {
      setError("同步功能需要在桌面应用中运行。");
      return null;
    }
    try {
      const report = await api.sync(action);
      setSyncHistory(await api.listSyncHistory());
      if (action === "pull" || action === "force_pull") await reload();
      return report;
    } catch (cause) {
      setError(errorMessage(cause));
      return null;
    }
  }, [reload]);

  const openSearchResult = (result: SearchResult) => {
    setSearchQuery("");
    if (result.kind === "note") { setSelectedNoteId(result.id); setActivePage("notes"); }
    else if (result.kind === "project") { setSelectedProjectId(result.id); setActivePage("projects"); }
    else if (result.kind === "task") { setSelectedTaskId(result.id); setActivePage("tasks"); }
    else if (result.kind === "event") { setSelectedEventId(result.id); setActivePage("schedule"); }
    else if (result.kind === "checklist") { setSelectedChecklistId(result.id); setActivePage("checklists"); }
    else if (result.kind === "knowledge_page") { setSelectedKnowledgePageId(result.id); setActivePage("knowledge"); }
    else if (result.kind === "pdf") { setSelectedDocumentId(result.id); setActivePage("documents"); }
    else if (result.kind === "inbox") { setSelectedInboxId(result.id); setActivePage(inbox.find((item) => item.id === result.id)?.kind === "spark" ? "sparks" : "inbox"); }
    else setActivePage("inbox");
  };

  const openTarget = (id: string, kind: string) => {
    if (kind === "note") { setSelectedNoteId(id); setActivePage("notes"); }
    else if (kind === "knowledge_page") { setSelectedKnowledgePageId(id); setActivePage("knowledge"); }
  };

  const selectPaletteCommand = (command: PaletteCommand) => {
    setPaletteOpen(false);
    if (command.action === "toggle-sidebar") {
      toggleSidebar();
      return;
    }
    if (["note", "task", "project", "inbox", "spark", "checklist", "template"].includes(command.action)) {
      setModal(command.action as CreateKind);
      return;
    }
    if (command.action === "event") {
      setActivePage("schedule");
      setScheduleCreateRequest((current) => current + 1);
      return;
    }
    if (command.action === "sync" || command.action === "sync-status") {
      setActivePage("settings");
      void sync(command.action === "sync" ? "push" : "status");
      return;
    }
    if (command.action === "sync-log") {
      setActivePage("settings");
      return;
    }
    setActivePage(command.action as PageId);
  };

  const exportData = useCallback(() => {
    const exportPayload = {
      appName: "NoahNote",
      exportedAt: new Date().toISOString(),
      version: "0.1.0",
      stats: {
        notes: notes.length,
        tasks: tasks.length,
        projects: projects.length,
        inbox: inbox.length,
        events: events.length,
        checklists: checklists.length,
        templates: templates.length,
      },
      data: {
        notes,
        tasks,
        projects,
        inbox,
        events,
        checklists,
        templates,
      },
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `noahnote-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [checklists, events, inbox, notes, projects, tasks, templates]);

  const inboxItems = inbox.filter((item) => item.kind !== "spark");
  const sparkItems = inbox.filter((item) => item.kind === "spark");

  const selectedKnowledgePageForSpace = selectedKnowledgePage && (space === "all" || selectedKnowledgePage.space === space) ? selectedKnowledgePage : null;
  const archiveEntries = useMemo<ArchiveEntry[]>(() => [
    ...notes.filter((item) => item.archived).map((item) => ({ id: item.id, kind: "笔记", title: item.title || "无标题笔记", detail: "", space: item.space, updatedAt: item.updatedAt, onRestore: () => run(() => api.archiveNote(item.id, false), true), onMove: (nextSpace: ContentSpace) => moveNoteToSpace(item, nextSpace) })),
    ...tasks.filter((item) => item.archived).map((item) => ({ id: item.id, kind: "任务", title: item.title, detail: item.description, space: item.space, updatedAt: item.updatedAt, onRestore: () => run(() => api.archiveTask(item.id, false), true), onMove: (nextSpace: ContentSpace) => moveTaskToSpace(item, nextSpace) })),
    ...projects.filter((item) => item.archived).map((item) => ({ id: item.id, kind: "项目", title: item.name, detail: item.description, space: item.space, updatedAt: item.updatedAt, onRestore: () => run(() => api.archiveProject(item.id, false), true), onMove: (nextSpace: ContentSpace) => moveProjectToSpace(item, nextSpace) })),
    ...checklists.filter((item) => item.archived).map((item) => ({ id: item.id, kind: "清单", title: item.title, detail: item.items.length + " 项内容", space: item.space, updatedAt: item.updatedAt, onRestore: () => run(() => api.archiveChecklist(item.id, false), true), onMove: (nextSpace: ContentSpace) => moveChecklistToSpace(item, nextSpace) })),
    ...events.filter((item) => item.archived).map((item) => ({ id: item.id, kind: "日程", title: item.title, detail: item.date, space: item.space, updatedAt: item.updatedAt, onRestore: () => run(() => api.archiveEvent(item.id, false), true), onMove: (nextSpace: ContentSpace) => moveEventToSpace(item, nextSpace) })),
    ...inbox.filter((item) => item.archived).map((item) => ({ id: item.id, kind: item.kind === "spark" ? "思维灵光" : "收件箱", title: item.title, detail: item.body, space: item.space, updatedAt: item.updatedAt, onRestore: () => run(() => api.archiveInboxItem(item.id, false), true), onMove: (nextSpace: ContentSpace) => moveInboxItem(item, nextSpace) })),
    ...templates.filter((item) => item.archived).map((item) => ({ id: item.id, kind: "模板", title: item.name, detail: item.description, space: item.space, updatedAt: item.updatedAt, onRestore: () => run(() => api.archiveTemplate(item.id, false), true), onMove: (nextSpace: ContentSpace) => moveTemplateToSpace(item, nextSpace) })),
    ...knowledgeNodes.filter((item) => item.archived).map((item) => ({ id: item.id, kind: item.kind === "folder" ? "知识目录" : "知识页面", title: item.title, detail: "", space: item.space, updatedAt: item.updatedAt, onRestore: () => restoreKnowledgeNode(item), onMove: (nextSpace: ContentSpace) => moveKnowledgeNodeToSpace(item, nextSpace) })),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [checklists, events, inbox, knowledgeNodes, moveChecklistToSpace, moveEventToSpace, moveInboxItem, moveKnowledgeNodeToSpace, moveNoteToSpace, moveProjectToSpace, moveTaskToSpace, moveTemplateToSpace, notes, projects, restoreKnowledgeNode, run, tasks, templates]);

  const page = useMemo(() => {
    const create = (kind: CreateKind) => setModal(kind);
    switch (activePage) {
      case "inbox": return <InboxPage space={space} items={inboxItems} selectedId={selectedInboxId} onSelect={setSelectedInboxId} onCreate={create} onUpdate={updateInboxItem} onArchive={archiveInboxItem} onDelete={deleteInboxItem} onMove={moveInboxItem} onPromote={promoteInboxItem} />;
      case "sparks": return <SparksPage space={space} items={sparkItems} selectedId={selectedInboxId} onCreate={create} onStageChange={updateSparkStage} onArchive={archiveInboxItem} onDelete={deleteInboxItem} onMove={moveInboxItem} onPromote={promoteInboxItem} />;
      case "today": return <TodayPage space={space} tasks={tasks} notes={notes} events={events} inbox={inbox} onCreate={create} onNavigate={setActivePage} onToggleTask={(task) => updateTask({ ...task, status: task.status === "done" ? "todo" : "done" })} />;
      case "tasks": return <TasksPage space={space} tasks={tasks} projects={projects} selectedId={selectedTaskId} onSelect={setSelectedTaskId} onCreate={create} onUpdate={updateTask} onArchive={archiveTask} onMoveSpace={moveTaskToSpace} onDelete={deleteTask} onImport={importTasks} onQuickCreate={quickCreateTask} />;
      case "schedule": return <SchedulePage space={space} createSpace={createSpaceFor(settings, space)} events={events} tasks={tasks} projects={projects} createRequest={scheduleCreateRequest} selectedId={selectedEventId} onSelectionHandled={clearSelectedEvent} onSave={saveEvent} onArchive={archiveEvent} onDelete={deleteEvent} />;
      case "notes": return <NotesPage space={space} notes={notes} projects={projects} selectedId={selectedNoteId} onSelect={setSelectedNoteId} onCreate={create} onUpdate={updateNote} onMoveSpace={moveNoteToSpace} onToggleFavorite={toggleFavoriteNote} onArchive={archiveNote} onDelete={deleteNote} onAttach={attachToNote} onImport={importNotes} onImportFiles={importNoteFiles} onRestoreVersion={restoreVersion} onOpenTarget={openTarget} preferences={preferences} onPreferencesChange={setPreferences} />;
      case "projects": return <ProjectsPage space={space} projects={projects} tasks={tasks} notes={notes} selectedId={selectedProjectId} onSelect={setSelectedProjectId} onCreate={create} onUpdate={updateProject} onToggleFavorite={toggleFavoriteProject} onArchive={archiveProject} onMoveSpace={moveProjectToSpace} onDelete={deleteProject} onToggleTask={(task) => updateTask({ ...task, status: task.status === "done" ? "todo" : "done" })} onOpenTask={(id) => { setSelectedTaskId(id); setActivePage("tasks"); }} onOpenNote={(id) => { setSelectedNoteId(id); setActivePage("notes"); }} onCreateTaskForProject={createTaskForProject} onCreateNoteForProject={createNoteForProject} />;
      case "checklists": return <ChecklistsPage space={space} checklists={checklists} selectedId={selectedChecklistId} onSelect={setSelectedChecklistId} onCreate={create} onUpdate={updateChecklist} onArchive={archiveChecklist} onMoveSpace={moveChecklistToSpace} onDelete={deleteChecklist} onDuplicate={duplicateChecklist} />;
      case "templates": return <TemplatesPage space={space} templates={templates} onCreate={create} onUpdate={updateTemplate} onArchive={archiveTemplate} onMoveSpace={moveTemplateToSpace} onDelete={deleteTemplate} onUse={useTemplate} />;
      case "knowledge": return <KnowledgeBasePage space={space} createSpace={createSpaceFor(settings, space)} nodes={knowledgeNodes} notes={notes} selectedPage={selectedKnowledgePageForSpace} onSelectPage={(id) => { setSelectedKnowledgePageId(id); setSelectedKnowledgePage(null); }} onCreateFolder={createKnowledgeFolder} onCreatePage={createKnowledgePage} onUpdatePage={updateKnowledgePage} onMovePageSpace={moveKnowledgePageToSpace} onRenameFolder={updateKnowledgeFolder} onMoveFolder={moveKnowledgeFolder} onMoveFolderSpace={moveKnowledgeFolderToSpace} onDeletePage={deleteKnowledgePage} onDeleteFolder={deleteKnowledgeFolder} onImportNote={importNoteToKnowledge} onRestoreVersion={restoreVersion} onOpenTarget={openTarget} preferences={preferences} onPreferencesChange={setPreferences} />;
      case "documents": return <DocumentsPage space={space} documents={documents} selectedId={selectedDocumentId} onSelect={setSelectedDocumentId} onImport={importPdf} onExport={exportPdf} onOcr={ocrPdf} onDelete={deleteDocument} onMoveSpace={moveDocumentToSpace} />;
      case "plugins": return <PluginsPage plugins={plugins} onInstall={installPlugin} onToggle={togglePlugin} />;
      case "archive": return <ArchivePage space={space} entries={archiveEntries} />;
      case "trash": return <TrashPage space={space} retentionDays={settings.trashRetentionDays} items={trashItems} onRestore={restoreTrash} onDelete={permanentlyDeleteTrash} onPurge={purgeTrash} />;
      case "settings": return <SettingsPage settings={settings} backups={backups} syncHistory={syncHistory} preferences={preferences} onSave={saveSettings} onPreferencesChange={setPreferences} onBackup={createBackup} onRestore={restoreBackup} onSync={sync} theme={theme} onThemeChange={changeTheme} stats={{ notesCount: notes.length, tasksCount: tasks.length, projectsCount: projects.length, knowledgeCount: knowledgeNodes.filter((n) => n.kind === "page").length, eventsCount: events.length, documentsCount: documents.length }} onExportData={exportData} />;
      default: return <OverviewPage space={space} notes={notes} tasks={tasks} projects={projects} inbox={inboxItems} events={events} checklists={checklists} onCreate={create} onNavigate={setActivePage} onToggleTask={updateTask} />;
    }
  }, [activePage, archiveChecklist, archiveEntries, archiveEvent, archiveInboxItem, archiveNote, archiveProject, archiveTask, archiveTemplate, attachToNote, backups, changeTheme, checklists, clearSelectedEvent, createBackup, createKnowledgeFolder, createKnowledgePage, deleteChecklist, deleteDocument, deleteEvent, deleteInboxItem, deleteKnowledgeFolder, deleteKnowledgePage, deleteNote, deleteProject, deleteTask, deleteTemplate, documents, events, exportPdf, importNoteToKnowledge, importPdf, importTasks, inbox, installPlugin, knowledgeNodes, moveDocumentToSpace, moveInboxItem, moveKnowledgeFolder, moveKnowledgeFolderToSpace, moveKnowledgePageToSpace, moveNoteToSpace, moveProjectToSpace, moveTaskToSpace, moveTemplateToSpace, moveChecklistToSpace, moveEventToSpace, moveKnowledgeNodeToSpace, ocrPdf, permanentlyDeleteTrash, plugins, projects, promoteInboxItem, purgeTrash, restoreBackup, restoreKnowledgeNode, restoreTrash, restoreVersion, saveEvent, saveSettings, scheduleCreateRequest, selectedChecklistId, selectedDocumentId, selectedEventId, selectedInboxId, selectedKnowledgePageForSpace, selectedNoteId, selectedProjectId, selectedTaskId, settings, space, sync, syncHistory, tasks, templates, theme, toggleFavoriteNote, togglePlugin, trashItems, updateChecklist, updateInboxItem, updateKnowledgePage, updateNote, updateProject, updateSparkStage, updateTask, updateTemplate, useTemplate, createNoteForProject, createTaskForProject, duplicateChecklist, exportData, importNoteFiles, importNotes, notes, preferences, quickCreateTask, setPreferences, toggleFavoriteProject]);

  const createSpace = space === "all" ? settings.defaultSpace : space;

  return <AppShell activePage={activePage} space={space} searchQuery={searchQuery} searchResults={searchResults} searchInputRef={searchRef} loading={loading} inboxCount={inboxItems.filter((item) => !item.archived).length} sidebarCollapsed={preferences.sidebarCollapsed} sidebarCompact={preferences.sidebarCompact} onToggleSidebar={toggleSidebar} onNavigate={setActivePage} onSpaceChange={setSpace} onSearchChange={setSearchQuery} onSearchFocus={() => undefined} onOpenSearchResult={openSearchResult} onQuickCapture={() => setModal("inbox")} theme={theme} onThemeToggle={toggleAppTheme} onMinimizeToTray={() => void minimizeToTray()} onRefresh={() => void reload()}>{!isTauri() ? <div className="dev-banner"><span>预览模式</span> 当前页面使用空数据；运行 <code>npm run tauri dev</code> 连接本地 Workspace。</div> : null}{error ? <div className="error-banner"><span>!</span><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="关闭提示">×</button></div> : null}{toast ? <div className="toast-message">{toast}</div> : null}{page}{modal ? <CreateModal kind={modal} space={createSpace} projects={projects} onClose={() => setModal(null)} onSave={(values) => handleCreate(modal, values)} /> : null}{paletteOpen ? <CommandPalette onClose={() => setPaletteOpen(false)} onSelect={selectPaletteCommand} /> : null}</AppShell>;
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function stringOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function tagsFrom(value: unknown) {
  return String(value ?? "").split(/[\s,，#]+/).map((tag) => tag.trim()).filter(Boolean);
}

function checklistItemsFrom(value: string): ChecklistItem[] {
  return value.split(/\r?\n/).map((text, position) => ({ id: "", text: text.trim(), completed: false, position })).filter((item) => item.text);
}

function templatePayloadFrom(values: FormValues, kind: TemplateKind): Record<string, unknown> {
  const title = String(values.templateTitle ?? "").trim() || String(values.name ?? "").trim();
  const description = String(values.templateDescription ?? "");
  const tags = tagsFrom(values.tags);
  const items = checklistItemsFrom(String(values.templateItems ?? ""));
  if (kind === "note") return { title, content: String(values.templateContent ?? ""), projectId: null, tags };
  if (kind === "task") return { title, description, status: "todo", priority: "normal", dueDate: null, projectId: null, parentId: null, tags };
  if (kind === "project") return { name: title, description, status: "planning", progress: 0, tags };
  return { title, description, items, tags };
}

function createSpaceFor(settings: AppSettings, space: Space): "personal" | "work" {
  return space === "all" ? settings.defaultSpace : space;
}

function isNote(value: unknown): value is Note { return Boolean(value && typeof value === "object" && "content" in value); }
function isProject(value: unknown): value is Project { return Boolean(value && typeof value === "object" && "progress" in value); }
function isKnowledgePage(value: unknown): value is KnowledgePage { return Boolean(value && typeof value === "object" && "parentId" in value && "content" in value); }
function isPdfDocument(value: unknown): value is PdfDocument { return Boolean(value && typeof value === "object" && "relativePath" in value && "ocrStatus" in value); }
