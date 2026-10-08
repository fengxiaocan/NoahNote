import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "../components/PageHeader";
import { isTauri } from "../lib/api";
import type { PluginManifest } from "../types";

interface PluginsPageProps {
  plugins: PluginManifest[];
  onInstall: (sourcePath: string) => Promise<void>;
  onToggle: (plugin: PluginManifest) => Promise<void>;
}

export function PluginsPage({ plugins, onInstall, onToggle }: PluginsPageProps) {
  const [installing, setInstalling] = useState(false);
  const install = async () => {
    if (!isTauri()) return;
    const selected = await open({ multiple: false, directory: false, title: "选择插件 manifest.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    const sourcePath = Array.isArray(selected) ? selected[0] : selected;
    if (!sourcePath) return;
    setInstalling(true);
    try { await onInstall(sourcePath); } finally { setInstalling(false); }
  };
  return <div className="page-stack plugins-page"><PageHeader eyebrow="可控扩展" title="插件系统" description="只管理经过校验的插件清单与权限；当前版本不执行任意代码，也不连接插件市场。" action={<button type="button" className="button primary" onClick={() => void install()} disabled={installing}>{installing ? "安装中…" : "＋ 安装清单"}</button>} /><section className="plugin-safety-note"><span className="status-dot" /><div><strong>安全边界</strong><p>允许权限仅限 workspace.read、workspace.write、commands.register、ui.panel。入口字段只做登记，不会被 Noah 直接执行。</p></div></section><section className="plugin-list-panel list-panel"><div className="list-panel-heading"><span>{plugins.length} 个插件</span><span className="muted">本地 manifest</span></div>{plugins.length === 0 ? <div className="compact-empty"><span>＋</span><p>还没有插件</p><button type="button" className="text-button" onClick={() => void install()}>安装一个清单 →</button></div> : <div className="plugin-list">{plugins.map((plugin) => <div className="plugin-row" key={plugin.id}><span className="plugin-mark">P</span><div className="plugin-copy"><strong>{plugin.name} <small>v{plugin.version}</small></strong><p>{plugin.description || "没有描述"}</p><code>{plugin.id}</code><div className="plugin-permissions">{plugin.permissions.length ? plugin.permissions.map((permission) => <span key={permission}>{permission}</span>) : <span>无额外权限</span>}</div></div><button type="button" className={`small-button ${plugin.enabled ? "primary" : "subtle"}`} onClick={() => void onToggle(plugin)}>{plugin.enabled ? "已启用" : "启用"}</button></div>)}</div>}</section></div>;
}
