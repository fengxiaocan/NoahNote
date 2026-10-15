import { Button, EmptyState, SelectableListItem, SelectField, TextArea, TextField } from "../components/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Checklist, ChecklistItem, ContentSpace, Space } from "../types";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import { CheckIcon, ChecklistStatusIcon } from "../components/CheckIcon";
import type { CreateKind } from "../components/Modal";
import { formatRelative, parseTags } from "../lib/format";
import {
  calculateChecklistStats,
  cloneChecklist,
  exportChecklistToMarkdown,
  filterAndSortChecklists,
  parseChecklistItemsFromText,
  removeCompletedChecklistItems,
  toggleAllChecklistItems,
  type ChecklistFilterStatus,
  type ChecklistSortOption,
} from "../lib/checklists";
import { api } from "../lib/api";

interface ChecklistsPageProps {
  space: Space;
  checklists: Checklist[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (kind: CreateKind) => void;
  onUpdate: (checklist: Checklist) => void;
  onArchive: (checklist: Checklist) => void;
  onMoveSpace: (checklist: Checklist, space: ContentSpace) => void | Promise<unknown>;
  onDelete: (checklist: Checklist) => Promise<void>;
  onDuplicate?: (checklist: Checklist) => Promise<void>;
}

export function ChecklistsPage({
  space,
  checklists,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onArchive,
  onMoveSpace,
  onDelete,
  onDuplicate,
}: ChecklistsPageProps) {
  const [filter, setFilter] = useState<ChecklistFilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ChecklistSortOption>("updated");
  const [feedbackToast, setFeedbackToast] = useState("");

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    window.setTimeout(() => setFeedbackToast(""), 3000);
  };

  // Filter and sort checklists
  const filteredChecklists = useMemo(() => {
    return filterAndSortChecklists(checklists, {
      status: filter,
      search: searchQuery,
      sortBy,
    });
  }, [checklists, filter, searchQuery, sortBy]);

  const selected = checklists.find((checklist) => checklist.id === selectedId) ?? filteredChecklists[0] ?? checklists[0] ?? null;

  const toggleFavoriteChecklist = (checklist: Checklist) => {
    onUpdate({ ...checklist, favorite: !checklist.favorite });
  };

  const handleDuplicate = async (checklist: Checklist, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (onDuplicate) {
        await onDuplicate(checklist);
      } else {
        const cloned = cloneChecklist(checklist);
        await api.createChecklist({
          title: cloned.title,
          description: cloned.description,
          items: cloned.items,
          space: cloned.space,
          tags: cloned.tags,
        });
      }
      showToast(`已成功复制清单 “${checklist.title}”`);
    } catch (err) {
      console.error("Failed to duplicate checklist:", err);
    }
  };

  return (
    <div className="page-stack checklists-page">
      <PageHeader
        eyebrow="一步一步完成"
        title="Checklist"
        description={`${space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间"} · 把重复流程与关键步骤变成清晰的清单`}
        action={
          <Button variant="primary" onClick={() => onCreate("checklist")}>
            ＋ 新建清单
          </Button>
        }
      />

      {feedbackToast && <div className="toast-message floating-toast">{feedbackToast}</div>}

      <div className="checklists-layout">
        {/* Left Side: Checklist List Panel */}
        <section className="list-panel checklist-list-panel">
          <div className="checklist-panel-header">
            <div className="checklist-panel-title-area">
              <span className="checklist-panel-title">我的清单</span>
              <span className="checklist-count-badge" title="当前显示的清单数量">
                {filteredChecklists.length}
              </span>
            </div>
            <button
              type="button"
              className="checklist-add-quick-btn"
              onClick={() => onCreate("checklist")}
              title="新建清单"
            >
              <span className="plus-sign">＋</span>
              <span>新建</span>
            </button>
          </div>

          <div className="checklist-panel-top">
            <div className="checklist-search-box">
              <span className="search-icon">🔍</span>
              <TextField
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索清单名称、事项或标签..."
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

            {/* Filter Pills */}
            <div className="checklist-filter-pills">
              {(
                [
                  ["all", "全部"],
                  ["in_progress", "进行中"],
                  ["completed", "已完成"],
                  ["favorite", "星标"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`pill-btn ${filter === val ? "is-active" : ""}`}
                  onClick={() => setFilter(val)}
                >
                  <span className="pill-text">{label}</span>
                  <span className="pill-count">
                    {val === "all"
                      ? checklists.length
                      : val === "favorite"
                      ? checklists.filter((c) => c.favorite).length
                      : val === "completed"
                      ? checklists.filter((c) => {
                          const s = calculateChecklistStats(c);
                          return s.totalItems > 0 && s.isAllCompleted;
                        }).length
                      : checklists.filter((c) => {
                          const s = calculateChecklistStats(c);
                          return s.totalItems === 0 || !s.isAllCompleted;
                        }).length}
                  </span>
                </button>
              ))}
            </div>

            {/* Sorter and Count row */}
            <div className="checklist-sort-row">
              <span className="checklist-items-count-tip">
                显示 {filteredChecklists.length} / {checklists.length} 份
              </span>
              <div className="checklist-sort-select-wrapper">
                <span className="sort-icon">⇅</span>
                <SelectField
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as ChecklistSortOption)}
                  title="清单排序方式"
                >
                  <option value="updated">最近更新</option>
                  <option value="created">创建时间</option>
                  <option value="title">清单名称</option>
                  <option value="progress-desc">完成率 (高到低)</option>
                  <option value="progress-asc">完成率 (低到高)</option>
                  <option value="items-desc">事项数量</option>
                </SelectField>
              </div>
            </div>
          </div>

          <div className="checklist-list-scroll">
            {checklists.length === 0 ? (
              <EmptyState size="large">
                <div className="large-empty-icon">📋</div>
                <h3>还没有 Checklist</h3>
                <p>把发布、测试、出行或日常例行步骤保存下来。</p>
                <Button variant="primary" onClick={() => onCreate("checklist")}>
                  ＋ 新建清单
                </Button>
              </EmptyState>
            ) : filteredChecklists.length === 0 ? (
              <EmptyState size="compact">
                <span>🔍</span>
                <p>未找到符合条件的清单</p>
                <Button variant="subtle"
                 
                  onClick={() => {
                    setFilter("all");
                    setSearchQuery("");
                  }}
                >
                  清除筛选条件
                </Button>
              </EmptyState>
            ) : (
              <div className="checklist-list">
                {filteredChecklists.map((checklist) => {
                  const stats = calculateChecklistStats(checklist);
                  const isSelected = selected?.id === checklist.id;
                  const nextPendingItem = checklist.items.find((item) => !item.completed);

                  return (
                    <div key={checklist.id} className="checklist-card-shell">
                      <SelectableListItem
                        className={`checklist-list-item ${stats.isAllCompleted ? "is-all-done" : ""}`}
                        selected={isSelected}
                        onClick={() => onSelect(checklist.id)}
                      >
                        <div className="checklist-item-header">
                          <div className="checklist-item-icon-wrap">
                            <ChecklistStatusIcon
                              isAllCompleted={stats.isAllCompleted}
                              totalItems={stats.totalItems}
                            />
                          </div>
                          <strong className="checklist-item-title" title={checklist.title}>
                            {checklist.title}
                          </strong>
                        </div>

                        {checklist.description?.trim() && (
                          <p className="checklist-item-desc" title={checklist.description.trim()}>
                            {checklist.description.trim()}
                          </p>
                        )}

                        {/* Progress Track */}
                        <div className="checklist-item-progress">
                          <div className="progress-track mini">
                            <div
                              className={`progress-fill ${stats.isAllCompleted ? "green" : ""}`}
                              style={{ width: `${stats.completionRate}%` }}
                            />
                          </div>
                          <div className="checklist-item-meta">
                            <span className="checklist-progress-text">
                              {stats.completedItems}/{stats.totalItems} 项完成
                            </span>
                            {stats.isAllCompleted ? (
                              <span className="check-all-done-pill">✓ 全部达成</span>
                            ) : (
                              <span className="checklist-rate-pill">{stats.completionRate}%</span>
                            )}
                          </div>
                        </div>

                        {/* Next Pending Item Preview */}
                        {!stats.isAllCompleted && nextPendingItem && (
                          <div className="checklist-next-step" title={`下一步: ${nextPendingItem.text}`}>
                            <span className="next-step-dot" />
                            <span className="next-step-label">下一步:</span>
                            <span className="next-step-text">{nextPendingItem.text}</span>
                          </div>
                        )}

                        {/* Footer: Tags + Update Time */}
                        <div className="checklist-item-footer">
                          <div className="checklist-tags-row">
                            {checklist.tags.slice(0, 2).map((t) => (
                              <span key={t} className="tag mini">
                                #{t}
                              </span>
                            ))}
                            {checklist.tags.length > 2 && (
                              <span className="tag mini more-tags">+{checklist.tags.length - 2}</span>
                            )}
                          </div>
                          <span className="checklist-update-time">
                            {formatRelative(checklist.updatedAt)}
                          </span>
                        </div>
                      </SelectableListItem>
                      <div className="checklist-card-actions">
                        <button
                          type="button"
                          className="checklist-card-action-btn"
                          onClick={() => void handleDuplicate(checklist)}
                          title="复制此清单"
                          aria-label={`复制清单 ${checklist.title}`}
                        >
                          ⎘
                        </button>
                        <button
                          type="button"
                          className={`star-button mini ${checklist.favorite ? "is-favorite" : ""}`}
                          onClick={() => toggleFavoriteChecklist(checklist)}
                          title={checklist.favorite ? "取消星标" : "标记星标"}
                          aria-label={`${checklist.favorite ? "取消星标" : "标记星标"} ${checklist.title}`}
                          aria-pressed={checklist.favorite}
                        >
                          {checklist.favorite ? "★" : "☆"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right Side: Checklist Detail & Editor */}
        {selected ? (
          <ChecklistEditor
            key={selected.id}
            checklist={selected}
            onUpdate={onUpdate}
            onArchive={onArchive}
            onMoveSpace={onMoveSpace}
            onDelete={onDelete}
            onDuplicate={handleDuplicate}
            onNotify={showToast}
          />
        ) : (
          <EmptyState size="placeholder" className="project-detail-placeholder">
            <div className="placeholder-glyph">📋</div>
            <h3>选择一份清单</h3>
            <p>从左侧打开，开始逐项完成，或点击下方创建新清单。</p>
            <Button variant="primary" onClick={() => onCreate("checklist")}>
              ＋ 创建新清单
            </Button>
          </EmptyState>
        )}
      </div>
    </div>
  );
}

/* Checklist Workspace & Editor */
function ChecklistEditor({
  checklist,
  onUpdate,
  onArchive,
  onMoveSpace,
  onDelete,
  onDuplicate,
  onNotify,
}: {
  checklist: Checklist;
  onUpdate: (checklist: Checklist) => void;
  onArchive: (checklist: Checklist) => void;
  onMoveSpace: (checklist: Checklist, space: ContentSpace) => void | Promise<unknown>;
  onDelete: (checklist: Checklist) => Promise<void>;
  onDuplicate: (checklist: Checklist) => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const [title, setTitle] = useState(checklist.title);
  const [description, setDescription] = useState(checklist.description);
  const [tags, setTags] = useState(checklist.tags.join(" "));
  const [favorite, setFavorite] = useState(checklist.favorite);
  const [items, setItems] = useState<ChecklistItem[]>(checklist.items);
  const [newItem, setNewItem] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setTitle(checklist.title);
    setDescription(checklist.description);
    setTags(checklist.tags.join(" "));
    setFavorite(checklist.favorite);
    setItems(checklist.items);
    setIsDirty(false);
  }, [checklist.id, checklist.title, checklist.description, checklist.tags, checklist.favorite, checklist.items]);

  const stats = useMemo(() => {
    return calculateChecklistStats({ ...checklist, items });
  }, [checklist, items]);

  // Synchronize save to parent
  const saveAll = (
    overrideItems?: ChecklistItem[],
    overrideTitle?: string,
    overrideDesc?: string,
    overrideTags?: string,
    overrideFav?: boolean
  ) => {
    const finalItems = overrideItems ?? items;
    const finalTitle = (overrideTitle ?? title).trim() || checklist.title;
    const finalDesc = overrideDesc ?? description;
    const finalTags = overrideTags !== undefined ? parseTags(overrideTags) : checklist.tags;
    const finalFav = overrideFav !== undefined ? overrideFav : favorite;

    onUpdate({
      ...checklist,
      title: finalTitle,
      description: finalDesc,
      items: finalItems.map((item, index) => ({ ...item, position: index })),
      tags: finalTags,
      favorite: finalFav,
    });
    setIsDirty(false);
  };

  // Immediate toggle item checkbox (auto-saves instantly!)
  const toggleItem = (index: number) => {
    const next = items.map((item, i) =>
      i === index ? { ...item, completed: !item.completed } : item
    );
    setItems(next);
    saveAll(next);
  };

  const updateItemText = (index: number, text: string) => {
    setIsDirty(true);
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, text } : item))
    );
  };

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    const next = [
      ...items,
      {
        id: crypto.randomUUID(),
        text,
        completed: false,
        position: items.length,
      },
    ];
    setItems(next);
    setNewItem("");
    saveAll(next);
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    const reindexed = next.map((item, itemIndex) => ({ ...item, position: itemIndex }));
    setItems(reindexed);
    saveAll(reindexed);
  };

  const deleteItem = (index: number) => {
    const next = items
      .filter((_, itemIndex) => itemIndex !== index)
      .map((item, idx) => ({ ...item, position: idx }));
    setItems(next);
    saveAll(next);
  };

  // Handle keyboard navigation in item list
  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Insert empty item right below current index and focus it
      const next = [...items];
      const newItemObj: ChecklistItem = {
        id: crypto.randomUUID(),
        text: "",
        completed: false,
        position: index + 1,
      };
      next.splice(index + 1, 0, newItemObj);
      const reindexed = next.map((item, itemIndex) => ({ ...item, position: itemIndex }));
      setItems(reindexed);
      setIsDirty(true);
      setTimeout(() => {
        inputRefs.current[index + 1]?.focus();
      }, 50);
    } else if (e.key === "Backspace" && items[index]?.text === "") {
      e.preventDefault();
      deleteItem(index);
      setTimeout(() => {
        const prevIndex = Math.max(0, index - 1);
        inputRefs.current[prevIndex]?.focus();
      }, 50);
    }
  };

  // Check all items
  const handleCheckAll = () => {
    const next = toggleAllChecklistItems(items, true);
    setItems(next);
    saveAll(next);
    onNotify("已将所有事项标记为完成");
  };

  // Reset all items (uncheck all)
  const handleResetAll = () => {
    const next = toggleAllChecklistItems(items, false);
    setItems(next);
    saveAll(next);
    onNotify("已重置所有事项为未完成");
  };

  // Remove completed items
  const handleRemoveCompleted = () => {
    const next = removeCompletedChecklistItems(items);
    setItems(next);
    saveAll(next);
    onNotify(`已清除已完成事项，保留 ${next.length} 项`);
  };

  // Copy as Markdown
  const handleCopyMarkdown = async () => {
    const md = exportChecklistToMarkdown({
      ...checklist,
      title,
      description,
      tags: parseTags(tags),
      items,
    });
    try {
      await navigator.clipboard.writeText(md);
      onNotify("已复制清单 Markdown 到剪贴板！");
    } catch (err) {
      console.error("Clipboard write error:", err);
    }
  };

  // Bulk add submit
  const handleBulkAddSubmit = () => {
    if (!bulkText.trim()) {
      setShowBulkAdd(false);
      return;
    }
    const newParsed = parseChecklistItemsFromText(bulkText, items.length);
    if (newParsed.length > 0) {
      const next = [...items, ...newParsed].map((item, idx) => ({ ...item, position: idx }));
      setItems(next);
      saveAll(next);
      setBulkText("");
      setShowBulkAdd(false);
      onNotify(`成功批量添加 ${newParsed.length} 个事项！`);
    } else {
      setShowBulkAdd(false);
    }
  };

  return (
    <section className="checklist-editor list-panel">
      {/* Top Header & Toolbar */}
      <div className="checklist-editor-heading">
        <div className="heading-title-group">
          <span className="card-kicker">
            {checklist.space === "personal" ? "个人空间" : "工作空间"} · Checklist
          </span>
          <h2>{title || "未命名清单"}</h2>
        </div>

        <div className="editor-actions">
          <button
            type="button"
            className={`star-button large ${favorite ? "is-favorite" : ""}`}
            onClick={() => {
              const nextFav = !favorite;
              setFavorite(nextFav);
              saveAll(undefined, undefined, undefined, undefined, nextFav);
            }}
            title={favorite ? "取消星标" : "标记星标"}
          >
            {favorite ? "★" : "☆"}
          </button>

          <Button variant="subtle" size="small"
           
            onClick={() => void onDuplicate(checklist)}
            title="创建此清单的副本"
          >
            ⧉ 复制
          </Button>

          <SpaceMoveButton
            space={checklist.space}
            onMove={(nextSpace) =>
              onMoveSpace(
                {
                  ...checklist,
                  title: title.trim() || checklist.title,
                  description,
                  items: items.map((item, index) => ({ ...item, position: index })),
                  tags: parseTags(tags),
                  favorite,
                },
                nextSpace,
              )
            }
          />
          <Button variant="subtle" size="small"
           
            onClick={() => onArchive(checklist)}
            title="归档清单"
          >
            归档
          </Button>

          <Button variant="danger" size="small"
           
            onClick={() => void onDelete(checklist)}
            title="删除清单"
          >
            删除
          </Button>

          <Button variant="primary" className={`compact ${isDirty ? "highlight-save" : ""}`}
           
            onClick={() => saveAll()}
          >
            {isDirty ? "保存更改 *" : "已保存"}
          </Button>
        </div>
      </div>

      {/* Title & Description Inputs */}
      <div className="checklist-meta-fields">
        <TextField
          className="checklist-title-input"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setIsDirty(true);
          }}
          onBlur={() => saveAll(undefined, title)}
          placeholder="输入清单标题..."
        />

        <TextArea
          className="checklist-description-input"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setIsDirty(true);
          }}
          onBlur={() => saveAll(undefined, undefined, description)}
          placeholder="给这份清单加一点说明，例如使用场景、执行规范等..."
          rows={2}
        />

        <TextField
          className="checklist-tags-input"
          value={tags}
          onChange={(e) => {
            setTags(e.target.value);
            setIsDirty(true);
          }}
          onBlur={() => saveAll(undefined, undefined, undefined, tags)}
          placeholder="标签，例如：#发布 #部署 #例行"
        />
      </div>

      {/* Progress & Celebration Bar */}
      <div className="checklist-progress-card">
        <div className="progress-info-row">
          <span className="progress-text">
            完成进度: <strong>{stats.completedItems} / {stats.totalItems} 项</strong> ({stats.completionRate}%)
          </span>
          {stats.isAllCompleted && (
            <span className="all-completed-banner">🎉 所有事项已全部达成！</span>
          )}
        </div>
        <div className="progress-track large">
          <div
            className={`progress-fill ${stats.isAllCompleted ? "green" : ""}`}
            style={{ width: `${stats.completionRate}%` }}
          />
        </div>
      </div>

      {/* Quick Checklist Actions Toolbar */}
      <div className="checklist-quick-toolbar">
        <div className="toolbar-left">
          <button
            type="button"
            className="mini-action-btn"
            onClick={handleCheckAll}
            title="将全部事项勾选为完成"
          >
            <CheckIcon mini className="inline-check-icon mini" /> 全部勾选
          </button>
          <button
            type="button"
            className="mini-action-btn"
            onClick={handleResetAll}
            title="全部取消勾选，方便再次执行"
          >
            ↺ 全部重置
          </button>
          {stats.completedItems > 0 && (
            <button
              type="button"
              className="mini-action-btn"
              onClick={handleRemoveCompleted}
              title="删除已完成的事项"
            >
              🗑 清除已完成
            </button>
          )}
        </div>

        <div className="toolbar-right">
          <button
            type="button"
            className="mini-action-btn"
            onClick={handleCopyMarkdown}
            title="复制为 Markdown 格式 (- [ ] ...)"
          >
            📋 复制 Markdown
          </button>
          <button
            type="button"
            className={`mini-action-btn ${showBulkAdd ? "is-active" : ""}`}
            onClick={() => setShowBulkAdd(!showBulkAdd)}
            title="多行粘贴批量导入事项"
          >
            ▤ 批量添加
          </button>
        </div>
      </div>

      {/* Bulk Add Drawer / Panel */}
      {showBulkAdd && (
        <div className="bulk-add-panel">
          <div className="bulk-add-heading">
            <strong>批量添加事项</strong>
            <small className="muted">
              每行将识别为一个事项，支持自动剥离 “- [ ]”、“1. ” 等符号
            </small>
          </div>
          <TextArea
            className="bulk-add-textarea"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`粘贴多行文本，例如：\n- 检查配置文件\n- 运行数据备份\n- 验证服务运行状态`}
            rows={5}
            autoFocus
          />
          <div className="bulk-add-actions">
            <span className="bulk-preview-count">
              {parseChecklistItemsFromText(bulkText).length} 个有效事项待导入
            </span>
            <Button variant="secondary" className="compact"
             
              onClick={() => setShowBulkAdd(false)}
            >
              取消
            </Button>
            <Button variant="primary" className="compact"
             
              onClick={handleBulkAddSubmit}
              disabled={!bulkText.trim()}
            >
              导入为事项
            </Button>
          </div>
        </div>
      )}

      {/* Checklist Items List */}
      <div className="checklist-items">
        {items.length === 0 ? (
          <div className="items-empty-hint">
            <p>清单目前还没有具体事项，在下方输入框添加或点击“批量添加”</p>
          </div>
        ) : (
          items.map((item, index) => (
            <div
              className={`checklist-row ${item.completed ? "is-complete" : ""}`}
              key={item.id ? `${item.id}-${index}` : `item-${index}`}
            >
              <button
                type="button"
                className={`checklist-checkbox ${item.completed ? "checked" : ""}`}
                onClick={() => toggleItem(index)}
                aria-label={item.completed ? "取消完成" : "标记完成"}
              >
                <CheckIcon />
              </button>

              <TextField
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                value={item.text}
                onChange={(event) => updateItemText(index, event.target.value)}
                onBlur={() => saveAll()}
                onKeyDown={(e) => handleItemKeyDown(e, index)}
                placeholder="事项内容..."
              />

              <div className="checklist-row-actions">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                  title="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                  title="下移"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="delete-item-btn"
                  onClick={() => deleteItem(index)}
                  title="删除事项"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Add Row at bottom */}
      <div className="checklist-add-row">
        <TextField
          value={newItem}
          onChange={(event) => setNewItem(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
          placeholder="添加一项，按 Enter 确认..."
        />
        <Button variant="secondary"
         
          onClick={addItem}
          disabled={!newItem.trim()}
        >
          ＋ 添加
        </Button>
      </div>
    </section>
  );
}

