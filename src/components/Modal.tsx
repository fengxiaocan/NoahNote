import { useEffect, useState } from "react";
import type { Project, Space, TaskPriority, TaskStatus } from "../types";
import { parseTags } from "../lib/format";

export type CreateKind = "note" | "task" | "project" | "inbox" | "spark" | "checklist" | "template";
type FormValue = string | number | null | string[];
export type FormValues = Record<string, FormValue>;

const kindLabels: Record<CreateKind, string> = {
  note: "笔记",
  task: "任务",
  project: "项目",
  inbox: "收件箱记录",
  spark: "思维灵光",
  checklist: "Checklist",
  template: "模板",
};

interface CreateModalProps {
  kind: CreateKind;
  space: Exclude<Space, "all">;
  projects: Project[];
  onClose: () => void;
  onSave: (values: FormValues) => Promise<void>;
}

export function CreateModal({ kind, space, projects, onClose, onSave }: CreateModalProps) {
  const [values, setValues] = useState<FormValues>(() => initialValues(kind));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const set = (key: string, value: FormValue) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const required = String(values.title ?? values.name ?? "").trim();
    if (!required) {
      setError(kind === "project" ? "项目名称不能为空" : kind === "template" ? "模板名称不能为空" : "标题不能为空");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...values, space, tags: parseTags(String(values.tags ?? "")) });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">新建内容</span>
            <h2>{kindLabels[kind]}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="关闭">×</button>
        </div>

        {kind === "project" ? (
          <>
            <label>项目名称<input autoFocus value={String(values.name ?? "")} onChange={(event) => set("name", event.target.value)} placeholder="例如：桌面端工具" /></label>
            <label>项目描述<textarea value={String(values.description ?? "")} onChange={(event) => set("description", event.target.value)} placeholder="这个项目要达成什么？" rows={4} /></label>
            <div className="form-grid">
              <label>状态<select value={String(values.status)} onChange={(event) => set("status", event.target.value)}><option value="planning">规划中</option><option value="active">进行中</option><option value="paused">已暂停</option></select></label>
              <label>进度<input type="number" min="0" max="100" value={Number(values.progress ?? 0)} onChange={(event) => set("progress", Number(event.target.value))} /></label>
            </div>
            <label>标签<input value={String(values.tags ?? "")} onChange={(event) => set("tags", event.target.value)} placeholder="#Android  #重要" /></label>
          </>
        ) : kind === "checklist" ? (
          <>
            <label>清单名称<input autoFocus value={String(values.title ?? "")} onChange={(event) => set("title", event.target.value)} placeholder="例如：发布前检查" /></label>
            <label>说明<textarea value={String(values.description ?? "")} onChange={(event) => set("description", event.target.value)} placeholder="这份清单用于什么场景？" rows={3} /></label>
            <label>清单项<textarea value={String(values.items ?? "")} onChange={(event) => set("items", event.target.value)} placeholder="每行一项，例如：\n检查版本号\n运行测试\n发布更新日志" rows={7} /></label>
            <label>标签<input value={String(values.tags ?? "")} onChange={(event) => set("tags", event.target.value)} placeholder="#发布  #检查" /></label>
          </>
        ) : kind === "template" ? (
          <>
            <label>模板名称<input autoFocus value={String(values.name ?? "")} onChange={(event) => set("name", event.target.value)} placeholder="例如：会议纪要" /></label>
            <label>模板说明<textarea value={String(values.description ?? "")} onChange={(event) => set("description", event.target.value)} placeholder="模板的使用场景" rows={3} /></label>
            <div className="form-grid">
              <label>生成类型<select value={String(values.templateKind)} onChange={(event) => set("templateKind", event.target.value)}><option value="note">笔记</option><option value="task">任务</option><option value="project">项目</option><option value="checklist">Checklist</option></select></label>
              <label>默认标题<input value={String(values.templateTitle ?? "")} onChange={(event) => set("templateTitle", event.target.value)} placeholder="创建时使用的标题" /></label>
            </div>
            <label>默认说明<textarea value={String(values.templateDescription ?? "")} onChange={(event) => set("templateDescription", event.target.value)} placeholder="任务、项目或 Checklist 的默认说明" rows={3} /></label>
            <label>默认正文<textarea value={String(values.templateContent ?? "")} onChange={(event) => set("templateContent", event.target.value)} placeholder="笔记正文；其他类型可留空" rows={5} /></label>
            <label>默认清单项<textarea value={String(values.templateItems ?? "")} onChange={(event) => set("templateItems", event.target.value)} placeholder="Checklist 模板每行一项" rows={4} /></label>
            <label>标签<input value={String(values.tags ?? "")} onChange={(event) => set("tags", event.target.value)} placeholder="#会议  #复盘" /></label>
          </>
        ) : (
          <>
            <label>{kind === "inbox" || kind === "spark" ? "先记下什么？" : "标题"}<input autoFocus value={String(values.title ?? "")} onChange={(event) => set("title", event.target.value)} placeholder={kind === "spark" ? "例如：可以把晨间计划做成一个可视化仪表盘" : kind === "note" ? "写下一个想法…" : kind === "task" ? "下一步要做什么？" : "临时记录…"} /></label>
            {kind === "note" ? <label>内容<textarea value={String(values.content ?? "")} onChange={(event) => set("content", event.target.value)} placeholder="支持 Markdown…" rows={8} /></label> : null}
            {kind === "inbox" || kind === "spark" ? <label>{kind === "spark" ? "补充思路" : "补充内容"}<textarea value={String(values.body ?? "")} onChange={(event) => set("body", event.target.value)} placeholder={kind === "spark" ? "它解决什么问题？为什么值得继续想？" : "可以稍后再整理"} rows={5} /></label> : null}
            {kind === "task" ? (
              <>
                <label>描述<textarea value={String(values.description ?? "")} onChange={(event) => set("description", event.target.value)} placeholder="补充完成任务所需的背景和步骤" rows={5} /></label>
                <div className="form-grid">
                  <label>状态<select value={String(values.status)} onChange={(event) => set("status", event.target.value as TaskStatus)}><option value="todo">待处理</option><option value="in_progress">进行中</option><option value="waiting">等待</option></select></label>
                  <label>优先级<select value={String(values.priority)} onChange={(event) => set("priority", event.target.value as TaskPriority)}><option value="urgent">紧急</option><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label>
                </div>
                <div className="form-grid">
                  <label>截止日期<input type="date" value={String(values.dueDate ?? "")} onChange={(event) => set("dueDate", event.target.value || null)} /></label>
                  <label>所属项目<select value={String(values.projectId ?? "")} onChange={(event) => set("projectId", event.target.value || null)}><option value="">不关联项目</option>{projects.filter((project) => project.space === space).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                </div>
                <label>标签<input value={String(values.tags ?? "")} onChange={(event) => set("tags", event.target.value)} placeholder="#待研究  #重要" /></label>
              </>
            ) : null}
            {kind === "inbox" ? (
              <div className="form-grid">
                <label>内容类型<select value={String(values.kind)} onChange={(event) => set("kind", event.target.value)}><option value="note">笔记</option><option value="task">任务</option><option value="memo">备忘</option><option value="checklist">清单</option><option value="spark">思维灵光</option></select></label>
                <label>标签<input value={String(values.tags ?? "")} onChange={(event) => set("tags", event.target.value)} placeholder="#稍后整理" /></label>
              </div>
            ) : null}
            {kind === "spark" ? <label>标签<input value={String(values.tags ?? "")} onChange={(event) => set("tags", event.target.value)} placeholder="#产品  #待研究" /></label> : null}
          </>
        )}

        {error ? <div className="form-error">{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>取消</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? "保存中…" : "保存"}</button>
        </div>
      </form>
    </div>
  );
}

function initialValues(kind: CreateKind): FormValues {
  if (kind === "note") return { title: "", content: "", tags: "", projectId: null };
  if (kind === "task") return { title: "", description: "", status: "todo", priority: "normal", dueDate: null, projectId: null, tags: "" };
  if (kind === "project") return { name: "", description: "", status: "planning", progress: 0, tags: "" };
  if (kind === "checklist") return { title: "", description: "", items: "", tags: "" };
  if (kind === "template") return { name: "", description: "", templateKind: "note", templateTitle: "", templateDescription: "", templateContent: "", templateItems: "", tags: "" };
  if (kind === "spark") return { title: "", body: "", tags: "" };
  return { title: "", body: "", kind: "note", tags: "" };
}
