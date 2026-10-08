import { useEffect, useState, useMemo } from "react";
import { api, isTauri } from "../lib/api";
import { formatRelative } from "../lib/format";
import { MarkdownPreview } from "./MarkdownPreview";
import {
  filterSaveRecords,
  mergeVersionsWithSaveRecords,
} from "../lib/saveHistory";
import type { DocumentKind, DocumentVersion, SaveRecord } from "../types";

interface SaveRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  entityKind: DocumentKind;
  entityTitle: string;
  currentContent: string;
  onRestore: (versionId: string) => Promise<void>;
  refreshTrigger?: number;
}

export function SaveRecordsModal({
  isOpen,
  onClose,
  entityId,
  entityKind,
  entityTitle,
  currentContent,
  onRestore,
  refreshTrigger = 0,
}: SaveRecordsModalProps) {
  const [records, setRecords] = useState<SaveRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "auto" | "manual">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");

  // Load and merge save records
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const fetchRecords = async () => {
      try {
        let backendVersions: DocumentVersion[] = [];
        if (isTauri()) {
          backendVersions = await api.listVersions(entityId, entityKind);
        }
        if (!active) return;
        const merged = mergeVersionsWithSaveRecords(backendVersions, entityId);
        setRecords(merged);
        setSelectedId((curr) => {
          if (curr && merged.some((m) => m.id === curr)) return curr;
          return merged[0]?.id ?? null;
        });
      } catch {
        if (!active) return;
        const localOnly = mergeVersionsWithSaveRecords([], entityId);
        setRecords(localOnly);
        setSelectedId(localOnly[0]?.id ?? null);
      }
    };

    void fetchRecords();

    return () => {
      active = false;
    };
  }, [isOpen, entityId, entityKind, refreshTrigger]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredRecords = useMemo(() => {
    return filterSaveRecords(records, activeFilter, searchQuery);
  }, [records, activeFilter, searchQuery]);

  const counts = useMemo(() => {
    const autoCount = records.filter((r) => r.saveType === "auto").length;
    const manualCount = records.filter((r) => r.saveType === "manual").length;
    return {
      all: records.length,
      auto: autoCount,
      manual: manualCount,
    };
  }, [records]);

  const selectedRecord = useMemo(() => {
    return records.find((r) => r.id === selectedId) ?? filteredRecords[0] ?? null;
  }, [records, selectedId, filteredRecords]);

  const handleCopyContent = () => {
    if (!selectedRecord) return;
    void navigator.clipboard.writeText(selectedRecord.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRestoreRecord = async () => {
    if (!selectedRecord) return;
    const timeStr = formatRelative(selectedRecord.createdAt);
    const typeLabel = selectedRecord.saveType === "auto" ? "定时自动保存" : "手动保存";
    const confirmMsg = `确定恢复到修订 ${selectedRecord.revision} (${typeLabel} · ${timeStr}) 的内容吗？\n当前编辑器的未保存修改将被覆盖。`;
    if (!window.confirm(confirmMsg)) return;

    setRestoring(true);
    try {
      await onRestore(selectedRecord.id);
      onClose();
    } finally {
      setRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card save-records-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-heading save-records-modal-heading">
          <div>
            <span className="eyebrow">版本与历史</span>
            <h2>保存记录与历史版本</h2>
            <p className="save-records-subtitle">
              笔记「{entityTitle || "无标题"}」共记录 {records.length} 次保存快照（含定时自动保存与手动保存）
            </p>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            title="关闭 (Esc)"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="modal-body save-records-modal-body">
          {/* Filter and Search Bar */}
        <div className="save-records-filter-bar">
          <div className="save-records-type-tabs">
            <button
              type="button"
              className={`save-tab-btn ${activeFilter === "all" ? "is-active" : ""}`}
              onClick={() => setActiveFilter("all")}
            >
              全部 ({counts.all})
            </button>
            <button
              type="button"
              className={`save-tab-btn ${activeFilter === "auto" ? "is-active" : ""}`}
              onClick={() => setActiveFilter("auto")}
            >
              🟢 自动保存 ({counts.auto})
            </button>
            <button
              type="button"
              className={`save-tab-btn ${activeFilter === "manual" ? "is-active" : ""}`}
              onClick={() => setActiveFilter("manual")}
            >
              🔵 手动保存 ({counts.manual})
            </button>
          </div>

          <div className="save-records-search">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="搜索历史记录标题或正文..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setSearchQuery("")}
                title="清空"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Main Records Layout */}
        {records.length === 0 ? (
          <div className="save-records-empty">
            <span className="empty-icon">🕒</span>
            <h3>暂无保存记录</h3>
            <p>当您在编辑正文或标题时，系统将自动定时保存并在此生成历史记录。</p>
          </div>
        ) : (
          <div className="save-records-layout">
            {/* Left Column: Timeline List */}
            <div className="save-records-timeline">
              <div className="timeline-header">
                <span>历史记录列表 ({filteredRecords.length})</span>
                <small>按时间倒序排列</small>
              </div>

              <div className="save-records-list">
                {filteredRecords.map((record) => {
                  const isSelected = record.id === selectedRecord?.id;
                  const isCurrent = record.content === currentContent;
                  const formattedTime = new Date(record.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                  const formattedDate = new Date(record.createdAt).toLocaleDateString([], {
                    month: "2-digit",
                    day: "2-digit",
                  });

                  return (
                    <div
                      key={record.id}
                      className={`save-record-item ${isSelected ? "is-selected" : ""} ${
                        isCurrent ? "is-current" : ""
                      }`}
                      onClick={() => setSelectedId(record.id)}
                    >
                      <div className="record-item-top">
                        <span
                          className={`save-type-badge ${
                            record.saveType === "auto" ? "is-auto" : "is-manual"
                          }`}
                        >
                          {record.saveType === "auto" ? "🟢 自动保存" : "🔵 手动保存"}
                        </span>
                        <strong className="revision-tag">Rev {record.revision}</strong>
                        {isCurrent && <span className="current-indicator">当前状态</span>}
                      </div>

                      <div className="record-item-meta">
                        <span className="record-time" title={record.createdAt}>
                          {formattedDate} {formattedTime} · {formatRelative(record.createdAt)}
                        </span>
                        <span className="record-stats">
                          {record.charCount} 字符 · {record.lineCount} 行
                        </span>
                      </div>

                      <div className="record-item-title">
                        {record.title || "无标题"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Preview & Action Box */}
            <div className="save-record-preview-panel">
              {selectedRecord ? (
                <>
                  <div className="record-preview-header">
                    <div className="preview-header-info">
                      <div className="preview-title-row">
                        <h3>
                          修订 {selectedRecord.revision}：{selectedRecord.title || "无标题"}
                        </h3>
                        <span
                          className={`save-type-badge ${
                            selectedRecord.saveType === "auto" ? "is-auto" : "is-manual"
                          }`}
                        >
                          {selectedRecord.saveType === "auto" ? "定时自动保存快照" : "手动保存快照"}
                        </span>
                      </div>

                      <div className="preview-meta-row">
                        <span>
                          保存时间：
                          {new Date(selectedRecord.createdAt).toLocaleString()} (
                          {formatRelative(selectedRecord.createdAt)})
                        </span>
                        <span>
                          字数统计：{selectedRecord.charCount} 字符 · {selectedRecord.lineCount} 行 · 约 {selectedRecord.wordCount} 词
                        </span>
                        {selectedRecord.content === currentContent ? (
                          <span className="diff-tag is-same">✓ 与当前编辑器完全一致</span>
                        ) : (
                          <span className="diff-tag is-diff">
                            字数差异：
                            {selectedRecord.charCount - currentContent.length > 0 ? "+" : ""}
                            {selectedRecord.charCount - currentContent.length} 字符
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="preview-header-actions">
                      <div className="view-mode-toggle">
                        <button
                          type="button"
                          className={`toggle-btn ${viewMode === "rendered" ? "is-active" : ""}`}
                          onClick={() => setViewMode("rendered")}
                          title="Markdown 预览效果"
                        >
                          渲染效果
                        </button>
                        <button
                          type="button"
                          className={`toggle-btn ${viewMode === "raw" ? "is-active" : ""}`}
                          onClick={() => setViewMode("raw")}
                          title="查看纯文本与 Markdown 源码"
                        >
                          源码文本
                        </button>
                      </div>

                      <button
                        type="button"
                        className="button secondary compact"
                        onClick={handleCopyContent}
                        title="复制该记录正文到剪贴板"
                      >
                        {copied ? "✓ 已复制" : "📋 复制正文"}
                      </button>

                      <button
                        type="button"
                        className="button primary compact"
                        onClick={handleRestoreRecord}
                        disabled={restoring}
                        title="将编辑器恢复至该保存记录"
                      >
                        {restoring ? "恢复中…" : "↺ 恢复到此版本"}
                      </button>
                    </div>
                  </div>

                  <div className="record-preview-body">
                    {viewMode === "rendered" ? (
                      <MarkdownPreview
                        content={selectedRecord.content || "（该记录内容为空）"}
                      />
                    ) : (
                      <pre className="record-raw-code">
                        <code>{selectedRecord.content || "（该记录内容为空）"}</code>
                      </pre>
                    )}
                  </div>
                </>
              ) : (
                <div className="preview-placeholder">
                  <p>请在左侧选择一条保存记录查看快照详情。</p>
                </div>
              )}
            </div>
          </div>
        )}
        </div>

        {/* Modal Footer */}
        <div className="modal-actions save-records-modal-actions">
          <div className="actions-hint">
            <span>💡 提示：开启定时自动保存后，任何修改都将持续沉淀历史快照，随时可一键撤销回退。</span>
          </div>
          <button type="button" className="button secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
