import { useEffect, useState } from "react";
import type { AppSettings, BackupInfo, SyncAction, SyncHistoryEntry, SyncReport } from "../types";
import { PageHeader } from "../components/PageHeader";
import type { Theme } from "../lib/theme";

interface SettingsPageProps {
  settings: AppSettings;
  backups: BackupInfo[];
  syncHistory: SyncHistoryEntry[];
  onSave: (settings: AppSettings) => Promise<void>;
  onBackup: () => Promise<void>;
  onRestore: (name: string) => Promise<void>;
  onSync: (action: SyncAction) => Promise<SyncReport | null>;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export function SettingsPage({ settings, backups, syncHistory, onSave, onBackup, onRestore, onSync, theme, onThemeChange }: SettingsPageProps) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [conflictProvider, setConflictProvider] = useState<string | null>(null);
  useEffect(() => setDraft(settings), [settings]);

  const updateSync = <K extends keyof AppSettings["sync"]>(key: K, value: AppSettings["sync"][K]) => {
    setDraft((current) => ({ ...current, sync: { ...current.sync, [key]: value } }));
  };
  const updateAi = <K extends keyof AppSettings["ai"]>(key: K, value: AppSettings["ai"][K]) => {
    setDraft((current) => ({ ...current, ai: { ...current.ai, [key]: value } }));
  };
  const updateOcr = <K extends keyof AppSettings["ocr"]>(key: K, value: AppSettings["ocr"][K]) => {
    setDraft((current) => ({ ...current, ocr: { ...current.ocr, [key]: value } }));
  };
  const updateSemantic = <K extends keyof AppSettings["semantic"]>(key: K, value: AppSettings["semantic"][K]) => {
    setDraft((current) => ({ ...current, semantic: { ...current.semantic, [key]: value } }));
  };
  const save = async () => {
    try {
      await onSave(draft);
      setMessage("设置已保存");
      window.setTimeout(() => setMessage(""), 2500);
    } catch {
      // App displays the actionable error banner.
    }
  };
  const sync = async (action: SyncAction) => {
    setSyncing(true);
    setMessage("");
    if (action === "pull" || action === "push") {
      setConflicts([]);
      setConflictProvider(null);
    }
    try {
      const report = await onSync(action);
      if (report) {
        setMessage(report.message);
        setConflicts(report.conflicts);
        setConflictProvider(report.conflicts.length > 0 ? report.provider : null);
      }
    } finally {
      setSyncing(false);
    }
  };

  return <div className="page-stack narrow-page settings-page">
    <PageHeader eyebrow="保持掌控" title="设置与同步" description="数据默认保存在本机，选择你信任的方式进行备份和同步。" />

    <section className="settings-section appearance-section">
      <div className="settings-section-heading"><div><h2>外观</h2><p>选择适合当前环境的阅读氛围，主题会自动记住。</p></div><span className="settings-icon">◐</span></div>
      <div className="theme-choice-grid" role="group" aria-label="主题选择">
        <button type="button" className={`theme-choice ${theme === "light" ? "is-active" : ""}`} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>
          <span className="theme-choice-swatch theme-swatch-light" aria-hidden="true">Aa</span>
          <span className="theme-choice-copy"><strong>浅色主题</strong><small>清爽、明亮的纸张质感</small></span>
          <span className="theme-choice-check" aria-hidden="true">{theme === "light" ? "✓" : ""}</span>
        </button>
        <button type="button" className={`theme-choice ${theme === "dark" ? "is-active" : ""}`} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>
          <span className="theme-choice-swatch theme-swatch-dark" aria-hidden="true">Aa</span>
          <span className="theme-choice-copy"><strong>暗色主题</strong><small>沉浸、柔和的夜间阅读</small></span>
          <span className="theme-choice-check" aria-hidden="true">{theme === "dark" ? "✓" : ""}</span>
        </button>
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>本地 Workspace</h2><p>笔记使用 Markdown，任务和项目使用 JSON，SQLite 只保存本地索引。</p></div><span className="settings-icon">⌂</span></div>
      <div className="path-field"><span>存储位置</span><code>{settings.workspaceRoot}</code></div>
      <div className="settings-note"><span className="status-dot" />设备 ID：{settings.deviceId.slice(0, 12)}…</div>
      <label>启动默认空间<select value={draft.defaultSpace} onChange={(event) => setDraft((current) => ({ ...current, defaultSpace: event.target.value as AppSettings["defaultSpace"] }))}><option value="personal">个人空间</option><option value="work">工作空间</option></select><small className="field-hint">应用启动后默认显示的空间；“全部”视图仍可随时切换。</small></label>
      <label>回收站保留天数<input type="number" min={1} max={3650} value={draft.trashRetentionDays} onChange={(event) => setDraft((current) => ({ ...current, trashRetentionDays: Math.max(1, Number(event.target.value)) }))} /><small className="field-hint">默认 30 天，过期内容会在启动时自动清理。</small></label>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>同步方式</h2><p>同步结构化文件，不同步正在运行的 SQLite 数据库。远端路径会经过安全校验。</p></div><span className="settings-icon">↗</span></div>
      <label>当前方式<select value={draft.sync.provider} onChange={(event) => updateSync("provider", event.target.value as AppSettings["sync"]["provider"])}><option value="none">不启用同步</option><option value="git">Git / GitHub / GitLab</option><option value="webdav">WebDAV</option><option value="local_folder">本地目录</option><option value="smb">SMB / NAS 共享路径</option><option value="s3">S3 兼容对象存储</option><option value="sftp">SFTP（系统 OpenSSH）</option></select></label>
      {draft.sync.provider === "git" ? <><label>远程仓库地址<input value={draft.sync.gitRemoteUrl ?? ""} onChange={(event) => updateSync("gitRemoteUrl", event.target.value || null)} placeholder="https://github.com/you/workspace.git" /></label><label>分支<input value={draft.sync.gitBranch} onChange={(event) => updateSync("gitBranch", event.target.value)} /></label></> : null}
      {draft.sync.provider === "webdav" ? <><label>WebDAV 地址<input value={draft.sync.webdavUrl ?? ""} onChange={(event) => updateSync("webdavUrl", event.target.value || null)} placeholder="https://cloud.example.com/remote.php/dav/files/you/" /></label><div className="form-grid"><label>账号<input value={draft.sync.webdavUsername ?? ""} onChange={(event) => updateSync("webdavUsername", event.target.value || null)} /></label><label>密码<input type="password" value={draft.sync.webdavPassword ?? ""} onChange={(event) => updateSync("webdavPassword", event.target.value || null)} /></label></div></> : null}
      {draft.sync.provider === "local_folder" ? <label>目标目录（绝对路径）<input value={draft.sync.localFolderPath ?? ""} onChange={(event) => updateSync("localFolderPath", event.target.value || null)} placeholder="D:\\Noah-Workspace-Remote" /></label> : null}
      {draft.sync.provider === "smb" ? <label>SMB/NAS 路径（已挂载或 UNC）<input value={draft.sync.smbPath ?? ""} onChange={(event) => updateSync("smbPath", event.target.value || null)} placeholder="\\\\nas\\NoahWorkspace" /></label> : null}
      {draft.sync.provider === "s3" ? <><div className="form-grid"><label>Endpoint<input value={draft.sync.s3Endpoint ?? ""} onChange={(event) => updateSync("s3Endpoint", event.target.value || null)} placeholder="https://s3.example.com" /></label><label>Bucket<input value={draft.sync.s3Bucket ?? ""} onChange={(event) => updateSync("s3Bucket", event.target.value || null)} /></label></div><div className="form-grid"><label>Region<input value={draft.sync.s3Region ?? ""} onChange={(event) => updateSync("s3Region", event.target.value || null)} placeholder="us-east-1" /></label><label>Prefix<input value={draft.sync.s3Prefix ?? ""} onChange={(event) => updateSync("s3Prefix", event.target.value || null)} placeholder="noah" /></label></div><div className="form-grid"><label>Access Key<input value={draft.sync.s3AccessKey ?? ""} onChange={(event) => updateSync("s3AccessKey", event.target.value || null)} /></label><label>Secret Key<input type="password" value={draft.sync.s3SecretKey ?? ""} onChange={(event) => updateSync("s3SecretKey", event.target.value || null)} /></label></div></> : null}
      {draft.sync.provider === "sftp" ? <><div className="form-grid"><label>主机<input value={draft.sync.sftpHost ?? ""} onChange={(event) => updateSync("sftpHost", event.target.value || null)} placeholder="server.example.com" /></label><label>端口<input type="number" min={1} max={65535} value={draft.sync.sftpPort} onChange={(event) => updateSync("sftpPort", Number(event.target.value))} /></label></div><div className="form-grid"><label>用户名<input value={draft.sync.sftpUsername ?? ""} onChange={(event) => updateSync("sftpUsername", event.target.value || null)} /></label><label>私钥路径<input value={draft.sync.sftpPrivateKey ?? ""} onChange={(event) => updateSync("sftpPrivateKey", event.target.value || null)} placeholder="C:\\Users\\you\\.ssh\\id_ed25519" /></label></div><label>远端目录<input value={draft.sync.sftpRemotePath ?? ""} onChange={(event) => updateSync("sftpRemotePath", event.target.value || null)} placeholder="/noah-workspace" /></label><small className="field-hint">为避免密码出现在进程参数中，SFTP 使用私钥或 SSH Agent。</small></> : null}
      <div className="settings-actions"><button className="button secondary" onClick={() => void sync("status")} disabled={syncing || draft.sync.provider === "none"}>检查状态</button><button className="button secondary" onClick={() => void sync("pull")} disabled={syncing || draft.sync.provider === "none"}>拉取远端</button><button className="button primary" onClick={() => void sync("push")} disabled={syncing || draft.sync.provider === "none"}>{syncing ? "同步中…" : "立即同步"}</button></div>
      {conflicts.length > 0 ? <div className="sync-conflict-panel"><strong>发现并发修改</strong><p>{conflictProvider === "git" ? "这是 Git 冲突，请在 Git 工具中完成合并后再继续同步。" : conflictProvider !== draft.sync.provider ? "同步方式已变化，请切回产生冲突的 Provider 后再处理。" : "冲突文件已跳过，请选择本机版本或远端版本作为本次同步结果。"}</p><div className="sync-conflict-list">{conflicts.map((path) => <code key={path}>{path}</code>)}</div>{conflictProvider !== "git" ? <div className="settings-actions"><button className="button secondary" onClick={() => void sync("force_pull")} disabled={syncing || conflictProvider !== draft.sync.provider}>保留远端版本</button><button className="button primary" onClick={() => void sync("force_push")} disabled={syncing || conflictProvider !== draft.sync.provider}>保留本地版本</button></div> : null}</div> : null}
      <div className="sync-history">
        <div className="backup-toolbar"><span>最近同步记录</span><span className="muted">保留最近 {Math.min(syncHistory.length, 100)} 条</span></div>
        {syncHistory.length === 0 ? <p className="muted">还没有同步记录。</p> : <div className="backup-list">{syncHistory.slice(0, 8).map((entry) => <div className="backup-row" key={entry.id}><span className={`backup-file sync-status-${entry.status}`}>{entry.status === "success" ? "OK" : entry.status === "conflict" ? "!" : "×"}</span><div><strong>{entry.provider} · {entry.action}</strong><small>{formatSyncTime(entry.createdAt)} · {entry.message}</small></div></div>)}</div>}
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>AI Provider</h2><p>AI 默认关闭。启用后仍需显式允许外部请求，Local Provider 只接受本机 Endpoint。</p></div><span className="settings-icon">AI</span></div>
      <label className="checkbox-label"><input type="checkbox" checked={draft.ai.enabled} onChange={(event) => updateAi("enabled", event.target.checked)} />启用 AI 工作台</label>
      <label>Provider<select value={draft.ai.provider} onChange={(event) => updateAi("provider", event.target.value as AppSettings["ai"]["provider"])}><option value="none">不启用</option><option value="local">Local（本机）</option><option value="openai_compatible">OpenAI Compatible</option><option value="custom">Custom API</option></select></label>
      {draft.ai.provider !== "none" ? <><label>Endpoint<input value={draft.ai.endpoint ?? ""} onChange={(event) => updateAi("endpoint", event.target.value || null)} placeholder={draft.ai.provider === "local" ? "http://127.0.0.1:11434/v1" : "https://api.example.com/v1"} /></label><div className="form-grid"><label>模型<input value={draft.ai.model} onChange={(event) => updateAi("model", event.target.value)} /></label><label>最大上下文字符<input type="number" min={500} max={100000} value={draft.ai.maxContextChars} onChange={(event) => updateAi("maxContextChars", Number(event.target.value))} /></label></div><label>API Key<input type="password" value={draft.ai.apiKey ?? ""} onChange={(event) => updateAi("apiKey", event.target.value || null)} placeholder="可留空（本地服务）" /></label><label className="checkbox-label"><input type="checkbox" checked={draft.ai.allowExternal} onChange={(event) => updateAi("allowExternal", event.target.checked)} />允许发送内容到外部 Endpoint</label></> : null}
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>本地 OCR</h2><p>使用你安装的 OCR 命令处理 PDF，不上传文件。参数支持 {"{input}"} 占位符。</p></div><span className="settings-icon">OCR</span></div>
      <label className="checkbox-label"><input type="checkbox" checked={draft.ocr.enabled} onChange={(event) => updateOcr("enabled", event.target.checked)} />启用本地 OCR</label>
      <div className="form-grid"><label>命令<input value={draft.ocr.command} onChange={(event) => updateOcr("command", event.target.value)} placeholder="tesseract" /></label><label>超时（秒）<input type="number" min={1} max={3600} value={draft.ocr.timeoutSeconds} onChange={(event) => updateOcr("timeoutSeconds", Number(event.target.value))} /></label></div>
      <label>参数（每行一个）<textarea rows={3} value={draft.ocr.arguments.join("\n")} onChange={(event) => updateOcr("arguments", event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))} placeholder="{input}\nstdout" /></label>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>语义搜索</h2><p>本地确定性向量与 FTS5 混合排序，不依赖外部 embedding 服务。</p></div><span className="settings-icon">⌕</span></div>
      <label className="checkbox-label"><input type="checkbox" checked={draft.semantic.enabled} onChange={(event) => updateSemantic("enabled", event.target.checked)} />启用离线语义索引</label>
      <label>结果数量<input type="number" min={1} max={100} value={draft.semantic.resultLimit} onChange={(event) => updateSemantic("resultLimit", Number(event.target.value))} /></label>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>本地备份</h2><p>同步之外，始终保留一份可恢复的本地副本。</p></div><span className="settings-icon">□</span></div>
      <div className="form-grid"><label>自动备份<select value={draft.sync.backupSchedule} onChange={(event) => updateSync("backupSchedule", event.target.value as AppSettings["sync"]["backupSchedule"])}><option value="manual">手动</option><option value="daily">每日（应用启动时检查）</option><option value="weekly">每周（应用启动时检查）</option></select></label><label>保留天数<select value={draft.sync.backupRetention} onChange={(event) => updateSync("backupRetention", Number(event.target.value))}><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option></select></label></div>
      <small className="field-hint">自动备份会在应用启动时按频率检查；手动备份仍可立即创建。</small>
      <div className="backup-toolbar"><span>已保存 {backups.length} 份备份</span><button className="button secondary" onClick={() => void onBackup()}>＋ 创建备份</button></div>
      {backups.length === 0 ? <p className="muted">还没有备份。建议在第一次同步前创建一份。</p> : <div className="backup-list">{backups.map((backup) => <div className="backup-row" key={backup.name}><span className="backup-file">ZIP</span><div><strong>{backup.name}</strong><small>{Math.max(1, Math.round(backup.size / 1024))} KB</small></div><button className="small-button" onClick={() => void onRestore(backup.name)}>恢复</button></div>)}</div>}
    </section>

    {message ? <div className="toast-message">{message}</div> : null}
    <div className="settings-footer">NoahNote · 本地优先 · device {settings.deviceId.slice(0, 8)}</div>
    <button className="button primary settings-save" onClick={() => void save()}>保存设置</button>
  </div>;
}

function formatSyncTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
