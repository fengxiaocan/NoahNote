import { useEffect, useState } from "react";
import type { AppSettings, BackupInfo, SyncAction, SyncHistoryEntry, SyncReport } from "../types";
import { PageHeader } from "../components/PageHeader";
import type { Theme } from "../lib/theme";
import {
  autoSaveIntervalOptions,
  contentWidthMap,
  defaultPreferences,
  fontSizeMap,
  startupPageOptions,
  type ContentWidth,
  type EditorFontSize,
  type UserPreferences,
} from "../lib/preferences";

export type SettingsTab = "all" | "appearance" | "productivity" | "workspace" | "sync" | "ai" | "backup";

interface SettingsPageProps {
  settings: AppSettings;
  backups: BackupInfo[];
  syncHistory: SyncHistoryEntry[];
  preferences: UserPreferences;
  onSave: (settings: AppSettings) => Promise<void>;
  onPreferencesChange: (preferences: UserPreferences) => void;
  onBackup: () => Promise<void>;
  onRestore: (name: string) => Promise<void>;
  onSync: (action: SyncAction) => Promise<SyncReport | null>;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  stats?: {
    notesCount: number;
    tasksCount: number;
    projectsCount: number;
    knowledgeCount: number;
    eventsCount: number;
    documentsCount: number;
  };
  onExportData?: () => void;
}

export function SettingsPage({
  settings,
  backups,
  syncHistory,
  preferences,
  onSave,
  onPreferencesChange,
  onBackup,
  onRestore,
  onSync,
  theme,
  onThemeChange,
  stats,
  onExportData,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("all");
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

  const updatePreference = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    onPreferencesChange({ ...preferences, [key]: value });
  };

  const toggleSidebar = () => {
    updatePreference("sidebarCollapsed", !preferences.sidebarCollapsed);
  };

  const resetPreferences = () => {
    if (window.confirm("确定恢复默认外观和界面偏好设置吗？")) {
      onPreferencesChange(defaultPreferences);
      setMessage("已恢复默认界面偏好");
      window.setTimeout(() => setMessage(""), 2500);
    }
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

  const shouldShow = (tab: SettingsTab) => activeTab === "all" || activeTab === tab;

  return (
    <div className="page-stack narrow-page settings-page">
      <PageHeader
        eyebrow="保持掌控"
        title="设置与偏好"
        description="个性化配置工作台、外观布局、侧边栏、快捷键与数据同步，让 NoahNote 贴合你的使用习惯。"
        action={
          <button type="button" className="button primary" onClick={() => void save()}>
            保存系统设置
          </button>
        }
      />

      {/* 顶部设置分类导航 */}
      <div className="settings-nav-tabs" role="tablist" aria-label="设置分类">
        <button
          type="button"
          className={`settings-nav-tab ${activeTab === "all" ? "is-active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          全部设置
        </button>
        <button
          type="button"
          className={`settings-nav-tab ${activeTab === "appearance" ? "is-active" : ""}`}
          onClick={() => setActiveTab("appearance")}
        >
          🎨 外观与侧栏
        </button>
        <button
          type="button"
          className={`settings-nav-tab ${activeTab === "productivity" ? "is-active" : ""}`}
          onClick={() => setActiveTab("productivity")}
        >
          ⚡ 效率与启动
        </button>
        <button
          type="button"
          className={`settings-nav-tab ${activeTab === "workspace" ? "is-active" : ""}`}
          onClick={() => setActiveTab("workspace")}
        >
          📁 Workspace 与数据
        </button>
        <button
          type="button"
          className={`settings-nav-tab ${activeTab === "sync" ? "is-active" : ""}`}
          onClick={() => setActiveTab("sync")}
        >
          🔄 同步管理
        </button>
        <button
          type="button"
          className={`settings-nav-tab ${activeTab === "ai" ? "is-active" : ""}`}
          onClick={() => setActiveTab("ai")}
        >
          🤖 AI 与 OCR
        </button>
        <button
          type="button"
          className={`settings-nav-tab ${activeTab === "backup" ? "is-active" : ""}`}
          onClick={() => setActiveTab("backup")}
        >
          💾 备份与安全
        </button>
      </div>

      {/* 1. 外观与侧边栏设置 */}
      {shouldShow("appearance") && (
        <section className="settings-section appearance-section">
          <div className="settings-section-heading">
            <div>
              <h2>外观风格</h2>
              <p>选择清爽明亮或柔和沉浸的视觉风格，自动跨会话保存。</p>
            </div>
            <span className="settings-icon">◐</span>
          </div>
          <div className="theme-choice-grid" role="group" aria-label="主题选择">
            <button
              type="button"
              className={`theme-choice ${theme === "light" ? "is-active" : ""}`}
              aria-pressed={theme === "light"}
              onClick={() => onThemeChange("light")}
            >
              <span className="theme-choice-swatch theme-swatch-light" aria-hidden="true">
                Aa
              </span>
              <span className="theme-choice-copy">
                <strong>浅色主题</strong>
                <small>清爽、明朗的纸张质感</small>
              </span>
              <span className="theme-choice-check" aria-hidden="true">
                {theme === "light" ? "✓" : ""}
              </span>
            </button>
            <button
              type="button"
              className={`theme-choice ${theme === "dark" ? "is-active" : ""}`}
              aria-pressed={theme === "dark"}
              onClick={() => onThemeChange("dark")}
            >
              <span className="theme-choice-swatch theme-swatch-dark" aria-hidden="true">
                Aa
              </span>
              <span className="theme-choice-copy">
                <strong>暗色主题</strong>
                <small>沉浸、柔和的夜间阅读体验</small>
              </span>
              <span className="theme-choice-check" aria-hidden="true">
                {theme === "dark" ? "✓" : ""}
              </span>
            </button>
          </div>

          <div className="settings-divider" />

          {/* 侧边栏折叠与显示选项 */}
          <div className="settings-subheading">
            <div>
              <h3>侧边栏与导航</h3>
              <p>自由收起侧边栏以释放更大阅读和双栏写作视野，支持随时通过快捷键切换。</p>
            </div>
          </div>

          <div className="sidebar-control-card">
            <div className="sidebar-status-row">
              <div className="sidebar-status-info">
                <span className={`status-indicator ${preferences.sidebarCollapsed ? "is-collapsed" : "is-expanded"}`} />
                <div>
                  <strong>当前侧边栏状态：{preferences.sidebarCollapsed ? "已隐藏（折叠）" : "已展开显示"}</strong>
                  <p>隐藏后顶部左侧会常驻展开按钮，点击或使用快捷键即可随时唤出。</p>
                </div>
              </div>
              <button
                type="button"
                className={`button ${preferences.sidebarCollapsed ? "primary" : "secondary"}`}
                onClick={toggleSidebar}
              >
                {preferences.sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
              </button>
            </div>

            <div className="shortcut-tip-box">
              <span className="tip-badge">快捷键</span>
              <span>
                按 <kbd>Ctrl + \</kbd>（或 <kbd>Cmd + \</kbd>）随时随地秒级展开/折叠侧边栏。
              </span>
            </div>

            <div className="preferences-checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.sidebarCompact}
                  onChange={(e) => updatePreference("sidebarCompact", e.target.checked)}
                />
                <span>启用侧边栏紧凑模式（更窄宽度、更紧凑间距，适合小尺寸屏幕）</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.sidebarCollapsed}
                  onChange={(e) => updatePreference("sidebarCollapsed", e.target.checked)}
                />
                <span>保持侧边栏折叠隐藏（关闭后下次启动仍保持隐藏状态）</span>
              </label>
            </div>
          </div>

          <div className="settings-divider" />

          {/* 排版与字号 */}
          <div className="settings-subheading">
            <div>
              <h3>排版与阅读版心</h3>
              <p>自适应不同分辨率屏幕，定制最舒适的字号和内容区宽度。</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              正文与编辑器字号
              <select
                value={preferences.editorFontSize}
                onChange={(e) => updatePreference("editorFontSize", e.target.value as EditorFontSize)}
              >
                {(Object.keys(fontSizeMap) as EditorFontSize[]).map((key) => (
                  <option key={key} value={key}>
                    {fontSizeMap[key].label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              内容区域最大宽度
              <select
                value={preferences.contentWidth}
                onChange={(e) => updatePreference("contentWidth", e.target.value as ContentWidth)}
              >
                {(Object.keys(contentWidthMap) as ContentWidth[]).map((key) => (
                  <option key={key} value={key}>
                    {contentWidthMap[key].label} · {contentWidthMap[key].description}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {/* 2. 效率与启动设置 */}
      {shouldShow("productivity") && (
        <section className="settings-section">
          <div className="settings-section-heading">
            <div>
              <h2>效率与启动设置</h2>
              <p>定制常用工作流默认值，配合全套快捷键实现键盘优先的高效操作。</p>
            </div>
            <span className="settings-icon">⚡</span>
          </div>

          <div className="form-grid">
            <label>
              默认启动工作台
              <select
                value={preferences.defaultStartupPage}
                onChange={(e) => updatePreference("defaultStartupPage", e.target.value as UserPreferences["defaultStartupPage"])}
              >
                {startupPageOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <small className="field-hint">每次打开应用时首先进入的页面。</small>
            </label>

            <label>
              新建任务默认优先级
              <select
                value={preferences.taskDefaultPriority}
                onChange={(e) => updatePreference("taskDefaultPriority", e.target.value as UserPreferences["taskDefaultPriority"])}
              >
                <option value="urgent">紧急 (Urgent)</option>
                <option value="high">高 (High)</option>
                <option value="normal">正常 (Normal)</option>
                <option value="low">低 (Low)</option>
              </select>
              <small className="field-hint">在未显式指定时自动赋予的新任务初始优先级。</small>
            </label>
          </div>

          <div className="settings-divider" />

          {/* 编辑与定时自动保存 */}
          <div className="settings-subheading">
            <div>
              <h3>编辑与定时自动保存</h3>
              <p>编辑笔记与知识库时自动定时保存改动，并持续生成保存记录与版本快照，防丢防错。</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              定时自动保存
              <select
                value={preferences.autoSaveEnabled ? "enabled" : "disabled"}
                onChange={(e) => updatePreference("autoSaveEnabled", e.target.value === "enabled")}
              >
                <option value="enabled">开启定时自动保存 (默认开启)</option>
                <option value="disabled">关闭 (仅手动保存)</option>
              </select>
              <small className="field-hint">默认开启。当内容发生改动时，将按设定周期自动保存并沉淀版本记录。</small>
            </label>

            <label>
              自动保存时间间隔
              <select
                value={preferences.autoSaveIntervalSeconds}
                disabled={!preferences.autoSaveEnabled}
                onChange={(e) => updatePreference("autoSaveIntervalSeconds", Number(e.target.value))}
              >
                {autoSaveIntervalOptions.map((opt) => (
                  <option key={opt.seconds} value={opt.seconds}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <small className="field-hint">内容发生改动后触发定时自动保存的时间间隔。</small>
            </label>
          </div>

          <div className="settings-divider" />

          {/* 快捷键速查表 */}
          <div className="settings-subheading">
            <div>
              <h3>常用快捷键指南</h3>
              <p>熟练使用快捷键，无需鼠标即可高效捕获与穿梭。</p>
            </div>
          </div>

          <div className="shortcuts-cheatsheet-grid">
            <div className="shortcut-card">
              <div className="shortcut-header">
                <strong>展开 / 隐藏侧边栏</strong>
                <kbd>Ctrl + \</kbd>
              </div>
              <p>在任意界面一键折叠或唤出侧边栏</p>
            </div>

            <div className="shortcut-card">
              <div className="shortcut-header">
                <strong>全局聚焦搜索</strong>
                <kbd>Ctrl + K</kbd>
              </div>
              <p>秒级检索任务、笔记、项目和文档</p>
            </div>

            <div className="shortcut-card">
              <div className="shortcut-header">
                <strong>全局命令面板</strong>
                <kbd>Ctrl + P</kbd>
              </div>
              <p>快速执行任意模块跳转或动作指令</p>
            </div>

            <div className="shortcut-card">
              <div className="shortcut-header">
                <strong>快速记录收件箱</strong>
                <kbd>Ctrl + ⇧ + Space</kbd>
              </div>
              <p>随时呼出快速记录弹窗捕捉临时灵感</p>
            </div>

            <div className="shortcut-card">
              <div className="shortcut-header">
                <strong>快速新建笔记</strong>
                <kbd>Ctrl + N</kbd>
              </div>
              <p>快速创建新文档进入编辑模式</p>
            </div>

            <div className="shortcut-card">
              <div className="shortcut-header">
                <strong>快速新建任务</strong>
                <kbd>Ctrl + ⇧ + T</kbd>
              </div>
              <p>把行动即刻转换为清晰的任务事项</p>
            </div>

            <div className="shortcut-card">
              <div className="shortcut-header">
                <strong>保存编辑修改</strong>
                <kbd>Ctrl + S</kbd>
              </div>
              <p>在笔记、项目或知识库编辑器中即时存盘</p>
            </div>

            <div className="shortcut-card">
              <div className="shortcut-header">
                <strong>快速空间切换</strong>
                <kbd>Alt + 1 / 2 / 3</kbd>
              </div>
              <p>无缝切换 全部 / 个人 / 工作 空间视图</p>
            </div>
          </div>
        </section>
      )}

      {/* 3. 本地 Workspace 与数据概览 */}
      {shouldShow("workspace") && (
        <section className="settings-section">
          <div className="settings-section-heading">
            <div>
              <h2>本地 Workspace 与数据</h2>
              <p>笔记使用 Markdown，任务和项目使用 JSON，SQLite 仅作为本地检索索引。</p>
            </div>
            <span className="settings-icon">⌂</span>
          </div>

          <div className="path-field">
            <span>存储位置</span>
            <code>{settings.workspaceRoot}</code>
          </div>
          <div className="settings-note">
            <span className="status-dot" />
            设备唯一标识 ID：{settings.deviceId}
          </div>

          <div className="form-grid">
            <label>
              启动默认空间
              <select
                value={draft.defaultSpace}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, defaultSpace: event.target.value as AppSettings["defaultSpace"] }))
                }
              >
                <option value="personal">个人空间</option>
                <option value="work">工作空间</option>
              </select>
              <small className="field-hint">应用启动后默认展示的空间，也可随时切换为“全部”。</small>
            </label>

            <label>
              回收站保留天数
              <input
                type="number"
                min={1}
                max={3650}
                value={draft.trashRetentionDays}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, trashRetentionDays: Math.max(1, Number(event.target.value)) }))
                }
              />
              <small className="field-hint">默认 30 天，过期内容会在启动时自动清理以释放空间。</small>
            </label>
          </div>

          {/* 数据概览卡片 */}
          {stats ? (
            <div className="workspace-stats-box">
              <div className="stats-box-heading">
                <strong>当前工作区数据统计</strong>
                <span>全部保存在本地</span>
              </div>
              <div className="stats-metric-grid">
                <div className="stats-metric-card">
                  <span>笔记</span>
                  <strong>{stats.notesCount}</strong>
                </div>
                <div className="stats-metric-card">
                  <span>任务</span>
                  <strong>{stats.tasksCount}</strong>
                </div>
                <div className="stats-metric-card">
                  <span>项目</span>
                  <strong>{stats.projectsCount}</strong>
                </div>
                <div className="stats-metric-card">
                  <span>知识库页面</span>
                  <strong>{stats.knowledgeCount}</strong>
                </div>
                <div className="stats-metric-card">
                  <span>日程事件</span>
                  <strong>{stats.eventsCount}</strong>
                </div>
                <div className="stats-metric-card">
                  <span>PDF 文档</span>
                  <strong>{stats.documentsCount}</strong>
                </div>
              </div>
            </div>
          ) : null}

          <div className="settings-actions">
            {onExportData ? (
              <button type="button" className="button secondary" onClick={onExportData}>
                ⤓ 导出工作区数据 (JSON)
              </button>
            ) : null}
            <button type="button" className="button secondary" onClick={resetPreferences}>
              恢复默认界面偏好
            </button>
          </div>
        </section>
      )}

      {/* 4. 同步方式 */}
      {shouldShow("sync") && (
        <section className="settings-section">
          <div className="settings-section-heading">
            <div>
              <h2>同步方式</h2>
              <p>同步结构化纯文本与资源文件，不同步运行中的 SQLite。远端路径具备严格安全校验。</p>
            </div>
            <span className="settings-icon">↗</span>
          </div>

          <label>
            当前方式
            <select
              value={draft.sync.provider}
              onChange={(event) => updateSync("provider", event.target.value as AppSettings["sync"]["provider"])}
            >
              <option value="none">不启用同步</option>
              <option value="git">Git / GitHub / GitLab</option>
              <option value="webdav">WebDAV</option>
              <option value="local_folder">本地目录</option>
              <option value="smb">SMB / NAS 共享路径</option>
              <option value="s3">S3 兼容对象存储</option>
              <option value="sftp">SFTP（系统 OpenSSH）</option>
            </select>
          </label>

          {draft.sync.provider === "git" ? (
            <>
              <label>
                远程仓库地址
                <input
                  value={draft.sync.gitRemoteUrl ?? ""}
                  onChange={(event) => updateSync("gitRemoteUrl", event.target.value || null)}
                  placeholder="https://github.com/you/workspace.git"
                />
              </label>
              <label>
                分支
                <input value={draft.sync.gitBranch} onChange={(event) => updateSync("gitBranch", event.target.value)} />
              </label>
            </>
          ) : null}

          {draft.sync.provider === "webdav" ? (
            <>
              <label>
                WebDAV 地址
                <input
                  value={draft.sync.webdavUrl ?? ""}
                  onChange={(event) => updateSync("webdavUrl", event.target.value || null)}
                  placeholder="https://cloud.example.com/remote.php/dav/files/you/"
                />
              </label>
              <div className="form-grid">
                <label>
                  账号
                  <input
                    value={draft.sync.webdavUsername ?? ""}
                    onChange={(event) => updateSync("webdavUsername", event.target.value || null)}
                  />
                </label>
                <label>
                  密码
                  <input
                    type="password"
                    value={draft.sync.webdavPassword ?? ""}
                    onChange={(event) => updateSync("webdavPassword", event.target.value || null)}
                  />
                </label>
              </div>
            </>
          ) : null}

          {draft.sync.provider === "local_folder" ? (
            <label>
              目标目录（绝对路径）
              <input
                value={draft.sync.localFolderPath ?? ""}
                onChange={(event) => updateSync("localFolderPath", event.target.value || null)}
                placeholder="/home/user/Noah-Workspace-Remote"
              />
            </label>
          ) : null}

          {draft.sync.provider === "smb" ? (
            <label>
              SMB/NAS 路径（已挂载或 UNC）
              <input
                value={draft.sync.smbPath ?? ""}
                onChange={(event) => updateSync("smbPath", event.target.value || null)}
                placeholder="//nas/NoahWorkspace"
              />
            </label>
          ) : null}

          {draft.sync.provider === "s3" ? (
            <>
              <div className="form-grid">
                <label>
                  Endpoint
                  <input
                    value={draft.sync.s3Endpoint ?? ""}
                    onChange={(event) => updateSync("s3Endpoint", event.target.value || null)}
                    placeholder="https://s3.example.com"
                  />
                </label>
                <label>
                  Bucket
                  <input
                    value={draft.sync.s3Bucket ?? ""}
                    onChange={(event) => updateSync("s3Bucket", event.target.value || null)}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Region
                  <input
                    value={draft.sync.s3Region ?? ""}
                    onChange={(event) => updateSync("s3Region", event.target.value || null)}
                    placeholder="us-east-1"
                  />
                </label>
                <label>
                  Prefix
                  <input
                    value={draft.sync.s3Prefix ?? ""}
                    onChange={(event) => updateSync("s3Prefix", event.target.value || null)}
                    placeholder="noah"
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Access Key
                  <input
                    value={draft.sync.s3AccessKey ?? ""}
                    onChange={(event) => updateSync("s3AccessKey", event.target.value || null)}
                  />
                </label>
                <label>
                  Secret Key
                  <input
                    type="password"
                    value={draft.sync.s3SecretKey ?? ""}
                    onChange={(event) => updateSync("s3SecretKey", event.target.value || null)}
                  />
                </label>
              </div>
            </>
          ) : null}

          {draft.sync.provider === "sftp" ? (
            <>
              <div className="form-grid">
                <label>
                  主机
                  <input
                    value={draft.sync.sftpHost ?? ""}
                    onChange={(event) => updateSync("sftpHost", event.target.value || null)}
                    placeholder="server.example.com"
                  />
                </label>
                <label>
                  端口
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.sync.sftpPort}
                    onChange={(event) => updateSync("sftpPort", Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  用户名
                  <input
                    value={draft.sync.sftpUsername ?? ""}
                    onChange={(event) => updateSync("sftpUsername", event.target.value || null)}
                  />
                </label>
                <label>
                  私钥路径
                  <input
                    value={draft.sync.sftpPrivateKey ?? ""}
                    onChange={(event) => updateSync("sftpPrivateKey", event.target.value || null)}
                    placeholder="/home/user/.ssh/id_ed25519"
                  />
                </label>
              </div>
              <label>
                远端目录
                <input
                  value={draft.sync.sftpRemotePath ?? ""}
                  onChange={(event) => updateSync("sftpRemotePath", event.target.value || null)}
                  placeholder="/noah-workspace"
                />
              </label>
            </>
          ) : null}

          <div className="settings-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => void sync("status")}
              disabled={syncing || draft.sync.provider === "none"}
            >
              检查状态
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => void sync("pull")}
              disabled={syncing || draft.sync.provider === "none"}
            >
              拉取远端
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void sync("push")}
              disabled={syncing || draft.sync.provider === "none"}
            >
              {syncing ? "同步中…" : "立即同步"}
            </button>
          </div>

          {conflicts.length > 0 ? (
            <div className="sync-conflict-panel">
              <strong>发现并发修改冲突</strong>
              <p>
                {conflictProvider === "git"
                  ? "这是 Git 冲突，请在 Git 工具中完成合并后再继续同步。"
                  : conflictProvider !== draft.sync.provider
                  ? "同步方式已变化，请切回产生冲突的 Provider 后再处理。"
                  : "冲突文件已跳过，请选择保留本机版本或远端版本。"}
              </p>
              <div className="sync-conflict-list">
                {conflicts.map((path) => (
                  <code key={path}>{path}</code>
                ))}
              </div>
              {conflictProvider !== "git" ? (
                <div className="settings-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void sync("force_pull")}
                    disabled={syncing || conflictProvider !== draft.sync.provider}
                  >
                    保留远端版本
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => void sync("force_push")}
                    disabled={syncing || conflictProvider !== draft.sync.provider}
                  >
                    保留本地版本
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="sync-history">
            <div className="backup-toolbar">
              <span>最近同步记录</span>
              <span className="muted">保留最近 {Math.min(syncHistory.length, 100)} 条</span>
            </div>
            {syncHistory.length === 0 ? (
              <p className="muted">还没有同步记录。</p>
            ) : (
              <div className="backup-list">
                {syncHistory.slice(0, 8).map((entry) => (
                  <div className="backup-row" key={entry.id}>
                    <span className={`backup-file sync-status-${entry.status}`}>
                      {entry.status === "success" ? "OK" : entry.status === "conflict" ? "!" : "×"}
                    </span>
                    <div>
                      <strong>
                        {entry.provider} · {entry.action}
                      </strong>
                      <small>
                        {formatSyncTime(entry.createdAt)} · {entry.message}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5. AI 与 本地 OCR */}
      {shouldShow("ai") && (
        <>
          <section className="settings-section">
            <div className="settings-section-heading">
              <div>
                <h2>AI Provider</h2>
                <p>AI 默认关闭。启用后需显式允许外部请求，Local Provider 仅接受本机 Endpoint。</p>
              </div>
              <span className="settings-icon">AI</span>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.ai.enabled}
                onChange={(event) => updateAi("enabled", event.target.checked)}
              />
              启用 AI 工作台
            </label>
            <label>
              Provider
              <select
                value={draft.ai.provider}
                onChange={(event) => updateAi("provider", event.target.value as AppSettings["ai"]["provider"])}
              >
                <option value="none">不启用</option>
                <option value="local">Local（本机 Ollama / llama.cpp）</option>
                <option value="openai_compatible">OpenAI Compatible</option>
                <option value="custom">Custom API</option>
              </select>
            </label>

            {draft.ai.provider !== "none" ? (
              <>
                <label>
                  Endpoint
                  <input
                    value={draft.ai.endpoint ?? ""}
                    onChange={(event) => updateAi("endpoint", event.target.value || null)}
                    placeholder={
                      draft.ai.provider === "local" ? "http://127.0.0.1:11434/v1" : "https://api.openai.com/v1"
                    }
                  />
                </label>
                <div className="form-grid">
                  <label>
                    模型
                    <input value={draft.ai.model} onChange={(event) => updateAi("model", event.target.value)} />
                  </label>
                  <label>
                    最大上下文字符
                    <input
                      type="number"
                      min={500}
                      max={100000}
                      value={draft.ai.maxContextChars}
                      onChange={(event) => updateAi("maxContextChars", Number(event.target.value))}
                    />
                  </label>
                </div>
                <label>
                  API Key
                  <input
                    type="password"
                    value={draft.ai.apiKey ?? ""}
                    onChange={(event) => updateAi("apiKey", event.target.value || null)}
                    placeholder="可留空（本地模型）"
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.ai.allowExternal}
                    onChange={(event) => updateAi("allowExternal", event.target.checked)}
                  />
                  允许发送内容到外部 Endpoint
                </label>
              </>
            ) : null}
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <div>
                <h2>本地 OCR</h2>
                <p>使用系统安装的 OCR 命令行处理 PDF，不上传文件。参数支持 {"{input}"} 占位符。</p>
              </div>
              <span className="settings-icon">OCR</span>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.ocr.enabled}
                onChange={(event) => updateOcr("enabled", event.target.checked)}
              />
              启用本地 OCR
            </label>
            <div className="form-grid">
              <label>
                命令
                <input
                  value={draft.ocr.command}
                  onChange={(event) => updateOcr("command", event.target.value)}
                  placeholder="tesseract"
                />
              </label>
              <label>
                超时（秒）
                <input
                  type="number"
                  min={1}
                  max={3600}
                  value={draft.ocr.timeoutSeconds}
                  onChange={(event) => updateOcr("timeoutSeconds", Number(event.target.value))}
                />
              </label>
            </div>
            <label>
              参数（每行一个）
              <textarea
                rows={3}
                value={draft.ocr.arguments.join("\n")}
                onChange={(event) =>
                  updateOcr(
                    "arguments",
                    event.target.value
                      .split(/\r?\n/)
                      .map((v) => v.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="{input}\nstdout"
              />
            </label>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <div>
                <h2>语义搜索</h2>
                <p>本地确定性向量与 FTS5 混合排序，不依赖外部 embedding 在线服务。</p>
              </div>
              <span className="settings-icon">⌕</span>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.semantic.enabled}
                onChange={(event) => updateSemantic("enabled", event.target.checked)}
              />
              启用离线语义索引
            </label>
            <label>
              结果数量限制
              <input
                type="number"
                min={1}
                max={100}
                value={draft.semantic.resultLimit}
                onChange={(event) => updateSemantic("resultLimit", Number(event.target.value))}
              />
            </label>
          </section>
        </>
      )}

      {/* 6. 本地备份与恢复 */}
      {shouldShow("backup") && (
        <section className="settings-section">
          <div className="settings-section-heading">
            <div>
              <h2>本地备份</h2>
              <p>在同步机制之外，始终在本地磁盘保留一份可一键恢复的完整数据快照副本。</p>
            </div>
            <span className="settings-icon">□</span>
          </div>
          <div className="form-grid">
            <label>
              自动备份计划
              <select
                value={draft.sync.backupSchedule}
                onChange={(event) =>
                  updateSync("backupSchedule", event.target.value as AppSettings["sync"]["backupSchedule"])
                }
              >
                <option value="manual">手动创建</option>
                <option value="daily">每日自动（启动时检查）</option>
                <option value="weekly">每周自动（启动时检查）</option>
              </select>
            </label>
            <label>
              备份保留天数
              <select
                value={draft.sync.backupRetention}
                onChange={(event) => updateSync("backupRetention", Number(event.target.value))}
              >
                <option value={7}>7 天</option>
                <option value={30}>30 天</option>
                <option value={90}>90 天</option>
              </select>
            </label>
          </div>
          <div className="backup-toolbar">
            <span>已保存 {backups.length} 份本地备份</span>
            <button type="button" className="button secondary" onClick={() => void onBackup()}>
              ＋ 创建即时备份
            </button>
          </div>
          {backups.length === 0 ? (
            <p className="muted">还没有备份。建议在同步前创建一份快照。</p>
          ) : (
            <div className="backup-list">
              {backups.map((backup) => (
                <div className="backup-row" key={backup.name}>
                  <span className="backup-file">ZIP</span>
                  <div>
                    <strong>{backup.name}</strong>
                    <small>{Math.max(1, Math.round(backup.size / 1024))} KB</small>
                  </div>
                  <button type="button" className="small-button" onClick={() => void onRestore(backup.name)}>
                    恢复
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {message ? <div className="toast-message">{message}</div> : null}
      <div className="settings-footer">
        NoahNote · 本地优先 · 设备：{settings.deviceId.slice(0, 8)}…
      </div>
    </div>
  );
}

function formatSyncTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
