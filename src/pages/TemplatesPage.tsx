import { Button, Field, SelectableListItem, TextArea, TextField, EmptyState } from "../components/ui";
import { useEffect, useState } from "react";
import type { Space, Template } from "../types";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import type { ContentSpace } from "../types";
import type { CreateKind } from "../components/Modal";

const kindLabels = { note: "笔记", task: "任务", project: "项目", checklist: "Checklist" } as const;

interface TemplatesPageProps {
  space: Space;
  templates: Template[];
  onCreate: (kind: CreateKind) => void;
  onUpdate: (template: Template) => void;
  onMoveSpace: (template: Template, space: ContentSpace) => void | Promise<unknown>;
  onArchive: (template: Template) => void;
  onDelete: (template: Template) => Promise<void>;
  onUse: (template: Template) => void;
}

export function TemplatesPage({ space, templates, onCreate, onUpdate, onArchive, onMoveSpace, onDelete, onUse }: TemplatesPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;
  return <div className="page-stack templates-page"><PageHeader eyebrow="减少重复决定" title="模板" description={(space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间") + " · 把常用结构保存下来"} action={<Button variant="primary" onClick={() => onCreate("template")}>＋ 新建模板</Button>} /><div className="templates-layout"><section className="list-panel template-list-panel"><div className="list-panel-heading"><span>{templates.length} 个模板</span><span className="muted">选中后使用</span></div>{templates.length === 0 ? <EmptyState size="large"><div className="large-empty-icon">▱</div><h3>还没有模板</h3><p>从一次会议纪要或发布流程开始。</p><Button variant="secondary" onClick={() => onCreate("template")}>创建模板</Button></EmptyState> : <div className="template-list">{templates.map((template) => <SelectableListItem className="template-list-item" selected={selected?.id === template.id} key={template.id} onClick={() => setSelectedId(template.id)}><span className={"template-kind " + template.kind}>{kindLabels[template.kind]}</span><span><strong>{template.name}</strong><small>{template.description || "暂无说明"}</small></span></SelectableListItem>)}</div>}</section>{selected ? <TemplateEditor template={selected} onUpdate={onUpdate} onArchive={onArchive} onMoveSpace={onMoveSpace} onDelete={onDelete} onUse={onUse} /> : <EmptyState size="placeholder" className="project-detail-placeholder"><div className="placeholder-glyph">▱</div><h3>选择一个模板</h3><p>从模板快速创建一份新的内容。</p></EmptyState>}</div></div>;
}

function TemplateEditor({ template, onUpdate, onArchive, onMoveSpace, onDelete, onUse }: { template: Template; onUpdate: (template: Template) => void; onArchive: (template: Template) => void; onMoveSpace: (template: Template, space: ContentSpace) => void | Promise<unknown>; onDelete: (template: Template) => Promise<void>; onUse: (template: Template) => void }) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [payloadText, setPayloadText] = useState(JSON.stringify(template.payload, null, 2));
  const [error, setError] = useState("");
  useEffect(() => { setName(template.name); setDescription(template.description); setPayloadText(JSON.stringify(template.payload, null, 2)); setError(""); }, [template.id, template.name, template.description, template.payload]);
  const save = () => { try { const payload = JSON.parse(payloadText) as Record<string, unknown>; setError(""); onUpdate({ ...template, name: name.trim() || template.name, description, payload }); } catch { setError("默认内容必须是有效的 JSON 对象"); } };
  const moveSpace = (nextSpace: ContentSpace) => {
    try {
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      setError("");
      return onMoveSpace({ ...template, name: name.trim() || template.name, description, payload }, nextSpace);
    } catch {
      setError("默认内容必须是有效的 JSON 对象");
    }
  };
  return <section className="template-editor list-panel"><div className="checklist-editor-heading"><div><span className={"template-kind " + template.kind}>{kindLabels[template.kind]}</span><h2>模板内容</h2></div><div className="editor-actions"><SpaceMoveButton space={template.space} onMove={moveSpace} /><Button size="small" variant="subtle" onClick={() => onArchive(template)}>归档</Button><Button size="small" variant="danger" onClick={() => void onDelete(template)}>删除</Button><Button variant="secondary" className="compact" onClick={() => onUse(template)}>使用模板</Button><Button variant="primary" className="compact" onClick={save}>保存</Button></div></div><Field label="模板名称"><TextField className="checklist-title-input" value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="说明"><TextArea className="checklist-description-input" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></Field><Field label="默认内容（JSON）"><TextArea className="template-json-input" value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={14} spellCheck={false} /></Field>{error ? <div className="form-error">{error}</div> : null}<p className="muted">模板创建时会自动替换目标空间；可用字段取决于模板类型。</p></section>;
}
