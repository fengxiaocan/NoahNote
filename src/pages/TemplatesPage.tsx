import { Button, EmptyState, SelectableListItem, TextArea, TextField } from "../components/ui";
import { useEffect, useMemo, useState } from "react";
import type { ContentSpace, Space, Template, TemplateKind } from "../types";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import type { CreateKind } from "../components/Modal";

const kindLabels: Record<TemplateKind, string> = {
  note: "笔记",
  task: "任务",
  project: "项目",
  checklist: "Checklist",
};

interface TemplatesPageProps {
  space: Space;
  templates: Template[];
  onCreate: (kind: CreateKind) => void;
  onUpdate: (template: Template) => void;
  onArchive: (template: Template) => void;
  onMoveSpace: (template: Template, space: ContentSpace) => void | Promise<unknown>;
  onDelete: (template: Template) => Promise<void>;
  onUse: (template: Template) => void;
}

export function TemplatesPage({
  space,
  templates,
  onCreate,
  onUpdate,
  onArchive,
  onMoveSpace,
  onDelete,
  onUse,
}: TemplatesPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | TemplateKind>("all");

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      if (kindFilter !== "all" && template.kind !== kindFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = template.name.toLowerCase().includes(q);
        const matchDesc = template.description?.toLowerCase().includes(q);
        const matchKind = kindLabels[template.kind].toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchKind) return false;
      }
      return true;
    });
  }, [templates, kindFilter, searchQuery]);

  const selected =
    templates.find((template) => template.id === selectedId) ??
    filteredTemplates[0] ??
    templates[0] ??
    null;

  return (
    <div className="page-stack templates-page">
      <PageHeader
        eyebrow="减少重复决定"
        title="模板"
        description={`${space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间"} · 把常用结构保存下来`}
        action={
          <Button variant="primary" onClick={() => onCreate("template")}>
            ＋ 新建模板
          </Button>
        }
      />

      <div className="templates-layout">
        <section className="list-panel template-list-panel">
          <div className="template-panel-header">
            <div className="template-panel-title-area">
              <span className="template-panel-title">我的模板</span>
              <span className="template-count-badge" title="当前显示的模板数量">
                {filteredTemplates.length}
              </span>
            </div>
            <button
              type="button"
              className="template-add-quick-btn"
              onClick={() => onCreate("template")}
              title="新建模板"
            >
              <span className="plus-sign">＋</span>
              <span>新建</span>
            </button>
          </div>

          <div className="template-panel-top">
            <div className="template-search-box">
              <span className="search-icon">🔍</span>
              <TextField
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索模板名称、说明或类型..."
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchQuery("")}
                  title="清除搜索"
                >
                  ×
                </button>
              )}
            </div>

            <div className="template-filter-pills">
              {(
                [
                  ["all", "全部"],
                  ["note", "笔记"],
                  ["task", "任务"],
                  ["project", "项目"],
                  ["checklist", "清单"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`pill-btn ${kindFilter === val ? "is-active" : ""}`}
                  onClick={() => setKindFilter(val)}
                >
                  <span className="pill-text">{label}</span>
                  <span className="pill-count">
                    {val === "all"
                      ? templates.length
                      : templates.filter((t) => t.kind === val).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="template-list-scroll">
            {templates.length === 0 ? (
              <EmptyState size="large">
                <div className="large-empty-icon">▱</div>
                <h3>还没有模板</h3>
                <p>从一次会议纪要或发布流程开始。</p>
                <Button variant="primary" onClick={() => onCreate("template")}>
                  ＋ 新建模板
                </Button>
              </EmptyState>
            ) : filteredTemplates.length === 0 ? (
              <EmptyState size="compact">
                <span>🔍</span>
                <p>未找到符合条件的模板</p>
                <Button variant="subtle"
                 
                  onClick={() => {
                    setKindFilter("all");
                    setSearchQuery("");
                  }}
                >
                  清除筛选条件
                </Button>
              </EmptyState>
            ) : (
              <div className="template-list">
                {filteredTemplates.map((template) => {
                  const isSelected = selected?.id === template.id;
                  return (
                    <div key={template.id} className="template-card-shell">
                      <SelectableListItem
                        className="template-list-item"
                        selected={isSelected}
                        onClick={() => setSelectedId(template.id)}
                      >
                        <div className="template-item-header">
                          <span className={`template-kind-pill ${template.kind}`}>
                            {kindLabels[template.kind]}
                          </span>
                          <strong className="template-item-title" title={template.name}>
                            {template.name}
                          </strong>
                        </div>

                        <p className="template-item-desc" title={template.description || "暂无说明"}>
                          {template.description || "暂无说明"}
                        </p>

                        <div className="template-item-footer">
                          <span className="template-payload-meta">
                            {Object.keys(template.payload || {}).length} 个默认字段
                          </span>
                        </div>
                      </SelectableListItem>
                      <button
                        type="button"
                        className="template-use-quick-btn"
                        onClick={() => onUse(template)}
                        title="使用此模板创建内容"
                      >
                        使用 →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {selected ? (
          <TemplateEditor
            template={selected}
            onUpdate={onUpdate}
            onArchive={onArchive}
            onMoveSpace={onMoveSpace}
            onDelete={onDelete}
            onUse={onUse}
          />
        ) : (
          <EmptyState size="placeholder" className="project-detail-placeholder">
            <div className="placeholder-glyph">▱</div>
            <h3>选择一个模板</h3>
            <p>从模板快速创建一份新的内容。</p>
            <Button variant="primary"
             
              onClick={() => onCreate("template")}
            >
              ＋ 新建模板
            </Button>
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  onUpdate,
  onArchive,
  onMoveSpace,
  onDelete,
  onUse,
}: {
  template: Template;
  onUpdate: (template: Template) => void;
  onArchive: (template: Template) => void;
  onMoveSpace: (template: Template, space: ContentSpace) => void | Promise<unknown>;
  onDelete: (template: Template) => Promise<void>;
  onUse: (template: Template) => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [payloadText, setPayloadText] = useState(JSON.stringify(template.payload, null, 2));
  const [error, setError] = useState("");

  useEffect(() => {
    setName(template.name);
    setDescription(template.description);
    setPayloadText(JSON.stringify(template.payload, null, 2));
    setError("");
  }, [template.id, template.name, template.description, template.payload]);

  const save = () => {
    try {
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      setError("");
      onUpdate({ ...template, name: name.trim() || template.name, description, payload });
    } catch {
      setError("默认内容必须是有效的 JSON 对象");
    }
  };

  const moveSpace = (nextSpace: ContentSpace) => {
    try {
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      setError("");
      return onMoveSpace({ ...template, name: name.trim() || template.name, description, payload }, nextSpace);
    } catch {
      setError("默认内容必须是有效的 JSON 对象");
    }
  };

  return (
    <section className="template-editor list-panel">
      <div className="checklist-editor-heading">
        <div className="heading-title-group">
          <div className="heading-actions">
            <span className={`template-kind ${template.kind}`}>{kindLabels[template.kind]}</span>
            <span className="card-kicker">
              {template.space === "personal" ? "个人空间" : "工作空间"} · 模板
            </span>
          </div>
          <h2>{name || "未命名模板"}</h2>
        </div>
        <div className="editor-actions">
          <SpaceMoveButton space={template.space} onMove={moveSpace} />
          <Button variant="subtle" size="small" onClick={() => onArchive(template)}>
            归档
          </Button>
          <Button variant="danger" size="small" onClick={() => void onDelete(template)}>
            删除
          </Button>
          <Button variant="secondary" className="compact" onClick={() => onUse(template)}>
            使用模板
          </Button>
          <Button variant="primary" className="compact" onClick={save}>
            保存
          </Button>
        </div>
      </div>
      <label>
        模板名称
        <TextField
          className="checklist-title-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        说明
        <TextArea
          className="checklist-description-input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
      </label>
      <label>
        默认内容（JSON）
        <TextArea
          className="template-json-input"
          value={payloadText}
          onChange={(event) => setPayloadText(event.target.value)}
          rows={14}
          spellCheck={false}
        />
      </label>
      {error ? <div className="form-error">{error}</div> : null}
      <p className="muted">模板创建时会自动替换目标空间；可用字段取决于模板类型。</p>
    </section>
  );
}
