import { useEffect, useMemo, useState } from "react";
import type { InboxItem, SparkStage, Space } from "../types";
import { formatRelative } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import type { CreateKind } from "../components/Modal";

type SparkFilter = "all" | SparkStage;

interface SparksPageProps {
  space: Space;
  items: InboxItem[];
  selectedId: string | null;
  onCreate: (kind: CreateKind) => void;
  onStageChange: (item: InboxItem, stage: SparkStage) => void;
  onArchive: (item: InboxItem) => void;
  onDelete: (item: InboxItem) => Promise<void>;
  onMove: (item: InboxItem, space: "personal" | "work") => void;
  onPromote: (item: InboxItem, target: "note" | "task") => void;
}

const stageLabels: Record<SparkStage, string> = {
  new: "刚想到",
  developing: "发酵中",
  converted: "已转行动",
};

const stageDescriptions: Record<SparkStage, string> = {
  new: "先保留这份新鲜感",
  developing: "值得再多想一步",
  converted: "已经落到笔记或任务",
};

const filters: Array<{ id: SparkFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "new", label: "刚想到" },
  { id: "developing", label: "发酵中" },
  { id: "converted", label: "已转行动" },
];

export function SparksPage({ space, items, selectedId, onCreate, onStageChange, onArchive, onDelete, onMove, onPromote }: SparksPageProps) {
  const [filter, setFilter] = useState<SparkFilter>("all");
  const visibleItems = useMemo(
    () => filter === "all" ? items : items.filter((item) => stageOf(item) === filter),
    [filter, items],
  );
  const spaceLabel = space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间";
  useEffect(() => {
    if (!selectedId || !items.some((item) => item.id === selectedId)) return;
    document.getElementById(`spark-${selectedId}`)?.scrollIntoView({ block: "center" });
  }, [items, selectedId]);

  return (
    <div className="page-stack narrow-page sparks-page">
      <PageHeader
        eyebrow="捕捉灵感，留给未来"
        title="思维灵光"
        description={`${spaceLabel} · 不急着整理成完整笔记，先把脑海里闪过的东西留下来。`}
        action={<button type="button" className="button primary" onClick={() => onCreate("spark")}>✦ 记录灵光</button>}
      />

      <section className="spark-intro">
        <div className="spark-intro-mark">✦</div>
        <div>
          <strong>灵感不用在出现的瞬间变得完整</strong>
          <p>先记下核心，再决定它要继续发酵，还是变成一条笔记或一个下一步。</p>
        </div>
        <div className="spark-intro-stats">
          <strong>{items.length}</strong>
          <span>条灵光</span>
        </div>
      </section>

      <div className="task-toolbar spark-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="灵光状态筛选">
          {filters.map((item) => {
            const count = item.id === "all" ? items.length : items.filter((spark) => stageOf(spark) === item.id).length;
            return <button type="button" className={filter === item.id ? "is-active" : ""} key={item.id} onClick={() => setFilter(item.id)} role="tab" aria-selected={filter === item.id}>{item.label}<span>{count}</span></button>;
          })}
        </div>
        <span className="muted">按最近记录排序</span>
      </div>

      <section className="list-panel">
        <div className="list-panel-heading"><span>{filter === "all" ? "全部灵光" : stageLabels[filter]}</span><span className="muted">{visibleItems.length} 条</span></div>
        {visibleItems.length === 0 ? (
          <div className="large-empty">
            <div className="large-empty-icon">✦</div>
            <h3>{filter === "all" ? "还没有记录灵光" : `暂无“${stageLabels[filter]}”的想法`}</h3>
            <p>{filter === "all" ? "下一次想到什么，先把它留在这里。" : stageDescriptions[filter]}</p>
            <button type="button" className="button secondary" onClick={() => onCreate("spark")}>记录一条灵光</button>
          </div>
        ) : (
          <div className="spark-list">
            {visibleItems.map((item) => {
              const stage = stageOf(item);
              return (
                <article
                  id={`spark-${item.id}`}
                  className={`spark-card ${stage} ${item.id === selectedId ? "is-selected" : ""}`}
                  key={item.id}
                >
                  <div className="spark-card-header">
                    <div className="spark-card-header-left">
                      <span className="spark-symbol" aria-hidden="true">
                        ✦
                      </span>
                      <span className={`spark-stage ${stage}`}>{stageLabels[stage]}</span>
                      <span className="spark-space-pill">
                        {item.space === "personal" ? "个人" : "工作"}
                      </span>
                    </div>
                    <div className="spark-card-header-right">
                      <label className="spark-stage-control">
                        <span>状态:</span>
                        <select
                          aria-label={`修改“${item.title}”的状态`}
                          value={stage}
                          onChange={(event) =>
                            onStageChange(item, event.target.value as SparkStage)
                          }
                        >
                          {filters
                            .filter((option) => option.id !== "all")
                            .map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                        </select>
                      </label>
                      <time>{formatRelative(item.createdAt)}</time>
                    </div>
                  </div>

                  <h3 className="spark-card-title">{item.title}</h3>
                  {item.body ? <p className="spark-card-body">{item.body}</p> : null}

                  <div className="spark-card-footer">
                    <div className="spark-tags-group">
                      {item.tags.map((tag) => (
                        <span className="tag mini" key={tag}>
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="spark-card-actions">
                      {stage !== "converted" ? (
                        <>
                          <button
                            type="button"
                            className="small-button"
                            onClick={() => onPromote(item, "task")}
                          >
                            转为任务
                          </button>
                          <button
                            type="button"
                            className="small-button"
                            onClick={() => onPromote(item, "note")}
                          >
                            转为笔记
                          </button>
                        </>
                      ) : (
                        <span className="spark-converted-hint">✓ 已转为行动</span>
                      )}
                      {item.space !== "personal" && (
                        <button
                          type="button"
                          className="small-button subtle"
                          onClick={() => onMove(item, "personal")}
                        >
                          移到个人
                        </button>
                      )}
                      {item.space !== "work" && (
                        <button
                          type="button"
                          className="small-button subtle"
                          onClick={() => onMove(item, "work")}
                        >
                          移到工作
                        </button>
                      )}
                      <button
                        type="button"
                        className="small-button subtle"
                        onClick={() => onArchive(item)}
                      >
                        归档
                      </button>
                      <button
                        type="button"
                        className="small-button subtle danger"
                        onClick={() => void onDelete(item)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function stageOf(item: InboxItem): SparkStage {
  return item.sparkStage ?? "new";
}
