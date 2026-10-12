import { Button, DialogLayer, EmptyState, IconButton, SelectField, TextArea, TextField } from "../components/ui";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import type { ContentSpace, Project, Space, Task, Note } from "../types";
import { formatRelative, projectStatusLabel, parseTags, priorityLabel } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import { CheckIcon } from "../components/CheckIcon";
import type { CreateKind } from "../components/Modal";
import {
  calculateProjectTaskStats,
  filterAndSortProjects,
  type ProjectSortOption,
} from "../lib/projects";

interface ProjectsPageProps {
  space: Space;
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: CreateKind) => void;
  onUpdate: (project: Project) => void;
  onToggleFavorite?: (project: Project) => void;
  onArchive: (project: Project) => void;
  onMoveSpace: (project: Project, space: ContentSpace) => void | Promise<unknown>;
  onDelete: (project: Project) => Promise<void>;
  onToggleTask?: (task: Task) => void;
  onOpenTask?: (id: string) => void;
  onOpenNote?: (id: string) => void;
  onCreateTaskForProject?: (
    title: string,
    projectId: string,
    space: Exclude<Space, "all">
  ) => Promise<void>;
  onCreateNoteForProject?: (
    title: string,
    projectId: string,
    space: Exclude<Space, "all">
  ) => Promise<void>;
}

export function ProjectsPage({
  space,
  projects,
  tasks,
  notes,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onToggleFavorite,
  onArchive,
  onMoveSpace,
  onDelete,
  onToggleTask,
  onOpenTask,
  onOpenNote,
  onCreateTaskForProject,
  onCreateNoteForProject,
}: ProjectsPageProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ProjectSortOption>("updated");
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<Project | null>(null);
  const saveTriggerRef = useRef<(() => void) | null>(null);

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    return filterAndSortProjects(projects, tasks, {
      status: statusFilter,
      search: searchQuery,
      sortBy,
    });
  }, [projects, tasks, statusFilter, searchQuery, sortBy]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;

  const handleSelectProject = (id: string | null) => {
    if (id === selectedId) return;
    if (isEditorDirty) {
      setPendingSelectId(id);
      return;
    }
    onSelect(id);
  };

  const handleConfirmSaveAndSwitch = () => {
    if (saveTriggerRef.current) {
      saveTriggerRef.current();
    }
    const target = pendingSelectId;
    setPendingSelectId(null);
    onSelect(target);
  };

  const handleDiscardAndSwitch = () => {
    const target = pendingSelectId;
    setPendingSelectId(null);
    setIsEditorDirty(false);
    onSelect(target);
  };

  return (
    <div className="page-stack projects-page-stack">
      <PageHeader
        eyebrow="上下文工作"
        title="项目"
        description={`${projects.length} 个项目 · 将任务、笔记与目标进度整合在一起`}
        action={
          <Button variant="primary" onClick={() => onCreate("project")}>
            ＋ 新建项目
          </Button>
        }
      />

      {/* Unsaved Changes Confirmation Modal */}
      {pendingSelectId !== null && (
        <DialogLayer onClose={() => setPendingSelectId(null)}>
          <div className="modal-card confirm-modal-card">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">提示</span>
                <h2>未保存的项目更改</h2>
              </div>
              <IconButton className="close-button" label="关闭" onClick={() => setPendingSelectId(null)}>
                ×
              </IconButton>
            </div>
            <div className="modal-body">
              <p className="confirm-modal-body">
                当前项目有未保存的修改，切换项目将丢失这些修改。请选择如何处理：
              </p>
            </div>
            <div className="modal-actions">
              <Button variant="secondary"
               
                onClick={() => setPendingSelectId(null)}
              >
                留在当前项目
              </Button>
              <button
                type="button"
                className="button secondary danger"
                onClick={handleDiscardAndSwitch}
              >
                放弃修改并切换
              </button>
              <Button variant="primary"
               
                onClick={handleConfirmSaveAndSwitch}
              >
                保存并切换
              </Button>
            </div>
          </div>
        </DialogLayer>
      )}

      {/* Delete Project Confirmation Modal */}
      {deleteConfirmProject && (
        <DialogLayer onClose={() => setDeleteConfirmProject(null)}>
          <div className="modal-card confirm-modal-card">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">删除确认</span>
                <h2>删除项目</h2>
              </div>
              <IconButton className="close-button" label="关闭" onClick={() => setDeleteConfirmProject(null)}>
                ×
              </IconButton>
            </div>
            <div className="modal-body">
              <p className="confirm-modal-body">
                确定要删除项目 <strong>“{deleteConfirmProject.name}”</strong> 吗？
              </p>
              <div className="confirm-modal-tip">
                💡 提示：该项目关联的{" "}
                <strong>
                  {tasks.filter((t) => t.projectId === deleteConfirmProject.id).length}
                </strong>{" "}
                个任务和{" "}
                <strong>
                  {notes.filter((n) => n.projectId === deleteConfirmProject.id).length}
                </strong>{" "}
                篇笔记不会被删除，它们将转为无关联项目状态。
              </div>
            </div>
            <div className="modal-actions">
              <Button variant="secondary"
               
                onClick={() => setDeleteConfirmProject(null)}
              >
                取消
              </Button>
              <button
                type="button"
                className="button primary danger"
                onClick={async () => {
                  await onDelete(deleteConfirmProject);
                  setDeleteConfirmProject(null);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </DialogLayer>
      )}

      <div className="projects-layout">
        <section className="projects-main-column">
          {/* Controls Bar: Status Filter Tabs, Search & Sort */}
          <div className="projects-filter-bar">
            <div className="project-status-tabs">
              <button
                type="button"
                className={statusFilter === "all" ? "is-active" : ""}
                onClick={() => setStatusFilter("all")}
              >
                全部 ({projects.length})
              </button>
              <button
                type="button"
                className={statusFilter === "active" ? "is-active" : ""}
                onClick={() => setStatusFilter("active")}
              >
                <span className="project-status-dot active" />
                进行中 ({projects.filter((p) => p.status === "active").length})
              </button>
              <button
                type="button"
                className={statusFilter === "planning" ? "is-active" : ""}
                onClick={() => setStatusFilter("planning")}
              >
                <span className="project-status-dot planning" />
                规划中 ({projects.filter((p) => p.status === "planning").length})
              </button>
              <button
                type="button"
                className={statusFilter === "paused" ? "is-active" : ""}
                onClick={() => setStatusFilter("paused")}
              >
                <span className="project-status-dot paused" />
                已暂停 ({projects.filter((p) => p.status === "paused").length})
              </button>
              <button
                type="button"
                className={statusFilter === "completed" ? "is-active" : ""}
                onClick={() => setStatusFilter("completed")}
              >
                <span className="project-status-dot completed" />
                已完成 ({projects.filter((p) => p.status === "completed").length})
              </button>
              <button
                type="button"
                className={statusFilter === "favorite" ? "is-active" : ""}
                onClick={() => setStatusFilter("favorite")}
              >
                ★ 收藏 ({projects.filter((p) => p.favorite).length})
              </button>
            </div>

            <div className="projects-sub-controls">
              <div className="projects-search-input-wrap">
                <span className="search-icon">🔍</span>
                <TextField
                  type="text"
                  placeholder="搜索项目名称、描述或标签..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setSearchQuery("")}
                    title="清空搜索"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="projects-sort-wrap">
                <span className="sort-label">排序:</span>
                <SelectField
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as ProjectSortOption)}
                >
                  <option value="updated">最近更新</option>
                  <option value="progress-desc">进度从高到低</option>
                  <option value="progress-asc">进度从低到高</option>
                  <option value="tasks">待办任务多优先</option>
                  <option value="name">项目名称 (A-Z)</option>
                </SelectField>
              </div>
            </div>
          </div>

          {/* Project Grid */}
          <div className="project-grid">
            {filteredProjects.length === 0 ? (
              <EmptyState size="large" className="project-empty">
                <div className="large-empty-icon">◆</div>
                <h3>
                  {searchQuery || statusFilter !== "all"
                    ? "未找到符合条件的项目"
                    : "从一个项目开始"}
                </h3>
                <p>
                  {searchQuery || statusFilter !== "all"
                    ? "尝试调整搜索关键词或状态筛选条件。"
                    : "项目会成为任务和笔记的共同上下文，帮助你保持全局视野。"}
                </p>
                {searchQuery || statusFilter !== "all" ? (
                  <Button variant="secondary"
                   
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                  >
                    重置筛选条件
                  </Button>
                ) : (
                  <Button variant="primary"
                   
                    onClick={() => onCreate("project")}
                  >
                    创建第一个项目
                  </Button>
                )}
              </EmptyState>
            ) : (
              filteredProjects.map((project) => {
                const stats = calculateProjectTaskStats(tasks, project.id);
                const isSelected = project.id === selectedId;
                return (
                  <div
                    className={`project-card ${isSelected ? "is-selected" : ""}`}
                    key={project.id}
                    onClick={() => handleSelectProject(project.id)}
                  >
                    <div className="project-card-top">
                      <span className={`project-status-dot ${project.status}`} />
                      <span className="project-status-text">
                        {projectStatusLabel[project.status]}
                      </span>

                      <button
                        type="button"
                        className={`project-card-fav ${project.favorite ? "is-fav" : ""}`}
                        title={project.favorite ? "取消收藏" : "加入收藏"}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onToggleFavorite) onToggleFavorite(project);
                          else onUpdate({ ...project, favorite: !project.favorite });
                        }}
                      >
                        {project.favorite ? "★" : "☆"}
                      </button>
                    </div>

                    <h3 className="project-card-title">{project.name}</h3>

                    <p className="project-card-desc">
                      {project.description || "暂无项目描述"}
                    </p>

                    {/* Tag Chips */}
                    {project.tags.length > 0 && (
                      <div className="project-card-tags">
                        {project.tags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="project-tag-pill">
                            #{tag}
                          </span>
                        ))}
                        {project.tags.length > 3 && (
                          <span className="project-tag-more">
                            +{project.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="project-card-bottom">
                      <span className="project-task-summary">
                        {stats.total > 0 ? (
                          <>
                            <strong>{stats.todo}</strong> 个待办 ·{" "}
                            <span className="muted">{stats.done} 已完成</span>
                          </>
                        ) : (
                          <span className="muted">无关联任务</span>
                        )}
                      </span>
                      <strong className="project-progress-pct">
                        {project.progress}%
                      </strong>
                    </div>

                    <div className="progress-track">
                      <span
                        className={`progress-fill ${project.status}`}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>

                    <div className="project-card-footer">
                      <time>更新于 {formatRelative(project.updatedAt)}</time>
                      <span className="project-notes-count">
                        ▤ {notes.filter((n) => n.projectId === project.id).length} 篇笔记
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Project Detail & Editor Panel */}
        <section className="project-detail-panel">
          {selected ? (
            <ProjectDetail
              key={selected.id}
              project={selected}
              tasks={tasks}
              notes={notes}
              onUpdate={onUpdate}
              onToggleFavorite={onToggleFavorite}
              onArchive={onArchive}
              onMoveSpace={onMoveSpace}
              onDelete={async () => setDeleteConfirmProject(selected)}
              onToggleTask={onToggleTask}
              onOpenTask={onOpenTask}
              onOpenNote={onOpenNote}
              onCreateTaskForProject={onCreateTaskForProject}
              onCreateNoteForProject={onCreateNoteForProject}
              onDirtyChange={setIsEditorDirty}
              registerSaveTrigger={(fn) => {
                saveTriggerRef.current = fn;
              }}
            />
          ) : (
            <EmptyState size="placeholder" className="project-detail-placeholder">
              <div className="placeholder-glyph">◆</div>
              <h3>选择一个项目</h3>
              <p>查看与管理项目进度、关联任务和关联笔记。</p>
              <Button variant="primary"
               
                onClick={() => onCreate("project")}
              >
                ＋ 新建项目
              </Button>
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// ProjectDetail Editor Component
// ----------------------------------------------------------------------

interface ProjectDetailProps {
  project: Project;
  tasks: Task[];
  notes: Note[];
  onUpdate: (project: Project) => void;
  onToggleFavorite?: (project: Project) => void;
  onArchive: (project: Project) => void;
  onMoveSpace: (project: Project, space: ContentSpace) => void | Promise<unknown>;
  onDelete: () => Promise<void>;
  onToggleTask?: (task: Task) => void;
  onOpenTask?: (id: string) => void;
  onOpenNote?: (id: string) => void;
  onCreateTaskForProject?: (
    title: string,
    projectId: string,
    space: Exclude<Space, "all">
  ) => Promise<void>;
  onCreateNoteForProject?: (
    title: string,
    projectId: string,
    space: Exclude<Space, "all">
  ) => Promise<void>;
  onDirtyChange: (isDirty: boolean) => void;
  registerSaveTrigger: (fn: () => void) => void;
}

function ProjectDetail({
  project,
  tasks,
  notes,
  onUpdate,
  onToggleFavorite,
  onArchive,
  onMoveSpace,
  onDelete,
  onToggleTask,
  onOpenTask,
  onOpenNote,
  onCreateTaskForProject,
  onCreateNoteForProject,
  onDirtyChange,
  registerSaveTrigger,
}: ProjectDetailProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState(project.status);
  const [progress, setProgress] = useState(project.progress);
  const [tags, setTags] = useState(project.tags.join(" "));
  const [favorite, setFavorite] = useState(project.favorite);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [taskFilter, setTaskFilter] = useState<"all" | "todo" | "done">("all");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "just-saved">("saved");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Compare draft with saved project
  const isDirty = useMemo(() => {
    return (
      name !== project.name ||
      description !== project.description ||
      status !== project.status ||
      progress !== project.progress ||
      tags !== project.tags.join(" ") ||
      favorite !== project.favorite
    );
  }, [name, description, status, progress, tags, favorite, project]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2200);
  }, []);

  const save = useCallback(() => {
    setSaveStatus("saving");
    onUpdate({
      ...project,
      name: name.trim() || project.name,
      description,
      status,
      progress,
      tags: parseTags(tags),
      favorite,
    });
    setSaveStatus("just-saved");
    showToast("✓ 项目已保存");
    setTimeout(() => setSaveStatus("saved"), 1800);
  }, [project, name, description, status, progress, tags, favorite, onUpdate, showToast]);

  useEffect(() => {
    registerSaveTrigger(save);
  }, [save, registerSaveTrigger]);

  // Keyboard shortcut Ctrl+S / Cmd+S
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;
    if (modifier && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  };

  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const projectNotes = notes.filter((note) => note.projectId === project.id);
  const taskStats = calculateProjectTaskStats(tasks, project.id);

  // Smart action: Auto calculate progress from task completion rate
  const handleAutoCalculateProgress = () => {
    if (projectTasks.length === 0) {
      showToast("当前项目暂无任务，无法自动计算");
      return;
    }
    const autoProgress = taskStats.percentage;
    setProgress(autoProgress);
    if (autoProgress === 100 && status !== "completed") {
      setStatus("completed");
      showToast("✓ 所有任务已完成，自动更新进度为 100% 并设为已完成");
    } else {
      showToast(`✓ 已根据任务完成率同步进度至 ${autoProgress}%`);
    }
  };

  // Add tag
  const handleRemoveTag = (tagToRemove: string) => {
    const nextTags = parseTags(tags).filter((t) => t !== tagToRemove);
    setTags(nextTags.join(" "));
  };

  // Quick add task
  const handleQuickAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    if (onCreateTaskForProject) {
      await onCreateTaskForProject(newTaskTitle.trim(), project.id, project.space);
      setNewTaskTitle("");
      showToast("✓ 已添加任务到本项目");
    }
  };

  // Quick add note
  const handleQuickAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim()) return;
    if (onCreateNoteForProject) {
      await onCreateNoteForProject(newNoteTitle.trim(), project.id, project.space);
      setNewNoteTitle("");
      showToast("✓ 已创建项目笔记");
    }
  };

  // Discard edits
  const handleDiscard = () => {
    setName(project.name);
    setDescription(project.description);
    setStatus(project.status);
    setProgress(project.progress);
    setTags(project.tags.join(" "));
    setFavorite(project.favorite);
    showToast("已撤销当前未保存的修改");
  };

  // Filter tasks in list
  const visibleTasks = projectTasks.filter((t) => {
    if (taskFilter === "todo") return t.status !== "done";
    if (taskFilter === "done") return t.status === "done";
    return true;
  });

  return (
    <aside className="project-detail" onKeyDown={handleKeyDown}>
      {/* Detail Header & Action Controls */}
      <div className="detail-heading">
        <div className="detail-status-indicator">
          <span className={`project-status-dot ${status}`} />
          <span className="detail-status-name">{projectStatusLabel[status]}</span>
          {isDirty ? (
            <span className="save-status-pill is-dirty">● 未保存修改</span>
          ) : (
            <span className="save-status-pill is-saved">✓ 已保存</span>
          )}
        </div>

        <div className="editor-actions">
          <SpaceMoveButton
            space={project.space}
            onMove={(nextSpace) =>
              onMoveSpace(
                {
                  ...project,
                  name: name.trim() || project.name,
                  description,
                  status,
                  progress,
                  tags: parseTags(tags),
                  favorite,
                },
                nextSpace,
              )
            }
          />
          <Button variant="subtle" size="small" className={favorite ? "is-fav" : ""}
           
            onClick={() => {
              const nextFav = !favorite;
              setFavorite(nextFav);
              if (onToggleFavorite) onToggleFavorite({ ...project, favorite: nextFav });
            }}
            title={favorite ? "取消收藏" : "加入收藏"}
          >
            {favorite ? "★ 收藏" : "☆ 收藏"}
          </Button>
          <Button variant="subtle" size="small"
           
            onClick={() => onArchive(project)}
            title={project.archived ? "取消归档" : "归档项目"}
          >
            {project.archived ? "取消归档" : "归档"}
          </Button>
          <Button variant="danger" size="small"
           
            onClick={onDelete}
            title="删除项目"
          >
            删除
          </Button>
          {isDirty && (
            <Button variant="subtle" size="small"
             
              onClick={handleDiscard}
              title="放弃修改"
            >
              重置
            </Button>
          )}
          <Button variant="primary" className={`compact ${isDirty ? "highlight-pulse" : ""}`}
           
            onClick={save}
            title="保存项目 (Ctrl+S / Cmd+S)"
          >
            {saveStatus === "saving" ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="project-toast-banner">{toastMessage}</div>
      )}

      {/* Project Name Field */}
      <label className="detail-label">
        项目名称
        <TextField
          className="project-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：重构移动端应用"
        />
      </label>

      {/* Status & Quick Progress Fields */}
      <div className="form-grid detail-fields">
        <label>
          项目状态
          <SelectField
            value={status}
            onChange={(e) => setStatus(e.target.value as Project["status"])}
          >
            <option value="planning">规划中</option>
            <option value="active">进行中</option>
            <option value="paused">已暂停</option>
            <option value="completed">已完成</option>
            <option value="archived">已归档</option>
          </SelectField>
        </label>

        <label>
          完成进度 (%)
          <TextField
            type="number"
            min="0"
            max="100"
            value={progress}
            onChange={(e) =>
              setProgress(Math.max(0, Math.min(100, Number(e.target.value))))
            }
          />
        </label>
      </div>

      {/* Interactive Progress Bar & Presets */}
      <div className="detail-progress-section">
        <div className="detail-progress-info">
          <span>项目整体进度</span>
          <strong className="progress-value">{progress}%</strong>
        </div>

        <div className="progress-track large">
          <span
            className={`progress-fill ${status}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="progress-range-slider"
          title="拖动调整进度"
        />

        <div className="progress-presets-row">
          <div className="preset-buttons">
            {[0, 25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                className={`preset-btn ${progress === pct ? "is-active" : ""}`}
                onClick={() => setProgress(pct)}
              >
                {pct}%
              </button>
            ))}
          </div>

          {projectTasks.length > 0 && (
            <button
              type="button"
              className="auto-calc-btn"
              onClick={handleAutoCalculateProgress}
              title={`根据已完成 ${taskStats.done}/${taskStats.total} 自动设为 ${taskStats.percentage}%`}
            >
              ✨ 按任务计算 ({taskStats.percentage}%)
            </button>
          )}
        </div>
      </div>

      {/* Description Field */}
      <label className="detail-label">
        项目描述与目标
        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="说明该项目的目标、范围和里程碑..."
        />
      </label>

      {/* Tags Section */}
      <label className="detail-label">
        标签
        <TextField
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="#设计  #核心功能  #v1.0"
        />
      </label>
      {parseTags(tags).length > 0 && (
        <div className="detail-tags-chips">
          {parseTags(tags).map((t, idx) => (
            <span key={idx} className="tag-chip">
              #{t}
              <button
                type="button"
                className="remove-chip-btn"
                onClick={() => handleRemoveTag(t)}
                title="移除标签"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Associated Tasks Section */}
      <div className="detail-section">
        <div className="detail-section-heading">
          <div className="detail-section-title-wrap">
            <strong>关联任务</strong>
            <span className="task-stats-badge">
              {taskStats.done}/{taskStats.total}
            </span>
          </div>

          <div className="task-filter-pills">
            <button
              type="button"
              className={taskFilter === "all" ? "is-active" : ""}
              onClick={() => setTaskFilter("all")}
            >
              全部
            </button>
            <button
              type="button"
              className={taskFilter === "todo" ? "is-active" : ""}
              onClick={() => setTaskFilter("todo")}
            >
              待办 ({taskStats.todo})
            </button>
            <button
              type="button"
              className={taskFilter === "done" ? "is-active" : ""}
              onClick={() => setTaskFilter("done")}
            >
              完成 ({taskStats.done})
            </button>
          </div>
        </div>

        {/* Quick Add Task Input */}
        {onCreateTaskForProject && (
          <form className="quick-add-form" onSubmit={handleQuickAddTask}>
            <TextField
              type="text"
              placeholder="＋ 添加新任务到此项目 (按 Enter 创建)..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
          </form>
        )}

        <div className="detail-tasks-list">
          {visibleTasks.map((task) => (
            <div className="detail-task-row" key={task.id}>
              <button
                type="button"
                className={`task-check-circle ${task.status === "done" ? "is-done" : ""}`}
                onClick={() => onToggleTask?.(task)}
                title={task.status === "done" ? "标记为未完成" : "标记为已完成"}
              >
                <CheckIcon mini />
              </button>

              <span
                className={`task-title-text ${task.status === "done" ? "is-strikethrough" : ""}`}
              >
                {task.title}
              </span>

              {task.priority && task.priority !== "normal" && (
                <span className={`priority-mini-pill ${task.priority}`}>
                  {priorityLabel[task.priority]}
                </span>
              )}

              {onOpenTask && (
                <button
                  type="button"
                  className="jump-btn"
                  onClick={() => onOpenTask(task.id)}
                  title="在任务页面打开查看"
                >
                  ↗
                </button>
              )}
            </div>
          ))}

          {visibleTasks.length === 0 && (
            <p className="detail-empty-text">
              {projectTasks.length === 0
                ? "还没有关联任务，在上方快速添加一条吧。"
                : "没有符合条件的任务。"}
            </p>
          )}
        </div>
      </div>

      {/* Associated Notes Section */}
      <div className="detail-section">
        <div className="detail-section-heading">
          <div className="detail-section-title-wrap">
            <strong>项目笔记</strong>
            <span className="task-stats-badge">{projectNotes.length} 篇</span>
          </div>
        </div>

        {/* Quick Add Note Input */}
        {onCreateNoteForProject && (
          <form className="quick-add-form" onSubmit={handleQuickAddNote}>
            <TextField
              type="text"
              placeholder="＋ 为此项目记录新笔记 (按 Enter 创建)..."
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
            />
          </form>
        )}

        <div className="detail-notes-list">
          {projectNotes.map((note) => (
            <div
              className="detail-note-row"
              key={note.id}
              onClick={() => onOpenNote?.(note.id)}
              title="点击在笔记页面打开"
            >
              <span className="note-symbol">▤</span>
              <div className="note-row-copy">
                <strong>{note.title || "无标题笔记"}</strong>
                <small>
                  {note.content.replace(/[#>*`\n]/g, " ").slice(0, 48) || "暂无正文"}
                </small>
              </div>
              <time>{formatRelative(note.updatedAt)}</time>
              {onOpenNote && <span className="jump-symbol">↗</span>}
            </div>
          ))}

          {projectNotes.length === 0 && (
            <p className="detail-empty-text">
              还没有关联笔记，在上方输入标题快速创建。
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
