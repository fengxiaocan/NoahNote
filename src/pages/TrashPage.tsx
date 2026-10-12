import { Button, EmptyState } from "../components/ui";
import { formatRelative } from "../lib/format";
import type { Space, TrashItem } from "../types";
import { PageHeader } from "../components/PageHeader";
import { useAppDialogs } from "../components/AppDialogs";

interface TrashPageProps {
  space: Space;
  retentionDays: number;
  items: TrashItem[];
  onRestore: (item: TrashItem) => Promise<void>;
  onDelete: (item: TrashItem) => Promise<void>;
  onPurge: () => Promise<void>;
}

const kindLabels: Record<string, string> = {
  note: "笔记", task: "任务", project: "项目", inbox: "Inbox", event: "日程", checklist: "Checklist", template: "模板", knowledge_page: "知识库页面", knowledge_folder: "知识库目录",
};

export function TrashPage({ space, retentionDays, items, onRestore, onDelete, onPurge }: TrashPageProps) {
  const { confirm } = useAppDialogs();
  const label = space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间";
  return <div className="page-stack trash-page"><PageHeader eyebrow="最后一道保险" title="回收站" description={label + " · 删除内容默认保留 " + retentionDays + " 天"} action={<Button variant="secondary" onClick={onPurge}>清理已过期内容</Button>} /><section className="list-panel trash-panel"><div className="list-panel-heading"><span>{items.length} 个待处理内容</span><span className="muted">恢复后回到原空间</span></div>{items.length === 0 ? <EmptyState size="large"><div className="large-empty-icon">♧</div><h3>回收站是空的</h3><p>删除的内容会先来到这里，不会立即消失。</p></EmptyState> : <div className="trash-list">{items.map((item) => <div className="trash-row" key={item.id}><span className="trash-kind">{kindLabels[item.kind] ?? item.kind}</span><div className="trash-copy"><strong>{item.title}</strong><small>删除于 {formatRelative(item.deletedAt)} · 预计清理 {formatRelative(item.purgeAt)}</small></div><div className="trash-actions"><Button size="small" variant="secondary" onClick={() => onRestore(item)}>恢复</Button><Button size="small" variant="danger" onClick={async () => { if (await confirm({ title: "永久删除内容", message: `永久删除“${item.title}”？此操作无法恢复。`, confirmLabel: "永久删除", tone: "danger" })) void onDelete(item); }}>永久删除</Button></div></div>)}</div>}</section></div>;
}
