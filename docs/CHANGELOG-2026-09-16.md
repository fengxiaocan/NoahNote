# 变更日志：NoahNote MVP

## 1. 修改概述

- 基于需求文档完成 Tauri 2 + Rust + React + TypeScript + SQLite 的 MVP 工程。
- 建立个人 / 工作双空间、本地优先数据模型和可读的 Markdown / JSON 工作区。
- 完成总览、Inbox、今天、任务、笔记、项目、设置及全局搜索工作台。
- Inbox 支持在个人 / 工作空间之间移动，并在移动时清理旧空间文件。
- 完成本地 ZIP 备份 / 安全恢复、Git 基础同步和 WebDAV 基础同步。
- 增加命令面板、快捷捕获、附件复制、自动重建索引和基础自动化验证。

## 2. 需求来源与范围

需求来源为根目录 [需求文档.md](../需求文档.md)，本轮采用其中“65. MVP 第一阶段”的范围：个人 / 工作空间、笔记、任务、项目、今天、Inbox、Markdown、附件、标签、搜索、本地存储、备份、WebDAV 和 Git 同步。

已将任务拆解和完成状态记录在 [开发计划任务.md](../开发计划任务.md)。日程、Checklist、模板、知识库、历史版本、多 Workspace、S3 / SFTP / SMB / NAS、加密、AI、OCR、PDF 高级能力、插件和可视化冲突合并保持延期。

## 3. 修改范围

| 区域 | 文件 | 作用 |
| --- | --- | --- |
| 工程配置 | `package.json`、`package-lock.json`、`tsconfig*.json`、`vite.config.ts`、`vitest.config.ts`、`index.html`、`.gitignore` | 前端构建、测试和 Tauri 开发入口 |
| 领域模型 | `src-tauri/src/models.rs`、`src/types.ts` | 空间、笔记、任务、项目、Inbox、备份和同步模型 |
| 本地数据库 | `src-tauri/src/storage/database.rs`、`src-tauri/src/storage/mod.rs` | SQLite 表、FTS5 搜索、标签聚合和索引读写 |
| 工作区 | `src-tauri/src/workspace/repository.rs`、`src-tauri/src/workspace/mod.rs` | Markdown / JSON 文件持久化、重建索引、附件和 CRUD |
| 备份同步 | `src-tauri/src/backup.rs`、`src-tauri/src/sync.rs` | ZIP 备份恢复、Git 和 WebDAV 同步 |
| Tauri API | `src-tauri/src/commands.rs`、`src-tauri/src/lib.rs`、`src-tauri/src/main.rs`、`src-tauri/src/error.rs` | 后端命令暴露、应用状态和统一错误返回 |
| 前端工作台 | `src/App.tsx`、`src/components/*`、`src/pages/*` | 页面路由式状态切换、弹窗、命令面板和业务交互 |
| 前端基础 | `src/lib/*`、`src/styles/*`、`src/main.tsx`、`src/test/setup.ts` | API 封装、格式化、Markdown 预览、布局样式和测试初始化 |
| Tauri 配置 | `src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json`、`src-tauri/build.rs`、`src-tauri/icons/*` | Rust 依赖、窗口、权限、图标和 Windows NSIS 打包 |
| 文档 | `README.md`、`开发计划任务.md` | 使用说明、快捷键、数据目录和计划状态 |

## 4. 核心实现

### 4.1 本地优先数据链路

- 工作区创建为 `personal/`、`work/`、`database/`、`backups/`、`config/`，每个内容空间包含 notes、tasks、projects、inbox 和 attachments。
- 笔记正文存为 `{space}/notes/{uuid}.md`，元数据存为同名 JSON；任务、项目和 Inbox 存为 JSON。
- 附件以 `{uuid}-{原文件名}` 保存，并用同目录 JSON sidecar 保存关联信息，保证重建索引和恢复后仍可识别。
- SQLite 只承担本地查询索引，启动和同步拉取后会从规范文件重建索引。
- 所有对象使用 UUID，并记录创建时间、更新时间、设备 ID、工作区 ID 和 revision。
- 文件写入采用临时文件 + 替换，避免直接覆盖过程中留下半文件。
- 归档内容会从 FTS5 索引中移除；任务和项目跨空间更新时会清理原空间文件。

### 4.2 工作台交互

- 顶部提供全部 / 个人 / 工作切换；页面列表和搜索按空间过滤。
- 总览聚合今日任务、Inbox、项目和最近笔记。
- Inbox 支持转任务、转笔记和归档；笔记支持 Markdown 编辑 / 预览、标签、项目和附件入口。
- 任务支持状态切换、优先级、截止日期、项目、标签和父任务字段；项目支持状态和进度。
- `Ctrl/Cmd + K` 搜索，`Ctrl/Cmd + P` 命令面板，`Ctrl/Cmd + Shift + Space` 快速捕获到 Inbox，`Alt + 1/2/3` 切换空间。

### 4.3 备份与同步

- ZIP 备份只打包规范工作区文件，不打包运行中的 SQLite 数据库；恢复前自动生成安全备份。
- 恢复过程校验文件名和 ZIP 路径，过滤不安全条目，并在恢复后补全空目录、重载设置和重建索引。
- Git 同步通过本机 Git CLI 执行 status、pull、commit、push；冲突路径会额外复制到备份目录。
- Git pull 失败时会先检查工作树冲突，尽可能生成冲突副本；非冲突错误仍原样返回。
- WebDAV 使用 manifest 描述规范文件，支持递归创建远端目录、PUT 推送和 GET 拉取。

## 5. 关键函数与行为

- `WorkspaceRepository::create_note / update_note`：规范化标题和标签，维护 revision，写入 Markdown + 元数据并更新 SQLite。
- `WorkspaceRepository::move_inbox_item`：跨个人 / 工作移动 Inbox，并保持规范文件与索引一致。
- `WorkspaceRepository::reindex`：清空索引后扫描 personal / work 的 Markdown 和 JSON 文件。
- `Database::search`：通过 SQLite FTS5 对标题、正文和标签执行本地全文检索。
- `backup::restore`：安全解压、恢复前快照、目录补全和索引重建。
- `sync::run`：统一分发 Git / WebDAV 的 status、pull、push 操作。
- `commands.rs`：将设置、内容 CRUD、搜索、附件、备份和同步暴露给前端。
- `App.tsx`：负责当前空间、页面、数据刷新、快捷键和 Tauri API 调度。

## 6. 配置与依赖变化

- 前端新增 React、Tauri API、Tauri dialog 插件、Vite、Vitest 和 TypeScript 构建依赖。
- Rust 新增 `rusqlite`（bundled）、`reqwest`、`zip`、`walkdir`、`chrono`、`uuid` 和 Tauri dialog 插件。
- Tauri 窗口默认 1440 × 900，最小 1080 × 680；权限包含核心能力和文件选择对话框。
- Windows 打包目标固定为 NSIS，产物为 `src-tauri/target/release/bundle/nsis/NoahNote_0.1.0_x64-setup.exe`。当前环境缺少 WiX MSI 工具链，因此未启用 MSI 目标。

## 7. 影响、风险与兼容性

- 本轮是新工程初始化，未修改需求文档；默认会在系统应用数据目录创建新的 `workspace`。
- SQLite 数据库是可重建缓存，规范数据仍是 Markdown / JSON / 附件目录，便于手动迁移和同步。
- WebDAV 用户名和密码目前随本地设置保存，生产版应改为系统凭据库或加密存储。
- Git / WebDAV 需要用户提供已可用的远端地址和凭据；同步失败会返回错误，不会把 SQLite 纳入远端规范文件。
- 当前只验证 Windows 构建；Linux / macOS 打包和桌面行为尚未在本机验证。

## 8. 验证记录

| 命令 | 结果 |
| --- | --- |
| `npm run build` | 通过，TypeScript 编译和 Vite 生产构建成功 |
| `npm test` | 通过，1 个测试文件、2 个测试用例 |
| `cargo fmt -- --check` | 通过 |
| `cargo clippy --all-targets --all-features -- -D warnings` | 通过 |
| `cargo test` | 通过，5 个 Rust 单元测试 |
| `npm run tauri build` | 通过，生成 Windows x64 NSIS 安装包 |
| 实际 Git / WebDAV 远端同步 | 【未验证】当前环境没有指定远端服务和凭据 |
| 手动启动桌面 UI 与跨平台行为 | 【未验证】已完成构建级验证，尚未进行交互式验收 |

## 9. 回滚方式

本目录当前没有 Git 历史可用于一键回滚。若需要撤销本轮，可保留 [需求文档.md](../需求文档.md)，移除本轮新增的 `src/`、`src-tauri/`、前端工程配置、`README.md` 的新增段落、[开发计划任务.md](../开发计划任务.md) 和 `docs/`，并同步移除 `package.json` 中新增依赖后重新安装依赖。

## 10. 后续优化

1. 增加真实 Git / WebDAV 测试服务和冲突可视化合并。
2. 完善任务编辑、子任务树、标签管理、收藏、归档和活动时间线。
3. 引入成熟 Markdown 编辑器和完整 GFM / 附件内嵌预览。
4. 增加本地目录同步、S3 / NAS / SFTP、加密存储和跨平台打包流水线。
