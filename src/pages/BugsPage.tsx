import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { Button, DialogLayer, EmptyState, Field, SelectField, TextArea, TextField } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import { api, type BugDraftInput } from "../lib/api";
import { bugPriorityLabels, bugSeverityLabels, bugStatusLabels, calculateBugStats, filterAndSortBugs, isBugOverdue } from "../lib/bugs";
import { todayKey } from "../lib/format";
import type { Bug, BugActivity, BugDraft, BugExport, BugImportPreview, BugImportPreviewInput, BugPriority, BugQuery, BugResolution, BugResolutionReason, BugSeverity, BugSortField, BugStatus, ContentSpace, Project, Space } from "../types";
import "../styles/bugs.css";

interface BugsPageProps {
  space: Space;
  createSpace: ContentSpace;
  bugs: Bug[];
  projects: Project[];
  selectedId: string | null;
  initialProjectId?: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: () => Promise<void>;
  onNotify?: (message: string) => void;
}

const statusOptions: BugStatus[] = ["todo", "in_progress", "blocked", "pending_verification", "deferred", "done", "cancelled"];
const statusOptionsFor = (bug: Bug): BugStatus[] => bug.status === "done" ? ["in_progress"] : bug.status === "cancelled" ? ["todo"] : statusOptions;

type EditorValues = {
  title: string; description: string; notes: string; environment: string;
  priority: BugPriority; severity: BugSeverity; bugDate: string; dueDate: string; completedDate: string;
  projectId: string; module: string; version: string; assignee: string; reporter: string; tags: string;
};

type BulkBugOperation =
  | { kind: "status"; status: BugStatus; message: string; completedDate: string; resolutionReason: BugResolutionReason }
  | { kind: "priority"; priority: BugPriority }
  | { kind: "assignee"; assignee: string }
  | { kind: "project"; projectId: string | null }
  | { kind: "due_date"; dueDate: string | null }
  | { kind: "tags"; mode: "append" | "remove" | "replace"; tags: string[] }
  | { kind: "delete" };

type BulkBugFailure = { id: string; title: string; error: string };
type BulkBugResult = { successCount: number; failures: BulkBugFailure[] };

function blankEditor(): EditorValues {
  return { title: "", description: "", notes: "", environment: "", priority: "p2", severity: "s2", bugDate: todayKey(), dueDate: "", completedDate: "", projectId: "", module: "", version: "", assignee: "", reporter: "", tags: "" };
}

function editorForBug(bug: Bug): EditorValues {
  return { title: bug.title, description: bug.description, notes: bug.notes, environment: bug.environment, priority: bug.priority, severity: bug.severity, bugDate: bug.bugDate, dueDate: bug.dueDate ?? "", completedDate: bug.completedDate ?? "", projectId: bug.projectId ?? "", module: bug.module, version: bug.version, assignee: bug.assignee, reporter: bug.reporter, tags: bug.tags.join(", ") };
}

function draftFromValues(values: EditorValues, space: ContentSpace): BugDraftInput {
  return {
    title: values.title.trim(), space, description: values.description.trim(), notes: values.notes.trim(), environment: values.environment.trim(),
    priority: values.priority, severity: values.severity, bugDate: values.bugDate, dueDate: values.dueDate || null, completedDate: values.completedDate || null,
    projectId: values.projectId || null, module: values.module.trim(), version: values.version.trim(), assignee: values.assignee.trim(), reporter: values.reporter.trim(),
    tags: values.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
  };
}

export function BugsPage({ space, createSpace, bugs, projects, selectedId, initialProjectId, onSelect, onRefresh, onNotify }: BugsPageProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState("");
  const [severity, setSeverity] = useState("");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [assignee, setAssignee] = useState("");
  const [tag, setTag] = useState("");
  const [module, setModule] = useState("");
  const [version, setVersion] = useState("");
  const [dateField, setDateField] = useState<"bug_date" | "due_date" | "completed_date" | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<BugSortField>("default");
  const [descending, setDescending] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTargetIds, setBulkTargetIds] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBug, setEditingBug] = useState<Bug | null>(null);
  const [transition, setTransition] = useState<{ bug: Bug; status: BugStatus } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const today = todayKey();
  const scopedBugs = useMemo(() => bugs.filter((bug) => space === "all" || bug.space === space), [bugs, space]);
  const activeBugs = scopedBugs.filter((bug) => !bug.archived);
  const stats = calculateBugStats(activeBugs, today);
  const query = useMemo<BugQuery>(() => ({
    search, statuses: status === "active" ? ["todo", "in_progress", "blocked", "pending_verification", "deferred"] : status === "all" ? [] : [status as BugStatus],
    priority: (priority || null) as BugPriority | null, severity: (severity || null) as BugSeverity | null,
    projectId: projectId || null, module: module || null, version: version || null, assignee: assignee || null, tag: tag || null,
    dateField: dateField || null, dateFrom: dateFrom || null, dateTo: dateTo || null, sortBy, descending, includeArchived: showArchived,
  }), [assignee, dateField, dateFrom, dateTo, descending, module, priority, projectId, search, severity, showArchived, sortBy, status, tag, version]);
  const visible = useMemo(() => filterAndSortBugs(scopedBugs, query, today), [query, scopedBugs, today]);
  const selectedBug = scopedBugs.find((bug) => bug.id === selectedId) ?? null;
  const bulkTargets = scopedBugs.filter((bug) => bulkTargetIds.includes(bug.id));
  const availableProjects = projects.filter((project) => !project.archived && (space === "all" || project.space === space));

  useEffect(() => { setProjectId(initialProjectId ?? ""); }, [initialProjectId]);
  useEffect(() => { setSelectedRows([]); }, [space, search, status, priority, severity, projectId, assignee, tag, module, version, dateField, dateFrom, dateTo, showArchived]);

  const run = async (action: () => Promise<unknown>, successMessage?: string) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await onRefresh();
      if (successMessage) onNotify?.(successMessage);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => { setEditingBug(null); setEditorOpen(true); };
  const openEdit = (bug: Bug) => { setEditingBug(bug); setEditorOpen(true); };
  const saveEditor = async (values: EditorValues) => {
    setBusy(true);
    setError("");
    try {
      if (editingBug) {
        await api.updateBug({ ...editingBug, ...draftFromValues(values, editingBug.space) }, editingBug.revision);
        onNotify?.("BUG 已更新");
      } else {
        await api.createBug({ ...draftFromValues(values, createSpace), status: "todo" });
        onNotify?.("BUG 已创建");
      }
      setEditorOpen(false);
      await onRefresh();
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const handleTransition = async (status: BugStatus, message: string, completedDate: string, resolution: BugResolution | null) => {
    if (!transition) return;
    await run(async () => {
      const updated = await api.changeBugStatus(transition.bug.id, {
        status, message, completedDate: status === "done" ? completedDate : null,
        resolution: status === "cancelled" ? resolution : null, expectedRevision: transition.bug.revision,
      });
      setTransition(null);
      onSelect(updated.id);
    }, `状态已更新为「${bugStatusLabels[status]}」`);
  };

  const toggleRow = (id: string) => setSelectedRows((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleVisibleRows = () => setSelectedRows((current) => {
    const visibleIds = visible.map((bug) => bug.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => current.includes(id));
    return allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])];
  });
  const openBulkEditor = () => {
    setBulkTargetIds([...selectedRows]);
    setBulkOpen(true);
  };
  const applyBulkOperation = async (operation: BulkBugOperation, targetIds: string[]): Promise<BulkBugResult> => {
    setBusy(true);
    try {
      const targets = scopedBugs.filter((bug) => targetIds.includes(bug.id));
      const results = await Promise.all(targets.map(async (bug): Promise<{ id: string; title: string; error: string | null }> => {
      try {
        if (operation.kind === "delete") {
          await api.deleteBug(bug.id);
        } else if (operation.kind === "status") {
          await api.changeBugStatus(bug.id, {
            status: operation.status,
            message: operation.message,
            completedDate: operation.status === "done" ? operation.completedDate : null,
            resolution: operation.status === "cancelled"
              ? { reason: operation.resolutionReason, note: operation.message, duplicateOfId: null, duplicateCode: null, duplicateTitle: null }
              : null,
            expectedRevision: bug.revision,
          });
        } else {
          let updates: Partial<Bug>;
          if (operation.kind === "priority") updates = { priority: operation.priority };
          else if (operation.kind === "assignee") updates = { assignee: operation.assignee };
          else if (operation.kind === "project") {
            const project = operation.projectId ? projects.find((item) => item.id === operation.projectId) : null;
            if (project && project.space !== bug.space) throw new Error("所选项目不属于此 BUG 的空间");
            updates = { projectId: operation.projectId };
          } else if (operation.kind === "due_date") updates = { dueDate: operation.dueDate };
          else {
            const current = new Set(bug.tags);
            const incoming = new Set(operation.tags);
            const tags = operation.mode === "replace"
              ? [...incoming]
              : operation.mode === "append"
                ? [...current, ...incoming]
                : [...current].filter((tag) => !incoming.has(tag));
            updates = { tags };
          }
          await api.updateBug({ ...bug, ...updates }, bug.revision);
        }
        return { id: bug.id, title: bug.title, error: null };
      } catch (cause) {
        return { id: bug.id, title: bug.title, error: errorMessage(cause) };
      }
      }));
      const failures = results.filter((result) => result.error).map((result) => ({ id: result.id, title: result.title, error: result.error as string }));
      const successCount = results.length - failures.length;
      setBulkTargetIds(failures.map((failure) => failure.id));
      setSelectedRows(failures.map((failure) => failure.id));
      try {
        await onRefresh();
      } catch (cause) {
        setError("批量操作已提交，但列表刷新失败：" + errorMessage(cause));
      }
      if (failures.length) {
        setError("批量操作完成：" + successCount + " 条成功，" + failures.length + " 条失败。可在弹窗中查看原因并重试失败项。");
      } else {
        setBulkOpen(false);
        onNotify?.(operation.kind === "delete" ? "已将 " + successCount + " 条 BUG 移至回收站" : "已更新 " + successCount + " 条 BUG");
      }
      return { successCount, failures };
    } finally {
      setBusy(false);
    }
  };
  const clearFilters = () => { setSearch(""); setStatus("active"); setPriority(""); setSeverity(""); setProjectId(""); setAssignee(""); setTag(""); setModule(""); setVersion(""); setDateField(""); setDateFrom(""); setDateTo(""); setShowArchived(false); };
  const bulkArchive = async () => {
    const ids = [...selectedRows];
    setBusy(true); setError("");
    const results = await Promise.allSettled(ids.map((id) => api.archiveBug(id, true)));
    const failed = results.filter((result) => result.status === "rejected");
    setSelectedRows([]);
    await onRefresh();
    setBusy(false);
    if (failed.length) setError(`${ids.length - failed.length} 条已归档，${failed.length} 条失败：${errorMessage((failed[0] as PromiseRejectedResult).reason)}`);
    else onNotify?.(`已归档 ${ids.length} 条 BUG`);
  };

  return <div className="page-stack bugs-page">
    <PageHeader eyebrow={space === "all" ? "个人与工作空间" : space === "personal" ? "个人空间" : "工作空间"} title="BUG 任务" description="记录、跟踪和复盘缺陷；状态变更与处理记录会保存在每条 BUG 的活动历史中。" action={<>
      <Button variant="secondary" onClick={() => setImportOpen(true)}>⇩ 导入文本</Button>
      <Button variant="secondary" onClick={() => setExportOpen(true)}>⇧ 导出 Markdown</Button>
      <Button variant="primary" onClick={openCreate}>＋ 新建 BUG</Button>
    </>} />

    {error ? <div className="bug-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="关闭错误">×</button></div> : null}

    <section className="bug-stat-grid" aria-label="BUG 统计">
      <button className="bug-stat-card" onClick={() => setStatus("active")}><span>未关闭</span><strong>{stats.todo + stats.inProgress + stats.blocked + stats.pendingVerification + stats.deferred}</strong><small>全部未结束 BUG</small></button>
      <button className="bug-stat-card" onClick={() => setStatus("blocked")}><span>已阻塞</span><strong className={stats.blocked ? "is-warning" : ""}>{stats.blocked}</strong><small>需要排除阻碍</small></button>
      <button className="bug-stat-card" onClick={() => setStatus("pending_verification")}><span>待验证</span><strong>{stats.pendingVerification}</strong><small>修复后待确认</small></button>
      <button className="bug-stat-card" onClick={() => setStatus("done")}><span>已完成</span><strong className="is-good">{stats.completed}</strong><small>{stats.total === stats.cancelled ? "—" : `${stats.completionRate}% 完成率`}</small></button>
      <button className="bug-stat-card" onClick={() => setStatus("active")}><span>今日到期</span><strong>{stats.dueToday}</strong><small>仍待处理</small></button>
      <button className="bug-stat-card" onClick={() => setStatus("active")}><span>已逾期</span><strong className={stats.overdue ? "is-danger" : ""}>{stats.overdue}</strong><small>未完成且超过截止日</small></button>
    </section>

    <section className="list-panel bug-list-panel">
      <div className="bug-toolbar">
        <div className="bug-search-field"><span aria-hidden="true">⌕</span><TextField aria-label="搜索 BUG" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索编号、标题、描述、备注、负责人或标签" /></div>
        <label><span>状态</span><SelectField aria-label="按状态筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">所有未结束</option><option value="all">全部状态</option>{statusOptions.map((value) => <option key={value} value={value}>{bugStatusLabels[value]}</option>)}</SelectField></label>
        <label><span>优先级</span><SelectField aria-label="按优先级筛选" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">全部</option>{Object.entries(bugPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></label>
        <label><span>严重度</span><SelectField aria-label="按严重度筛选" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">全部</option>{Object.entries(bugSeverityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></label>
        <label><span>项目</span><SelectField aria-label="按项目筛选" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">全部项目</option><option value="none">未关联项目</option>{availableProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</SelectField></label>
        <label><span>模块</span><TextField aria-label="按模块筛选" value={module} onChange={(event) => setModule(event.target.value)} placeholder="模块" /></label>
        <label><span>版本</span><TextField aria-label="按版本筛选" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="版本" /></label>
        <label><span>负责人</span><TextField aria-label="按负责人筛选" value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="负责人" /></label>
        <label><span>标签</span><TextField aria-label="按标签筛选" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="标签" /></label>
        <label><span>日期字段</span><SelectField aria-label="日期范围字段" value={dateField} onChange={(event) => setDateField(event.target.value as typeof dateField)}><option value="">不按日期筛选</option><option value="bug_date">BUG 日期</option><option value="due_date">截止日期</option><option value="completed_date">完成日期</option></SelectField></label>
        <label><span>起始日期</span><TextField aria-label="筛选开始日期" type="date" value={dateFrom} disabled={!dateField} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>结束日期</span><TextField aria-label="筛选结束日期" type="date" value={dateTo} disabled={!dateField} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label><span>排序</span><SelectField aria-label="BUG 排序" value={`${sortBy}:${descending ? "desc" : "asc"}`} onChange={(event) => { const [field, direction] = event.target.value.split(":"); setSortBy(field as BugSortField); setDescending(direction === "desc"); }}><option value="default:asc">推荐排序</option><option value="bug_date:desc">BUG 日期：新到旧</option><option value="due_date:asc">截止日期：近到远</option><option value="due_date:desc">截止日期：远到近</option><option value="priority:asc">优先级：高到低</option><option value="severity:asc">严重度：高到低</option><option value="updated_at:desc">最近更新</option><option value="title:asc">标题：A 到 Z</option></SelectField></label>
      </div>
      <div className="bug-list-meta">
        <div><strong>{visible.length}</strong> 条结果{selectedRows.length ? <span className="bug-selected-count"> · 已选 {selectedRows.length} 条</span> : null}
          <label className="bug-archived-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); setSelectedRows([]); }} />包含已归档</label>
        </div>
        <div className="bug-list-actions">{selectedRows.length ? <><Button size="small" variant="subtle" onClick={() => setSelectedRows([])}>清除选择</Button><Button size="small" variant="secondary" onClick={() => setExportOpen(true)}>导出所选</Button><Button size="small" variant="secondary" disabled={busy} onClick={openBulkEditor}>批量编辑</Button><Button size="small" variant="secondary" disabled={busy} onClick={() => void bulkArchive()}>批量归档</Button></> : null}<Button size="small" variant="subtle" onClick={clearFilters}>清除筛选</Button></div>
      </div>
      {visible.length === 0 ? <EmptyState size="large"><div className="large-empty-icon">⌁</div><h3>{scopedBugs.length === 0 ? "还没有 BUG 记录" : "没有符合条件的 BUG"}</h3><p>{scopedBugs.length === 0 ? "可以逐条新建，也可以粘贴多行文本批量导入。" : "调整筛选条件，或清除筛选查看其他记录。"}</p>{scopedBugs.length === 0 ? <div className="bug-empty-actions"><Button variant="secondary" onClick={() => setImportOpen(true)}>导入 BUG</Button><Button variant="primary" onClick={openCreate}>新建第一条 BUG</Button></div> : null}</EmptyState> : <div className="bug-table-wrap"><table className="bug-table"><thead><tr><th className="bug-check-col"><input aria-label="选择当前筛选结果" type="checkbox" checked={visible.length > 0 && visible.every((bug) => selectedRows.includes(bug.id))} onChange={toggleVisibleRows} /></th><th>BUG</th><th>状态</th><th>优先级 / 严重度</th><th>负责人</th><th>BUG 日期</th><th>截止日期</th><th>处理</th></tr></thead><tbody>{visible.map((bug) => {
        const overdue = isBugOverdue(bug, today);
        return <tr key={bug.id} className={`${bug.archived ? "is-archived" : ""} ${overdue ? "is-overdue" : ""}`}>
          <td><input aria-label={`选择 ${bug.code}`} type="checkbox" checked={selectedRows.includes(bug.id)} onChange={() => toggleRow(bug.id)} /></td>
          <td><button type="button" className="bug-row-title" onClick={() => onSelect(bug.id)}><span className="bug-code">{bug.code}</span><strong>{bug.title}</strong><small>{[bug.module, bug.version, bug.projectId ? availableProjects.find((item) => item.id === bug.projectId)?.name : ""].filter(Boolean).join(" · ") || bug.description.slice(0, 72) || "无补充描述"}</small></button></td>
          <td><span className={`bug-status-pill status-${bug.status}`}>{bugStatusLabels[bug.status]}</span>{bug.archived ? <span className="bug-archived-label">已归档</span> : null}</td>
          <td><span className={`bug-priority-chip priority-${bug.priority}`}>{bugPriorityLabels[bug.priority]}</span><small className="bug-severity-label">{bugSeverityLabels[bug.severity]}</small></td>
          <td>{bug.assignee || <span className="muted">未分配</span>}</td>
          <td>{bug.bugDate}</td>
          <td className={overdue ? "bug-date-overdue" : ""}>{bug.dueDate || <span className="muted">—</span>}{bug.completedDate ? <small className="bug-completion-date">完成 {bug.completedDate}</small> : null}</td>
          <td><button type="button" className="bug-action-link" disabled={busy} onClick={() => setTransition({ bug, status: bug.status === "done" ? "in_progress" : bug.status === "cancelled" ? "todo" : "done" })}>{bug.status === "done" ? "重新打开" : bug.status === "cancelled" ? "重新激活" : "变更状态"}</button></td>
        </tr>;
      })}</tbody></table></div>}
    </section>

    {selectedBug ? <BugDetailsDialog bug={selectedBug} projects={availableProjects} busy={busy} error={error} onClose={() => onSelect(null)} onEdit={() => openEdit(selectedBug)} onTransition={(next) => { setError(""); setTransition({ bug: selectedBug, status: next }); }} onComment={(message) => run(() => api.appendBugComment(selectedBug.id, { message, expectedRevision: selectedBug.revision }), "处理记录已添加")} onArchive={() => run(() => api.archiveBug(selectedBug.id, !selectedBug.archived), selectedBug.archived ? "BUG 已恢复" : "BUG 已归档")} onDelete={() => run(() => api.deleteBug(selectedBug.id), "BUG 已移至回收站")} onFavorite={() => run(() => api.updateBug({ ...selectedBug, favorite: !selectedBug.favorite }, selectedBug.revision), selectedBug.favorite ? "已取消收藏" : "已收藏 BUG")} onMoveSpace={(nextSpace) => run(() => api.moveBugSpace(selectedBug.id, nextSpace), `已移至${nextSpace === "personal" ? "个人" : "工作"}空间`)} /> : null}
    {editorOpen ? <BugEditorDialog bug={editingBug} projects={availableProjects} space={editingBug?.space ?? createSpace} onClose={() => { if (!busy) setEditorOpen(false); }} onSave={saveEditor} /> : null}
    {transition ? <BugTransitionDialog bug={transition.bug} nextStatus={transition.status} bugs={scopedBugs} busy={busy} error={error} onClose={() => { setTransition(null); setError(""); }} onSave={handleTransition} /> : null}
    {bulkOpen ? <BugBulkEditDialog bugs={bulkTargets} projects={availableProjects} onClose={() => { setBulkOpen(false); setBulkTargetIds([]); }} onApply={applyBulkOperation} /> : null}
    {importOpen ? <BugImportDialog space={createSpace} projects={availableProjects} onClose={() => setImportOpen(false)} onRefresh={onRefresh} onNotify={onNotify} /> : null}
    {exportOpen ? <BugExportDialog space={space} query={query} selectedIds={selectedRows} onClose={() => setExportOpen(false)} /> : null}
  </div>;
}

function BugEditorDialog({ bug, projects, space, onClose, onSave }: { bug: Bug | null; projects: Project[]; space: ContentSpace; onClose: () => void; onSave: (values: EditorValues) => Promise<void> }) {
  const [values, setValues] = useState<EditorValues>(() => bug ? editorForBug(bug) : blankEditor());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof EditorValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!values.title.trim()) { setError("请填写 BUG 标题"); return; }
    if (values.dueDate && values.dueDate < values.bugDate) { setError("截止日期不能早于 BUG 日期"); return; }
    if (bug?.status === "done" && !values.completedDate) { setError("已完成的 BUG 必须填写完成日期"); return; }
    if (bug?.status === "done" && values.completedDate && (values.completedDate < values.bugDate || values.completedDate > todayKey())) { setError("完成日期必须介于 BUG 日期和今天之间"); return; }
    setError(""); setSaving(true);
    try { await onSave(values); } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); }
  };
  return <DialogLayer onClose={onClose} closeOnBackdrop={!saving}><form className="modal-card bug-form-dialog" onSubmit={submit}>
    <header className="bug-dialog-header"><div><span className="eyebrow">{bug ? bug.code : "新建记录"}</span><h2>{bug ? "编辑 BUG" : "新建 BUG"}</h2></div><button type="button" className="dialog-close" onClick={onClose} aria-label="关闭">×</button></header>
    <div className="bug-form-grid">
      <Field label="标题"><TextField autoFocus required maxLength={300} value={values.title} onChange={(event) => set("title", event.target.value)} placeholder="用一句话描述问题" /></Field>
      <div className="bug-form-pair"><Field label="优先级"><SelectField value={values.priority} onChange={(event) => set("priority", event.target.value)}>{Object.entries(bugPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field><Field label="严重度"><SelectField value={values.severity} onChange={(event) => set("severity", event.target.value)}>{Object.entries(bugSeverityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field></div>
      <div className="bug-form-pair"><Field label="BUG 日期"><TextField type="date" required value={values.bugDate} onChange={(event) => set("bugDate", event.target.value)} /></Field><Field label="截止日期"><TextField type="date" value={values.dueDate} min={values.bugDate} onChange={(event) => set("dueDate", event.target.value)} /></Field></div>
      {bug?.status === "done" ? <Field label="完成日期"><TextField type="date" required min={values.bugDate} max={todayKey()} value={values.completedDate} onChange={(event) => set("completedDate", event.target.value)} /></Field> : null}
      <Field label="关联项目"><SelectField value={values.projectId} onChange={(event) => set("projectId", event.target.value)}><option value="">未关联项目</option>{projects.filter((project) => project.space === space).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</SelectField></Field>
      <div className="bug-form-pair"><Field label="模块"><TextField value={values.module} onChange={(event) => set("module", event.target.value)} placeholder="如：登录 / 支付" /></Field><Field label="版本"><TextField value={values.version} onChange={(event) => set("version", event.target.value)} placeholder="如：2.4.0" /></Field></div>
      <div className="bug-form-pair"><Field label="负责人"><TextField value={values.assignee} onChange={(event) => set("assignee", event.target.value)} /></Field><Field label="报告人"><TextField value={values.reporter} onChange={(event) => set("reporter", event.target.value)} /></Field></div>
      <Field label="标签"><TextField value={values.tags} onChange={(event) => set("tags", event.target.value)} placeholder="用逗号分隔多个标签" /></Field>
      <Field label="问题描述"><TextArea rows={4} value={values.description} onChange={(event) => set("description", event.target.value)} placeholder="复现步骤、实际结果和期望结果" /></Field>
      <Field label="环境信息"><TextArea rows={2} value={values.environment} onChange={(event) => set("environment", event.target.value)} placeholder="设备、系统、浏览器或构建版本" /></Field>
      <Field label="备注"><TextArea rows={3} value={values.notes} onChange={(event) => set("notes", event.target.value)} placeholder="补充背景、临时结论或外部链接" /></Field>
    </div>
    {error ? <p className="bug-form-error" role="alert">{error}</p> : null}
    <footer className="bug-dialog-actions"><Button variant="secondary" onClick={onClose} disabled={saving}>取消</Button><Button variant="primary" type="submit" disabled={saving}>{saving ? "保存中…" : "保存 BUG"}</Button></footer>
  </form></DialogLayer>;
}

function BugTransitionDialog({ bug, nextStatus, bugs, busy, error, onClose, onSave }: { bug: Bug; nextStatus: BugStatus; bugs: Bug[]; busy: boolean; error: string; onClose: () => void; onSave: (status: BugStatus, message: string, completedDate: string, resolution: BugResolution | null) => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [completedDate, setCompletedDate] = useState(todayKey());
  const [reason, setReason] = useState<BugResolutionReason>("not_bug");
  const [duplicateId, setDuplicateId] = useState("");
  const isCancelled = nextStatus === "cancelled";
  const needsMessage = ["blocked", "deferred", "cancelled"].includes(nextStatus) || (bug.status === "pending_verification" && nextStatus === "in_progress") || ((bug.status === "done" || bug.status === "cancelled") && nextStatus !== bug.status);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (needsMessage && !message.trim() && !(isCancelled && reason !== "other")) return;
    if (isCancelled && reason === "duplicate" && !duplicateId) return;
    const duplicate = bugs.find((item) => item.id === duplicateId);
    const resolution: BugResolution | null = isCancelled ? { reason, note: message.trim(), duplicateOfId: duplicate?.id ?? null, duplicateCode: duplicate?.code ?? null, duplicateTitle: duplicate?.title ?? null } : null;
    void onSave(nextStatus, message.trim(), completedDate, resolution);
  };
  return <DialogLayer onClose={onClose} closeOnBackdrop={!busy}><form className="modal-card bug-transition-dialog" onSubmit={submit}>
    <header className="bug-dialog-header"><div><span className="eyebrow">{bug.code} · {bugStatusLabels[bug.status]}</span><h2>{nextStatus === "done" ? "完成 BUG" : nextStatus === "in_progress" && bug.status === "done" ? "重新打开 BUG" : nextStatus === "todo" && bug.status === "cancelled" ? "重新激活 BUG" : `变更为「${bugStatusLabels[nextStatus]}」`}</h2></div><button type="button" className="dialog-close" onClick={onClose} aria-label="关闭">×</button></header>
    <p className="bug-transition-title">{bug.title}</p>
    {nextStatus === "done" ? <Field label="完成日期"><TextField type="date" required min={bug.bugDate} value={completedDate} onChange={(event) => setCompletedDate(event.target.value)} /></Field> : null}
    {isCancelled ? <Field label="取消原因"><SelectField value={reason} onChange={(event) => setReason(event.target.value as BugResolutionReason)}><option value="duplicate">重复 BUG</option><option value="not_bug">确认为非 BUG</option><option value="cannot_reproduce">无法复现</option><option value="wont_fix">暂不修复</option><option value="other">其他</option></SelectField></Field> : null}
    {isCancelled && reason === "duplicate" ? <Field label="关联原 BUG"><SelectField required value={duplicateId} onChange={(event) => setDuplicateId(event.target.value)}><option value="">请选择原 BUG</option>{bugs.filter((item) => item.id !== bug.id && item.space === bug.space).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</SelectField></Field> : null}
    <Field label={isCancelled && reason !== "other" ? "补充说明（可选）" : needsMessage ? "变更原因" : "处理说明（可选）"}><TextArea rows={4} required={needsMessage && (!isCancelled || reason === "other")} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={nextStatus === "blocked" ? "说明当前阻碍和需要的协助" : nextStatus === "deferred" ? "说明暂缓原因或重新评估时间" : nextStatus === "in_progress" ? "说明重新打开或验证未通过的原因" : "记录这次状态变更的原因"} /></Field>
    {error ? <p className="bug-form-error" role="alert">{error}</p> : null}
    <footer className="bug-dialog-actions"><Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button><Button variant="primary" type="submit" disabled={busy}>{busy ? "处理中…" : "确认变更"}</Button></footer>
  </form></DialogLayer>;
}

function BugBulkEditDialog({ bugs, projects, onClose, onApply }: { bugs: Bug[]; projects: Project[]; onClose: () => void; onApply: (operation: BulkBugOperation, targetIds: string[]) => Promise<BulkBugResult> }) {
  const [kind, setKind] = useState<BulkBugOperation["kind"]>("priority");
  const [status, setStatus] = useState<BugStatus>("in_progress");
  const [message, setMessage] = useState("");
  const [completedDate, setCompletedDate] = useState(todayKey());
  const [resolutionReason, setResolutionReason] = useState<BugResolutionReason>("not_bug");
  const [priority, setPriority] = useState<BugPriority>("p2");
  const [assignee, setAssignee] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueDateMode, setDueDateMode] = useState<"set" | "clear">("set");
  const [dueDate, setDueDate] = useState("");
  const [tagMode, setTagMode] = useState<"append" | "remove" | "replace">("append");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkBugResult | null>(null);
  const latestBugDate = bugs.reduce((latest, bug) => bug.bugDate > latest ? bug.bugDate : latest, "");
  const uniqueProjects = projects.filter((project) => bugs.some((bug) => bug.space === project.space));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!bugs.length) return;
    let operation: BulkBugOperation;
    if (kind === "status") {
      if (!message.trim()) return;
      if (status === "done" && (!completedDate || completedDate < latestBugDate || completedDate > todayKey())) return;
      operation = { kind, status, message: message.trim(), completedDate, resolutionReason };
    } else if (kind === "priority") operation = { kind, priority };
    else if (kind === "assignee") operation = { kind, assignee: assignee.trim() };
    else if (kind === "project") operation = { kind, projectId: projectId || null };
    else if (kind === "due_date") operation = { kind, dueDate: dueDateMode === "clear" ? null : dueDate || null };
    else if (kind === "tags") operation = { kind, mode: tagMode, tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) };
    else operation = { kind: "delete" };

    setBusy(true);
    try {
      const targetIds = result?.failures.map((failure) => failure.id) ?? bugs.map((bug) => bug.id);
      const next = await onApply(operation, targetIds);
      setResult((current) => ({ successCount: (current?.successCount ?? 0) + next.successCount, failures: next.failures }));
    } catch (cause) {
      setResult((current) => ({ successCount: current?.successCount ?? 0, failures: bugs.map((bug) => ({ id: bug.id, title: bug.title, error: errorMessage(cause) })) }));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !busy && bugs.length > 0
    && (kind !== "status" || (message.trim().length > 0 && (status !== "done" || (completedDate >= latestBugDate && completedDate <= todayKey()))))
    && (kind !== "due_date" || dueDateMode === "clear" || Boolean(dueDate));
  const pendingCount = result ? result.failures.length : bugs.length;

  return <DialogLayer onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy}><form className="modal-card bug-bulk-dialog" onSubmit={(event) => void submit(event)}>
    <header className="bug-dialog-header"><div><span className="eyebrow">逐条校验 · {pendingCount} 条待处理</span><h2>批量处理 BUG</h2></div><button type="button" className="dialog-close" disabled={busy} onClick={onClose} aria-label="关闭">×</button></header>
    <p className="bug-bulk-description">本次选择 {result ? result.successCount + result.failures.length : bugs.length} 条。每条记录独立保存；失败项保留在列表，可修正后重试。</p>
    <Field label="操作"><SelectField value={kind} onChange={(event) => setKind(event.target.value as BulkBugOperation["kind"])}><option value="status">变更状态</option><option value="priority">修改优先级</option><option value="assignee">修改负责人</option><option value="project">关联项目</option><option value="due_date">修改截止日期</option><option value="tags">修改标签</option><option value="delete">移至回收站</option></SelectField></Field>
    {kind === "status" ? <>
      <Field label="目标状态"><SelectField value={status} onChange={(event) => setStatus(event.target.value as BugStatus)}>{statusOptions.map((value) => <option key={value} value={value}>{bugStatusLabels[value]}</option>)}</SelectField></Field>
      {status === "done" ? <Field label="统一完成日期"><TextField type="date" required min={latestBugDate} max={todayKey()} value={completedDate} onChange={(event) => setCompletedDate(event.target.value)} /></Field> : null}
      {status === "cancelled" ? <Field label="取消原因"><SelectField value={resolutionReason} onChange={(event) => setResolutionReason(event.target.value as BugResolutionReason)}><option value="not_bug">确认为非 BUG</option><option value="cannot_reproduce">无法复现</option><option value="wont_fix">暂不修复</option><option value="other">其他</option></SelectField></Field> : null}
      <Field label="统一处理说明"><TextArea rows={3} required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="该说明会追加到每条 BUG 的活动记录中" /></Field>
    </> : null}
    {kind === "priority" ? <Field label="优先级"><SelectField value={priority} onChange={(event) => setPriority(event.target.value as BugPriority)}>{Object.entries(bugPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field> : null}
    {kind === "assignee" ? <Field label="负责人"><TextField value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="留空表示清除负责人" /></Field> : null}
    {kind === "project" ? <Field label="关联项目"><SelectField value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">清除项目关联</option>{uniqueProjects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.space === "personal" ? "个人" : "工作"}</option>)}</SelectField></Field> : null}
    {kind === "due_date" ? <><Field label="日期操作"><SelectField value={dueDateMode} onChange={(event) => setDueDateMode(event.target.value as "set" | "clear")}><option value="set">设置为指定日期</option><option value="clear">清空截止日期</option></SelectField></Field>{dueDateMode === "set" ? <Field label="截止日期"><TextField type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field> : null}</> : null}
    {kind === "tags" ? <><Field label="标签操作"><SelectField value={tagMode} onChange={(event) => setTagMode(event.target.value as "append" | "remove" | "replace")}><option value="append">追加</option><option value="remove">移除</option><option value="replace">替换</option></SelectField></Field><Field label="标签"><TextField value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号分隔多个标签" /></Field></> : null}
    {kind === "delete" ? <div className="bug-bulk-delete-note">所选 BUG 将移入回收站，之后可以恢复。被其他 BUG 引用的条目会单独失败并显示原因。</div> : null}
    {result ? <div className="bug-bulk-result" role="status"><p>累计成功 {result.successCount} 条；失败 {result.failures.length} 条。</p>{result.failures.map((failure) => <div key={failure.id}><strong>{failure.title}</strong><span>{failure.error}</span></div>)}</div> : null}
    <footer className="bug-dialog-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" type="submit" disabled={!canSubmit}>{busy ? "处理中…" : result?.failures.length ? "重试失败项" : kind === "delete" ? "确认移至回收站" : "应用到 " + bugs.length + " 条"}</Button></footer>
  </form></DialogLayer>;
}

function BugDetailsDialog({ bug, projects, busy, error, onClose, onEdit, onTransition, onComment, onArchive, onDelete, onFavorite, onMoveSpace }: { bug: Bug; projects: Project[]; busy: boolean; error: string; onClose: () => void; onEdit: () => void; onTransition: (status: BugStatus) => void; onComment: (message: string) => Promise<void>; onArchive: () => void; onDelete: () => void; onFavorite: () => void; onMoveSpace: (space: ContentSpace) => void }) {
  const [comment, setComment] = useState("");
  const project = projects.find((item) => item.id === bug.projectId);
  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    await onComment(comment.trim());
    setComment("");
  };
  const activityLabel: Record<BugActivity["kind"], string> = { created: "创建", imported: "导入", updated: "更新", status_changed: "状态变更", comment_added: "处理记录", reopened: "重新打开", reactivated: "重新激活", verification_failed: "验证未通过" };
  return <DialogLayer onClose={onClose}><aside className="bug-details-panel" aria-label={`${bug.code} 详情`}>
    <header className="bug-details-header"><div><span className="bug-code">{bug.code}</span><span className={`bug-status-pill status-${bug.status}`}>{bugStatusLabels[bug.status]}</span></div><button type="button" className="dialog-close" onClick={onClose} aria-label="关闭详情">×</button></header>
    <div className="bug-details-scroll"><h2>{bug.title}</h2>
      {error ? <p className="bug-form-error" role="alert">{error}</p> : null}
      <div className="bug-detail-actions"><Button variant="primary" onClick={onEdit}>编辑</Button><SelectField aria-label="变更 BUG 状态" value={bug.status} disabled={busy} onChange={(event) => onTransition(event.target.value as BugStatus)}>{[bug.status, ...statusOptionsFor(bug).filter((item) => item !== bug.status)].map((value) => <option value={value} key={value}>{bugStatusLabels[value]}</option>)}</SelectField><Button variant="secondary" onClick={onFavorite}>{bug.favorite ? "★ 已收藏" : "☆ 收藏"}</Button><SpaceMoveButton space={bug.space} onMove={onMoveSpace} /><Button variant="secondary" onClick={onArchive}>{bug.archived ? "取消归档" : "归档"}</Button><Button variant="danger" onClick={onDelete}>移至回收站</Button></div>
      <div className="bug-detail-property-grid"><DetailProperty label="优先级" value={bugPriorityLabels[bug.priority]} /><DetailProperty label="严重度" value={bugSeverityLabels[bug.severity]} /><DetailProperty label="BUG 日期" value={bug.bugDate} /><DetailProperty label="截止日期" value={bug.dueDate || "—"} /><DetailProperty label="完成日期" value={bug.completedDate || "—"} /><DetailProperty label="项目" value={project?.name || "未关联"} /><DetailProperty label="模块 / 版本" value={[bug.module, bug.version].filter(Boolean).join(" · ") || "—"} /><DetailProperty label="负责人" value={bug.assignee || "未分配"} /><DetailProperty label="报告人" value={bug.reporter || "—"} /><DetailProperty label="重新打开次数" value={String(bug.reopenCount)} /><DetailProperty label="来源" value={bug.source.kind === "text_import" ? `文本导入 · 第 ${bug.source.lineNumber ?? "?"} 行` : bug.source.kind === "copy" ? "复制" : "手动创建"} /></div>
      {bug.tags.length ? <div className="bug-detail-tags">{bug.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
      <DetailText label="问题描述" text={bug.description} /><DetailText label="环境信息" text={bug.environment} /><DetailText label="备注" text={bug.notes} />
      {bug.resolution ? <section className="bug-detail-block"><h3>取消原因</h3><p>{bug.resolution.reason === "duplicate" ? `重复于 ${bug.resolution.duplicateCode ?? "原 BUG"}` : bug.resolution.reason === "not_bug" ? "确认为非 BUG" : bug.resolution.reason === "cannot_reproduce" ? "无法复现" : bug.resolution.reason === "wont_fix" ? "暂不修复" : "其他"}{bug.resolution.note ? ` · ${bug.resolution.note}` : ""}</p></section> : null}
      <section className="bug-detail-block"><h3>处理记录 <span>{bug.activities.length}</span></h3>
        <form className="bug-comment-form" onSubmit={submitComment}><TextArea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="添加复现结果、验证结论或协作记录…" /><Button type="submit" size="small" variant="secondary" disabled={busy || !comment.trim()}>添加记录</Button></form>
        <ol className="bug-activity-list">{[...bug.activities].reverse().map((activity) => <li key={activity.id}><span className="bug-activity-dot" /><div><strong>{activityLabel[activity.kind] ?? "更新"}</strong><time>{formatTimestamp(activity.occurredAt)}</time><p>{activity.message || activity.changes.map((change) => `${change.field}: ${String(change.before ?? "—")} → ${String(change.after ?? "—")}`).join("；") || "记录了更新"}</p></div></li>)}</ol>
      </section>
      <footer className="bug-details-footer"><span>创建于 {formatTimestamp(bug.createdAt)}</span><span>更新于 {formatTimestamp(bug.updatedAt)}</span><span>修订版本 {bug.revision}</span></footer>
    </div>
  </aside></DialogLayer>;
}

function DetailProperty({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div>; }
function DetailText({ label, text }: { label: string; text: string }) { return text.trim() ? <section className="bug-detail-block"><h3>{label}</h3><p className="bug-preline">{text}</p></section> : null; }

function BugImportDialog({ space, projects, onClose, onRefresh, onNotify }: { space: ContentSpace; projects: Project[]; onClose: () => void; onRefresh: () => Promise<void>; onNotify?: (message: string) => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<BugImportPreview | null>(null);
  const [defaults, setDefaults] = useState({ bugDate: todayKey(), dueDate: "", status: "todo" as BugStatus, priority: "p2" as BugPriority, severity: "s2" as BugSeverity, projectId: "", module: "", version: "", assignee: "", reporter: "", tags: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Array<{ rowId: string; success: boolean; error: string | null; alreadyImported: boolean }> | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [batchId, setBatchId] = useState(makeBatchId);
  const updateDefaults = (key: keyof typeof defaults, value: string) => { setDefaults((current) => ({ ...current, [key]: value })); setBatchId(makeBatchId()); setPreview(null); setResults(null); };
  const loadFile = async () => {
    const result = await open({ multiple: false, filters: [{ name: "文本或 Markdown", extensions: ["txt", "md"] }] });
    if (typeof result !== "string") return;
    try { setText(await api.readTextFile(result)); setBatchId(makeBatchId()); setPreview(null); setResults(null); setError(""); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const makePreview = async () => {
    setBusy(true); setError(""); setResults(null);
    try {
      const input: BugImportPreviewInput = {
        batchId, text, stripListPrefixes: true, recognizeCheckboxes: true,
        defaults: { space, bugDate: defaults.bugDate, dueDate: defaults.dueDate || null, status: defaults.status, priority: defaults.priority, severity: defaults.severity, projectId: defaults.projectId || null, module: defaults.module, version: defaults.version, assignee: defaults.assignee, reporter: defaults.reporter, tags: defaults.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), resolution: null },
      };
      const next = await api.previewBugImport(input);
      setPreview(next); setSelected(Object.fromEntries(next.rows.map((row) => [row.rowId, row.selected])));
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const commit = async (retry = false) => {
    if (!preview) return;
    const failedIds = new Set(results?.filter((result) => !result.success).map((result) => result.rowId) ?? []);
    const succeededIds = new Set(results?.filter((result) => result.success).map((result) => result.rowId) ?? []);
    const rows = preview.rows.filter((row) => row.draft && !row.error && (retry ? failedIds.has(row.rowId) : selected[row.rowId] && !succeededIds.has(row.rowId))).map((row) => ({ rowId: row.rowId, lineNumber: row.lineNumber, draft: row.draft as BugDraft }));
    if (!rows.length) return;
    setBusy(true); setError("");
    try {
      const next = await api.importBugs({ batchId: preview.batchId, rows });
      setResults((current) => {
        const merged = new Map((current ?? []).map((result) => [result.rowId, result]));
        next.forEach((result) => merged.set(result.rowId, result));
        return [...merged.values()];
      });
      await onRefresh();
      const saved = next.filter((result) => result.success && !result.alreadyImported).length;
      onNotify?.(`导入完成：新增 ${saved} 条，成功 ${next.filter((result) => result.success).length} 条`);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const resultById = new Map((results ?? []).map((result) => [result.rowId, result]));
  const selectedCount = preview?.rows.filter((row) => row.draft && !row.error && selected[row.rowId] && !resultById.get(row.rowId)?.success).length ?? 0;
  return <DialogLayer onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy}><section className="modal-card bug-import-dialog">
    <header className="bug-dialog-header"><div><span className="eyebrow">每行一条 BUG · 导入到{space === "personal" ? "个人" : "工作"}空间</span><h2>导入 BUG 任务</h2></div><button type="button" className="dialog-close" onClick={onClose} aria-label="关闭">×</button></header>
    {!preview ? <>
      <div className="bug-import-intro"><p>粘贴纯文本，或读取 .txt / .md 文件。空行会被忽略；支持 Markdown 列表和复选框格式。</p><Button variant="secondary" size="small" onClick={() => void loadFile()}>选择文本文件</Button></div>
      <TextArea className="bug-import-textarea" aria-label="待导入文本" rows={9} value={text} onChange={(event) => { setText(event.target.value); setBatchId(makeBatchId()); setResults(null); }} placeholder={"- 登录页输入错误密码时没有提示\n- [ ] 保存设置后页面卡死\n- [x] 修复移动端按钮错位"} />
      <div className="bug-import-defaults"><Field label="BUG 日期"><TextField type="date" value={defaults.bugDate} onChange={(event) => updateDefaults("bugDate", event.target.value)} /></Field><Field label="默认截止日期"><TextField type="date" min={defaults.bugDate} value={defaults.dueDate} onChange={(event) => updateDefaults("dueDate", event.target.value)} /></Field><Field label="默认状态"><SelectField value={defaults.status} onChange={(event) => updateDefaults("status", event.target.value)}>{statusOptions.map((value) => <option key={value} value={value}>{bugStatusLabels[value]}</option>)}</SelectField></Field><Field label="优先级"><SelectField value={defaults.priority} onChange={(event) => updateDefaults("priority", event.target.value)}>{Object.entries(bugPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field><Field label="严重度"><SelectField value={defaults.severity} onChange={(event) => updateDefaults("severity", event.target.value)}>{Object.entries(bugSeverityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field><Field label="默认项目"><SelectField value={defaults.projectId} onChange={(event) => updateDefaults("projectId", event.target.value)}><option value="">未关联项目</option>{projects.filter((project) => project.space === space).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</SelectField></Field><Field label="模块"><TextField value={defaults.module} onChange={(event) => updateDefaults("module", event.target.value)} /></Field><Field label="版本"><TextField value={defaults.version} onChange={(event) => updateDefaults("version", event.target.value)} /></Field><Field label="负责人"><TextField value={defaults.assignee} onChange={(event) => updateDefaults("assignee", event.target.value)} /></Field><Field label="报告人"><TextField value={defaults.reporter} onChange={(event) => updateDefaults("reporter", event.target.value)} /></Field><Field label="标签"><TextField value={defaults.tags} onChange={(event) => updateDefaults("tags", event.target.value)} placeholder="逗号分隔" /></Field></div>
      {error ? <p className="bug-form-error" role="alert">{error}</p> : null}
      <footer className="bug-dialog-actions"><Button variant="secondary" onClick={onClose}>取消</Button><Button variant="primary" disabled={busy || !text.trim()} onClick={() => void makePreview()}>{busy ? "解析中…" : "预览并校验"}</Button></footer>
    </> : <>
      <div className="bug-import-summary"><span>有效 {preview.rows.filter((row) => row.draft && !row.error).length} 条</span><span>空行 {preview.emptyLineCount} 条</span><span>重复 {preview.duplicateLineCount} 条</span><span>已选择 {selectedCount} 条</span><Button size="small" variant="subtle" onClick={() => { setBatchId(makeBatchId()); setPreview(null); setResults(null); }}>返回修改文本</Button></div>
      <div className="bug-import-row-list">{preview.rows.map((row) => { const result = resultById.get(row.rowId); return <div className={`bug-import-row ${row.error ? "has-error" : ""}`} key={row.rowId}><label className="bug-import-row-check"><input type="checkbox" disabled={!row.draft || Boolean(row.error) || Boolean(result?.success)} checked={Boolean(selected[row.rowId])} onChange={(event) => setSelected((current) => ({ ...current, [row.rowId]: event.target.checked }))} /></label><div className="bug-import-row-content"><small>第 {row.lineNumber} 行 · {row.raw}</small>{row.draft ? <TextField aria-label={`第 ${row.lineNumber} 行 BUG 标题`} disabled={Boolean(result?.success)} value={row.draft.title} onChange={(event) => setPreview((current) => current ? ({ ...current, rows: current.rows.map((item) => item.rowId === row.rowId ? { ...item, draft: item.draft ? { ...item.draft, title: event.target.value } : null } : item) }) : current)} /> : <strong>无法导入</strong>}{row.warning ? <span className="bug-import-warning">⚠ {row.warning}</span> : null}{row.error ? <span className="bug-import-error">{row.error}</span> : null}{result ? <span className={result.success ? "bug-import-success" : "bug-import-error"}>{result.success ? result.alreadyImported ? "此前已导入" : "导入成功" : result.error || "导入失败"}</span> : null}</div></div>; })}</div>
      {error ? <p className="bug-form-error" role="alert">{error}</p> : null}
      <footer className="bug-dialog-actions"><Button variant="secondary" onClick={() => { setPreview(null); setResults(null); }}>重新预览</Button>{results?.some((result) => !result.success) ? <Button variant="secondary" disabled={busy} onClick={() => void commit(true)}>重试失败项</Button> : null}<Button variant="primary" disabled={busy || selectedCount === 0} onClick={() => void commit()}>{busy ? "导入中…" : `导入所选 ${selectedCount} 条`}</Button></footer>
    </>}
  </section></DialogLayer>;
}

function BugExportDialog({ space, query, selectedIds, onClose }: { space: Space; query: BugQuery; selectedIds: string[]; onClose: () => void }) {
  const [format, setFormat] = useState<"compact" | "full">("full");
  const [groupByStatus, setGroupByStatus] = useState(true);
  const [includeDescription, setIncludeDescription] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeActivities, setIncludeActivities] = useState(false);
  const [title, setTitle] = useState("BUG 任务列表");
  const [snapshot, setSnapshot] = useState<BugExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const createSnapshot = async () => {
    setBusy(true); setError("");
    try { setSnapshot(await api.prepareBugExport({ space, query, selectedIds, includeArchived: Boolean(query.includeArchived), format, title, groupByStatus, includeDescription, includeNotes, includeActivities })); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (!snapshot) return;
    try { await navigator.clipboard.writeText(snapshot.markdown); }
    catch { setError("无法访问剪贴板；可以在下方预览框中全选并复制。"); }
  };
  const saveFile = async () => {
    if (!snapshot) return;
    try {
      const path = await save({ defaultPath: snapshot.fileName, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (!path) return;
      await api.saveBugExport(path, snapshot.markdown);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  return <DialogLayer onClose={onClose}><section className="modal-card bug-export-dialog">
    <header className="bug-dialog-header"><div><span className="eyebrow">Markdown · {selectedIds.length ? `已选 ${selectedIds.length} 条` : "当前筛选结果"}</span><h2>导出 BUG 任务</h2></div><button type="button" className="dialog-close" onClick={onClose} aria-label="关闭">×</button></header>
    <div className="bug-export-options"><Field label="报告标题"><TextField value={title} onChange={(event) => { setTitle(event.target.value); setSnapshot(null); }} /></Field><Field label="版式"><SelectField value={format} onChange={(event) => { setFormat(event.target.value as "compact" | "full"); setSnapshot(null); }}><option value="full">详细报告</option><option value="compact">紧凑表格</option></SelectField></Field><label><input type="checkbox" disabled={format === "compact"} checked={groupByStatus} onChange={(event) => { setGroupByStatus(event.target.checked); setSnapshot(null); }} />按状态分组</label><label><input type="checkbox" checked={includeDescription} onChange={(event) => { setIncludeDescription(event.target.checked); setSnapshot(null); }} />包含问题描述</label><label><input type="checkbox" checked={includeNotes} onChange={(event) => { setIncludeNotes(event.target.checked); setSnapshot(null); }} />包含备注</label><label><input type="checkbox" checked={includeActivities} onChange={(event) => { setIncludeActivities(event.target.checked); setSnapshot(null); }} />包含处理记录</label></div>
    <div className="bug-export-toolbar"><Button variant="secondary" disabled={busy} onClick={() => void createSnapshot()}>{busy ? "生成中…" : snapshot ? "重新生成预览" : "生成 Markdown 预览"}</Button>{snapshot ? <><span>{snapshot.itemCount} 条 · {snapshot.fileName}</span><Button size="small" variant="subtle" onClick={() => void copy()}>复制</Button><Button size="small" variant="primary" onClick={() => void saveFile()}>保存 .md</Button></> : null}</div>
    {error ? <p className="bug-form-error" role="alert">{error}</p> : null}
    {snapshot ? <TextArea className="bug-export-preview" aria-label="Markdown 导出预览" readOnly value={snapshot.markdown} /> : <div className="bug-export-empty">生成预览后可核对状态、日期和报告范围；保存时会直接写入这份预览快照。</div>}
    <footer className="bug-dialog-actions"><Button variant="secondary" onClick={onClose}>关闭</Button></footer>
  </section></DialogLayer>;
}

function formatTimestamp(value: string): string { return value ? value.replace("T", " ").slice(0, 16) : "—"; }
function errorMessage(cause: unknown): string { return cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "操作失败，请稍后重试。"; }
function makeBatchId(): string { return `bug-import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
