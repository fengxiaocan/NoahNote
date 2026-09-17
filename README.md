# NoahNote

基于 Tauri 2、Rust、React、TypeScript 和 SQLite 的本地优先个人与工作综合助手。

## 开发

```bash
npm install
npm run tauri dev
```

## 验证

```bash
npm run build
npm test
npm run tauri build
```

## 打包脚本

Windows PowerShell：

```powershell
.\build-windows.ps1
# 需要重新安装依赖时：
.\build-windows.ps1 -Install
```

Linux：

```bash
bash ./build-linux.sh
# 需要重新安装依赖时：
bash ./build-linux.sh --install
```

Windows 脚本生成 NSIS 安装包，Linux 脚本生成 AppImage 和 DEB 安装包。Linux 构建仍需要先准备 Tauri/WebKitGTK 等系统依赖。

## MVP 能力

- 总览、Inbox、今日、任务、日程、笔记、项目、Checklist、模板与设置工作台
- 个人 / 工作空间切换，以及标题、正文、标签和项目关联
- Markdown 笔记编辑与预览、任务状态和优先级、项目进度
- 日程支持日 / 周 / 列表视图、时间块、全天事件、任务 / 项目关联；Checklist 支持逐项完成和排序；模板支持快速创建四类内容
- SQLite FTS5 本地搜索、命令面板、快捷捕获、附件复制入库
- 本地 ZIP 备份 / 安全恢复、Git 同步和 WebDAV 同步配置

常用快捷键：`Ctrl/Cmd + K` 聚焦搜索，`Ctrl/Cmd + P` 打开命令面板，`Ctrl/Cmd + N` 新建笔记，`Ctrl/Cmd + Shift + Space` 快速捕获 Inbox。

数据默认保存在操作系统应用数据目录下的 `workspace` 文件夹中。笔记使用 Markdown，任务、项目、Inbox、日程、Checklist 和模板元数据使用 JSON，SQLite 仅作为本地索引。Git 同步依赖本机 Git 凭据配置；WebDAV 需要可访问的服务地址。
