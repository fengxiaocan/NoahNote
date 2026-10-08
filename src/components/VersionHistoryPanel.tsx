import { useEffect, useState } from "react";
import { api, isTauri } from "../lib/api";
import { formatRelative } from "../lib/format";
import { MarkdownPreview } from "./MarkdownPreview";
import { mergeVersionsWithSaveRecords } from "../lib/saveHistory";
import type { DocumentKind, DocumentVersion, SaveRecord } from "../types";

interface VersionHistoryPanelProps {
  id: string;
  kind: DocumentKind;
  currentContent: string;
  onRestore: (versionId: string) => Promise<void>;
  refreshTrigger?: number | string;
  onOpenRecordsModal?: () => void;
}

export function VersionHistoryPanel({
  id,
  kind,
  currentContent,
  onRestore,
  refreshTrigger,
  onOpenRecordsModal,
}: VersionHistoryPanelProps) {
  const [records, setRecords] = useState<SaveRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchVersions = async () => {
      try {
        let backendVersions: DocumentVersion[] = [];
        if (isTauri()) {
          backendVersions = await api.listVersions(id, kind);
        }
        if (!active) return;
        const merged = mergeVersionsWithSaveRecords(backendVersions, id);
        setRecords(merged);
        setSelectedId((curr) => {
          if (curr && merged.some((m) => m.id === curr)) return curr;
          return merged[0]?.id ?? null;
        });
      } catch {
        if (!active) return;
        const localOnly = mergeVersionsWithSaveRecords([], id);
        setRecords(localOnly);
        setSelectedId(localOnly[0]?.id ?? null);
      }
    };

    void fetchVersions();
    return () => {
      active = false;
    };
  }, [id, kind, refreshTrigger]);

  const selected = records.find((version) => version.id === selectedId) ?? null;

  const restore = async () => {
    if (!selected) return;
    const typeLabel = selected.saveType === "auto" ? "定时自动保存" : "手动保存";
    if (
      !window.confirm(
        `恢复“${selected.title}”在 ${formatRelative(selected.createdAt)} 的版本（${typeLabel} · 修订 ${selected.revision}）？`
      )
    ) {
      return;
    }
    setRestoring(true);
    try {
      await onRestore(selected.id);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <section className="version-panel">
      <div className="version-panel-heading">
        <div>
          <span className="card-kicker">版本与保存记录</span>
          <strong>{records.length} 个历史快照</strong>
        </div>
        <div className="version-panel-actions">
          {onOpenRecordsModal && (
            <button
              type="button"
              className="small-button subtle"
              onClick={onOpenRecordsModal}
              title="打开完整保存记录与版本详情"
            >
              🕒 打开保存记录面板
            </button>
          )}
          {selected ? (
            <button
              type="button"
              className="small-button"
              onClick={restore}
              disabled={restoring}
            >
              {restoring ? "恢复中…" : "恢复此版本"}
            </button>
          ) : null}
        </div>
      </div>

      {records.length === 0 ? (
        <p className="muted">保存后会在这里留下自动与手动保存记录。</p>
      ) : (
        <div className="version-layout">
          <div className="version-list">
            {records.map((version) => (
              <button
                type="button"
                className={`version-item ${version.id === selectedId ? "is-selected" : ""}`}
                key={version.id}
                onClick={() => setSelectedId(version.id)}
              >
                <div className="version-item-title-row">
                  <strong>修订 {version.revision}</strong>
                  <span
                    className={`save-type-badge-mini ${
                      version.saveType === "auto" ? "is-auto" : "is-manual"
                    }`}
                  >
                    {version.saveType === "auto" ? "自动" : "手动"}
                  </span>
                </div>
                <small title={version.createdAt}>
                  {formatRelative(version.createdAt)} · {version.charCount} 字
                </small>
              </button>
            ))}
          </div>
          <div className="version-preview">
            {selected ? (
              <>
                <div className="version-preview-heading">
                  <div>
                    <span>{selected.title || "无标题"}</span>
                    <span
                      className={`save-type-badge-mini version-preview-badge ${
                        selected.saveType === "auto" ? "is-auto" : "is-manual"
                      }`}
                    >
                      {selected.saveType === "auto" ? "定时自动保存" : "手动保存"}
                    </span>
                  </div>
                  <small>
                    {selected.content === currentContent
                      ? "当前内容"
                      : `${selected.charCount} 字符`}
                  </small>
                </div>
                <MarkdownPreview content={selected.content || "（空内容）"} />
              </>
            ) : (
              <p className="muted">选择一个版本查看内容。</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
