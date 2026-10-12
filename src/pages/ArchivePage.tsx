import { Button, SegmentButton, SegmentedControl, EmptyState } from "../components/ui";
import { useEffect, useMemo, useState } from "react";
import type { ContentSpace, Space } from "../types";
import { formatRelative } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";

export interface ArchiveEntry {
  id: string;
  kind: string;
  title: string;
  detail: string;
  space: ContentSpace;
  updatedAt: string;
  onRestore: () => void | Promise<unknown>;
  onMove: (space: ContentSpace) => void | Promise<unknown>;
}

interface ArchivePageProps {
  space: Space;
  entries: ArchiveEntry[];
}

export function ArchivePage({ space, entries }: ArchivePageProps) {
  const [filter, setFilter] = useState("all");
  const filters = useMemo(() => [...new Set(entries.map((entry) => entry.kind))], [entries]);
  const visible = useMemo(() => filter === "all" ? entries : entries.filter((entry) => entry.kind === filter), [entries, filter]);
  const spaceLabel = space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间";
  useEffect(() => {
    if (filter !== "all" && !filters.includes(filter)) setFilter("all");
  }, [filter, filters]);

  return <div className="page-stack archive-page">
    <PageHeader eyebrow="归档内容集中管理" title="归档空间" description={spaceLabel + " · 查看归档的内容，并可恢复到原来的列表"} />
    <section className="list-panel archive-panel">
      <SegmentedControl className="archive-filters" label="归档类型筛选">
        <SegmentButton selected={filter === "all"} onClick={() => setFilter("all")}>全部<span>{entries.length}</span></SegmentButton>
        {filters.map((kind) => {
          const count = entries.filter((entry) => entry.kind === kind).length;
          return <SegmentButton selected={filter === kind} key={kind} onClick={() => setFilter(kind)}>{kind}<span>{count}</span></SegmentButton>;
        })}
      </SegmentedControl>
      <div className="list-panel-heading"><span>{visible.length} 项归档内容</span><span className="muted">已归档内容仍保存在工作区</span></div>
      {visible.length === 0 ? <EmptyState size="large"><div className="large-empty-icon">▱</div><h3>{entries.length === 0 ? "这里还没有归档内容" : "没有符合条件的内容"}</h3><p>{entries.length === 0 ? "归档的任务、笔记、清单等内容会集中出现在这里。" : "切换类别查看其他归档内容。"}</p></EmptyState> : <div className="archive-list">{visible.map((entry) => <article className="archive-row" key={entry.kind + ":" + entry.id}>
        <span className="archive-type">{entry.kind}</span>
        <div className="archive-copy"><strong>{entry.title || "无标题"}</strong><small>{[entry.detail, entry.space === "personal" ? "个人空间" : "工作空间", formatRelative(entry.updatedAt)].filter(Boolean).join(" · ")}</small></div>
        <div className="archive-actions"><SpaceMoveButton space={entry.space} onMove={entry.onMove} /><Button size="small" variant="secondary" onClick={() => void Promise.resolve(entry.onRestore()).catch(() => undefined)}>恢复</Button></div>
      </article>)}</div>}
    </section>
  </div>;
}
