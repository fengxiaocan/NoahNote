import { Button, EmptyState, LoadingState, SelectableListItem } from "../components/ui";
import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { AiPanel } from "../components/AiPanel";
import { useAppDialogs } from "../components/AppDialogs";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import { api, isTauri } from "../lib/api";
import { formatDate, formatRelative } from "../lib/format";
import type { ContentSpace, PdfDocument, SearchResult, Space } from "../types";

interface DocumentsPageProps {
  space: Space;
  documents: PdfDocument[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onImport: (sourcePath: string, space: "personal" | "work") => Promise<void>;
  onExport: (document: PdfDocument, targetPath: string) => Promise<void>;
  onOcr: (document: PdfDocument) => Promise<void>;
  onDelete: (document: PdfDocument) => Promise<void>;
  onMoveSpace: (document: PdfDocument, space: ContentSpace) => Promise<unknown>;
}

export function DocumentsPage({ space, documents, selectedId, onSelect, onImport, onExport, onOcr, onDelete, onMoveSpace }: DocumentsPageProps) {
  const { confirm } = useAppDialogs();
  const [pdfData, setPdfData] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const selected = documents.find((document) => document.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && documents.some((document) => document.id === selectedId)) return;
    onSelect(documents[0]?.id ?? null);
  }, [documents, onSelect, selectedId]);

  useEffect(() => {
    if (!selectedId || !isTauri()) {
      setPdfData("");
      return;
    }
    let active = true;
    setPreviewLoading(true);
    void api.readPdf(selectedId).then((data) => {
      if (active) setPdfData(data);
    }).catch(() => {
      if (active) setPdfData("");
    }).finally(() => {
      if (active) setPreviewLoading(false);
    });
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (!semanticQuery.trim() || !isTauri()) {
      setSemanticResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      void api.semanticSearch(semanticQuery, space).then(setSemanticResults).catch(() => setSemanticResults([])).finally(() => setSearching(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [semanticQuery, space]);

  const importSpace = space === "all" ? "personal" : space;
  const textPreview = useMemo(() => selected?.extractedText.trim() || "暂无可检索文本。可在设置中启用本地 OCR。", [selected]);

  const importPdf = async () => {
    if (!isTauri()) return;
    const selectedPath = await open({ multiple: false, directory: false, title: "选择 PDF 文件", filters: [{ name: "PDF", extensions: ["pdf"] }] });
    const sourcePath = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
    if (sourcePath) await onImport(sourcePath, importSpace);
  };

  const exportPdf = async () => {
    if (!selected || !isTauri()) return;
    const target = await save({ defaultPath: selected.fileName, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (target) await onExport(selected, target);
  };

  return <div className="page-stack documents-page">
    <PageHeader eyebrow="文件与检索" title="PDF 文档" description={`${documents.length} 份本地 PDF · 原文件、文本索引与 OCR 状态集中管理`} action={<Button type="button" variant="primary" onClick={() => void importPdf()}>＋ 导入 PDF</Button>} />
    <div className="semantic-search-bar"><span>⌕</span><input value={semanticQuery} onChange={(event) => setSemanticQuery(event.target.value)} placeholder="混合搜索标题、正文与语义相近内容…" /><small>{searching ? "搜索中…" : "离线语义 + FTS5"}</small></div>
    {semanticResults.length > 0 ? <div className="semantic-results">{semanticResults.slice(0, 6).map((result) => <button type="button" key={`${result.kind}-${result.id}`} onClick={() => result.kind === "pdf" && onSelect(result.id)}><span className={`result-type ${result.kind}`}>{result.kind === "pdf" ? "PDF" : "文"}</span><span><strong>{result.title}</strong><small>{result.snippet || "暂无摘要"}</small></span><em>{Math.round((result.score ?? 0) * 100)}%</em></button>)}</div> : null}
    <div className="documents-layout">
      <section className="documents-list-panel list-panel">
        <div className="list-panel-heading">
          <span>{documents.length} 份文档</span>
          <span className="muted">{space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间"}</span>
        </div>
        {documents.length === 0 ? (
          <EmptyState size="compact">
            <span>PDF</span>
            <p>还没有 PDF 文档</p>
            <Button type="button" variant="subtle" onClick={() => void importPdf()}>导入第一份 →</Button>
          </EmptyState>
        ) : (
          <div className="documents-list">
            {documents.map((document) => (
              <SelectableListItem
                className="document-list-item"
                key={document.id}
                selected={document.id === selectedId}
                onClick={() => onSelect(document.id)}
              >
                <div className="document-item-header">
                  <span className="document-icon">PDF</span>
                  <strong className="document-item-title" title={document.title}>
                    {document.title}
                  </strong>
                </div>
                <div className="document-item-footer">
                  <span className="document-item-meta">
                    {document.pageCount || "?"} 页 · {formatRelative(document.updatedAt)}
                  </span>
                  <em className={`ocr-status ${document.ocrStatus}`}>
                    {document.ocrStatus === "completed" ? "已 OCR" : document.ocrStatus === "failed" ? "失败" : "未 OCR"}
                  </em>
                </div>
              </SelectableListItem>
            ))}
          </div>
        )}
      </section>
      <section className="document-detail-panel list-panel">{selected ? <><div className="document-detail-heading"><div><span className="eyebrow">{selected.space === "personal" ? "个人" : "工作"} · {formatDate(selected.updatedAt, true)}</span><h2>{selected.title}</h2><p>{selected.fileName} · {formatBytes(selected.size)} · SHA-256 {selected.sha256.slice(0, 12)}…</p></div><div className="document-actions"><SpaceMoveButton space={selected.space} onMove={(nextSpace) => onMoveSpace(selected, nextSpace)} /><Button type="button" size="small" variant="subtle" onClick={() => void onOcr(selected)} disabled={selected.ocrStatus === "pending"}>本地 OCR</Button><Button type="button" size="small" variant="subtle" onClick={() => void exportPdf()}>导出</Button><Button type="button" size="small" variant="danger" onClick={async () => { if (await confirm({ title: "删除 PDF 文档", message: `删除“${selected.title}”？`, confirmLabel: "删除文档", tone: "danger" })) void onDelete(selected); }}>删除</Button></div></div><div className="pdf-preview">{previewLoading ? <LoadingState label="加载预览…" /> : pdfData ? <object data={`data:application/pdf;base64,${pdfData}`} type="application/pdf" aria-label={`${selected.title} PDF 预览`}><p>当前环境不支持内嵌预览，请点击导出。</p></object> : <EmptyState size="compact"><span>PDF</span><p>预览不可用</p></EmptyState>}</div><div className="document-text"><div className="section-kicker">文本索引</div><pre>{textPreview}</pre></div><AiPanel content={selected.extractedText} context={`文档标题：${selected.title}`} compact /></> : <EmptyState size="placeholder" className="editor-placeholder"><div className="placeholder-glyph">PDF</div><h3>选择一份 PDF</h3><p>导入后可预览原文件、查看文本抽取结果并执行本地 OCR。</p><Button type="button" variant="primary" onClick={() => void importPdf()}>＋ 导入 PDF</Button></EmptyState>}</section>
    </div>
  </div>;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
