import { Button } from "./ui";
import { useEffect, useState } from "react";
import { api, isTauri } from "../lib/api";
import { formatRelative } from "../lib/format";
import { MarkdownPreview } from "./MarkdownPreview";
import { useAppDialogs } from "./AppDialogs";
import type { DocumentKind, DocumentVersion } from "../types";

interface VersionHistoryPanelProps {
  id: string;
  kind: DocumentKind;
  currentContent: string;
  onRestore: (versionId: string) => Promise<void>;
}

export function VersionHistoryPanel({ id, kind, currentContent, onRestore }: VersionHistoryPanelProps) {
  const { confirm } = useAppDialogs();
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (!isTauri()) {
      setVersions([]);
      return;
    }
    let active = true;
    void api.listVersions(id, kind).then((next) => {
      if (active) {
        setVersions(next);
        setSelectedId(next[0]?.id ?? null);
      }
    }).catch(() => { if (active) setVersions([]); });
    return () => { active = false; };
  }, [id, kind]);
  const selected = versions.find((version) => version.id === selectedId) ?? null;
  const restore = async () => {
    if (!selected || !await confirm({ title: "恢复历史版本", message: `恢复“${selected.title}”在 ${formatRelative(selected.createdAt)} 的版本？当前内容会被替换。`, confirmLabel: "恢复版本" })) return;
    setRestoring(true);
    try {
      await onRestore(selected.id);
    } finally {
      setRestoring(false);
    }
  };
  return <section className="version-panel">
    <div className="version-panel-heading"><div><span className="card-kicker">版本历史</span><strong>{versions.length} 个版本</strong></div>{selected ? <Button size="small" variant="secondary" onClick={restore} disabled={restoring}>{restoring ? "恢复中…" : "恢复此版本"}</Button> : null}</div>
    {versions.length === 0 ? <p className="muted">保存后会在这里留下版本快照。</p> : <div className="version-layout"><div className="version-list">{versions.map((version) => <button className={`version-item ${version.id === selectedId ? "is-selected" : ""}`} key={version.id} onClick={() => setSelectedId(version.id)}><strong>修订 {version.revision}</strong><small>{formatRelative(version.createdAt)}</small></button>)}</div><div className="version-preview">{selected ? <><div className="version-preview-heading"><span>{selected.title}</span><small>{selected.content === currentContent ? "当前内容" : "历史内容"}</small></div><MarkdownPreview content={selected.content || "（空内容）"} /></> : <p className="muted">选择一个版本查看内容。</p>}</div></div>}
  </section>;
}
