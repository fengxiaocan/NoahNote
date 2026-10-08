import { useState } from "react";
import { api, isTauri } from "../lib/api";
import type { AiRequest, AiResult } from "../types";

const operations: Array<{ id: AiRequest["operation"]; label: string }> = [
  { id: "summary", label: "摘要" },
  { id: "title", label: "标题" },
  { id: "tags", label: "标签" },
  { id: "meeting", label: "会议纪要" },
  { id: "tasks", label: "拆分任务" },
];

interface AiPanelProps {
  content: string;
  context?: string;
  compact?: boolean;
}

export function AiPanel({ content, context = "", compact = false }: AiPanelProps) {
  const [result, setResult] = useState<AiResult | null>(null);
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const run = async (operation: AiRequest["operation"]) => {
    if (!isTauri()) {
      setError("AI 操作需要在桌面应用中运行。");
      return;
    }
    if (!content.trim()) {
      setError("当前内容为空，暂时无法分析。");
      return;
    }
    setRunning(true);
    setError("");
    try {
      setResult(await api.runAi({ operation, content, context, question: operation === "qa" ? question : null }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  return <section className={`ai-panel ${compact ? "is-compact" : ""}`}>
    <div className="ai-panel-heading"><div><span className="eyebrow">可选能力</span><h3>AI 工作台</h3></div><span className="ai-local-badge">默认关闭 · 本地优先</span></div>
    <p className="ai-panel-description">只会发送你在设置中明确允许的内容；未启用 Provider 时不会发起请求。</p>
    <div className="ai-actions">{operations.map((operation) => <button type="button" className="small-button subtle" key={operation.id} onClick={() => void run(operation.id)} disabled={running || !content.trim()}>{running ? "处理中…" : operation.label}</button>)}</div>
    <div className="ai-question"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="AI 问答问题（按需填写）" /><button type="button" className="small-button subtle" onClick={() => void run("qa")} disabled={running || !content.trim() || !question.trim()}>问答</button></div>
    {error ? <div className="ai-error" aria-live="polite">{error}</div> : null}
    {result ? <div className="ai-result" aria-live="polite"><div className="ai-result-meta">{result.operation} · {result.model}</div><pre>{result.content}</pre></div> : null}
  </section>;
}
