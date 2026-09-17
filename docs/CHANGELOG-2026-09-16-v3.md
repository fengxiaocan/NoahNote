# 变更日志：NoahNote第三阶段

## 1. 修改概述

- 本阶段依据 需求文档.md 和已确认的开发计划，补齐知识库、双向链接、历史版本和回收站。
- 新增个人 / 工作空间隔离的知识库目录树，支持页面创建、重命名、删除、笔记复制和移动。
- 笔记与知识页面支持 [[页面标题]] 链接、反向链接、未解析链接、版本预览和版本恢复。
- 所有主要内容类型的删除操作先写入回收站，默认保留 30 天，支持恢复、永久删除和清理过期内容。
- 本阶段同时完成前端页面接入、Tauri 命令注册、SQLite 索引和文件重建兼容。

## 2. 需求来源

### 用户需求

用户要求“根据 需求文档.md，设计实现开发计划任务，然后开始实现”，并在阶段确认中确认知识库树、笔记与知识页面转换、双向链接、历史版本、回收站、30 天保留、个人 / 工作空间隔离和未解析链接范围。

### 目标结果

在现有本地优先 Workspace 基础上，让长期知识可以按目录组织并互相引用；让笔记和知识页面的显式保存可追溯；让删除操作可恢复，同时不破坏既有搜索、备份、同步和空间隔离。

## 3. 修改范围

| 文件 | 类型 | 修改内容 |
|------|------|----------|
| src-tauri/src/models.rs | 修改 | 增加知识库节点、Wiki 链接、文档版本、回收站模型及保留天数配置 |
| src-tauri/src/storage/database.rs | 修改 | 增加知识库、链接、版本、回收站表、索引、读写和 FTS 页面索引 |
| src-tauri/src/workspace/repository.rs | 修改 | 增加知识库 CRUD、笔记迁移、链接重建、版本快照、回收站恢复 / 清理和重建扫描 |
| src-tauri/src/commands.rs | 修改 | 暴露知识库、双链、版本、删除、回收站相关 Tauri 命令 |
| src-tauri/src/lib.rs | 修改 | 注册新增命令 |
| src/types.ts | 修改 | 同步前端领域类型、页面导航类型和配置类型 |
| src/lib/api.ts | 修改 | 封装新增 Tauri 调用和知识库输入类型 |
| src/App.tsx | 修改 | 接入新增状态、导航、搜索跳转、删除、版本恢复和回收站操作 |
| src/components/AppShell.tsx | 修改 | 增加知识库 / 回收站导航和知识页面搜索图标 |
| src/components/CommandPalette.tsx | 修改 | 增加打开知识库和回收站命令 |
| src/components/BacklinksPanel.tsx | 新增 | 展示本文引用、引用本文和未解析链接 |
| src/components/VersionHistoryPanel.tsx | 新增 | 展示版本列表、历史 Markdown 预览和恢复入口 |
| src/pages/KnowledgeBasePage.tsx | 新增 | 知识库目录树、页面编辑器、笔记导入和页面关联面板 |
| src/pages/TrashPage.tsx | 新增 | 回收站列表、恢复、永久删除和过期清理页面 |
| src/pages/NotesPage.tsx | 修改 | 增加删除、双链和版本历史入口 |
| src/pages/TasksPage.tsx | 修改 | 增加删除入口 |
| src/pages/ProjectsPage.tsx | 修改 | 增加删除入口 |
| src/pages/InboxPage.tsx | 修改 | 增加删除入口 |
| src/pages/SchedulePage.tsx | 修改 | 增加日程删除入口 |
| src/pages/ChecklistsPage.tsx | 修改 | 增加清单删除入口 |
| src/pages/TemplatesPage.tsx | 修改 | 增加模板删除入口 |
| src/pages/SettingsPage.tsx | 修改 | 增加回收站保留天数配置 |
| src/styles/app.css | 修改 | 增加知识树、双链、版本和回收站布局及响应式样式 |
| 开发计划任务.md | 修改 | 更新第三阶段任务状态、验收重点和后续边界 |

## 4. 核心实现说明

### 修改前

工作区只对笔记、任务、项目、Inbox、日程、Checklist 和模板提供文件 / SQLite 索引；删除能力和内容历史追踪不形成统一流程，知识库相关能力仍在延期范围内。

### 修改后

- 知识页面保存为各空间 knowledge/pages/*.md 与 .json，目录保存为 knowledge/folders/*.json，并由 SQLite 维护树形查询和搜索索引。
- 笔记与知识页面保存时创建 history/document-kind/entity-id/*.json 快照，并同步写入 document_versions。
- 正文中的 [[标题]] 和 [[标题|别名]] 被解析为链接记录；只有空间内存在唯一同名笔记或知识页面时才标记为已解析，否则保留未解析状态。
- 主要内容删除时先写入 trash/kind/*.json 和 SQLite 回收站记录，再移除规范文件；恢复时校验原目标路径，避免覆盖同 ID 内容。
- 启动、备份恢复和同步后重建流程会扫描新增目录，并重建知识页面、版本、回收站和 Wiki 链接索引。

### 为什么这样实现

采用“可读规范文件 + SQLite 查询索引 + manifest 快照”的组合，延续现有本地优先架构：文件便于备份、同步和人工迁移，SQLite 负责树查询、全文搜索和关系展示，manifest 让删除内容可以在文件缺失后仍可靠恢复。

### 为什么没有采用其他方案

本阶段没有引入独立图数据库、服务端版本系统或多 Workspace 抽象；这些方案会扩大本地离线应用的运行依赖和迁移成本，超出已确认的第三阶段范围。

## 5. 关键函数说明

### WorkspaceRepository::create_knowledge_page / update_knowledge_page

- 作用：创建或保存知识页面、维护父目录、revision、Markdown / JSON 文件、版本快照和链接索引。
- 输入：知识页面输入或完整页面模型。
- 输出：规范化后的 KnowledgePage。
- 调用关系：由对应 Tauri 命令调用，前端知识库页面通过 src/lib/api.ts 触发。
- 注意事项：标题在同一空间的知识目录 / 页面中保持唯一，父目录必须存在且不能形成循环。

### WorkspaceRepository::copy_note_to_knowledge

- 作用：将普通笔记复制为知识页面，可选地删除原笔记并使其进入回收站。
- 输入：笔记 ID、目标空间、父目录和移动标志。
- 输出：新建的知识页面。
- 调用关系：知识库导入弹窗 → 前端 API → Tauri 命令 → Repository。
- 注意事项：目标空间仍需是个人或工作空间；复制失败时不会删除原笔记。

### WorkspaceRepository::rebuild_wiki_links

- 作用：扫描所有笔记和知识页面正文，重建出链、目标解析和反向链接查询数据。
- 输入：当前 Workspace 中的规范文件 / SQLite 内容。
- 输出：更新 wiki_links 表。
- 调用关系：创建、更新、删除、恢复和启动重建流程调用。
- 注意事项：同名目标不唯一时保持未解析，避免误跳转。

### WorkspaceRepository::save_document_version

- 作用：写入笔记或知识页面的 JSON 快照和 SQLite 版本记录。
- 输入：实体 ID、文档类型、标题、正文、空间、revision 和快照对象。
- 输出：DocumentVersion。
- 调用关系：笔记 / 知识页面显式创建、更新和恢复流程调用。
- 注意事项：版本恢复会再次保存当前恢复结果，确保恢复操作本身可追踪。

### WorkspaceRepository::restore_trash_item / purge_expired_trash

- 作用：恢复回收站内容或按过期时间永久清理内容。
- 输入：回收站记录 ID，或当前时间。
- 输出：恢复后的 JSON 值，或清理数量。
- 调用关系：回收站页面命令调用；Workspace 启动时自动执行过期清理。
- 注意事项：恢复前检查原路径是否被同 ID 内容占用。

## 6. 配置变更

- 修改前：AppSettings 没有回收站保留期限。
- 修改后：增加 trashRetentionDays，默认值为 30，设置页面允许调整 1 至 3650 天。
- 影响原因：回收站需要可预测的自动清理策略，同时通过 serde 默认值兼容已有配置文件。

## 7. 影响范围分析

### 直接影响

- Workspace 目录新增 knowledge/、history/、trash/ 子目录。
- SQLite 启动时新增表和索引；已有数据库通过 CREATE TABLE IF NOT EXISTS 增量兼容。
- 前端主导航、命令面板、搜索结果和设置页增加对应入口。

### 间接影响

- 备份和同步会自然包含新增的 Markdown、JSON、历史和回收站文件；运行中的 SQLite 仍不进入备份 / 同步。
- 删除笔记后会重建 Wiki 链接，引用它的记录可能从已解析变为未解析。
- 知识页面标题进入全文搜索，搜索结果可直接打开知识库页面。

### 风险点

- 真实 Git / WebDAV 远端中的冲突处理和新增目录合并尚未进行交互式验证。
- 当前 UI 的 Markdown 预览仍是轻量解析器，不是完整 CommonMark 渲染器。
- 同名笔记 / 知识页面会保持未解析链接，需要后续增加目标选择或命名空间体验。

### 兼容性

- 旧 Workspace 的配置字段缺失时自动使用默认回收站保留天数。
- 旧内容无需迁移脚本；打开 Workspace 时会增量创建表并重建索引。
- 原有笔记、任务、项目、Inbox、日程、Checklist、模板和备份流程保持原命令入口。

## 8. 验证记录

| 验证项 | 结果 | 说明 |
|------|------|------|
| npm run build | 是 | TypeScript 编译和 Vite 生产构建通过 |
| npm test | 是 | 1 个测试文件、2 个测试用例通过 |
| cargo fmt --all -- --check | 是 | Rust 格式检查通过 |
| cargo clippy --all-targets --all-features -- -D warnings | 是 | Clippy 零警告通过 |
| cargo test | 是 | 10 个 Rust 测试通过，覆盖知识库、双链、版本和回收站回归 |
| npm run tauri build | 是 | Windows x64 NSIS 安装包生成成功 |
| 真实桌面 UI 手动流程 | 【未验证】 | 本环境未执行交互式安装 / 点击验收 |
| 真实 Git / WebDAV 远端 | 【未验证】 | 本阶段只完成代码级兼容，未连接真实远端 |
| Linux / macOS 打包 | 【未验证】 | 本环境为 Windows |

产物：src-tauri/target/release/bundle/nsis/NoahNote_0.1.0_x64-setup.exe。

## 9. 回滚方案

- 代码回滚：恢复本日志“修改范围”列出的源码、样式和计划文件；当前目录没有 Git 历史，需使用外部备份或手工恢复。
- 数据回滚：保留现有 Workspace 备份后，再移除新增 knowledge/、history/、trash/ 目录和新增 SQLite 表；SQLite 索引可通过重建恢复。
- 配置回滚：删除 trashRetentionDays 后，旧版本会使用默认配置；回退前应确认新版本创建的内容已导出或备份。
- 回滚风险：直接删除回收站和历史目录会永久丢失版本 / 可恢复内容，必须先备份 Workspace。

## 10. 后续优化建议

1. 增加同名链接的目标选择、链接重命名和页面级引用导航。
2. 将版本历史扩展到任务、项目等结构化内容，或提供统一差异对比。
3. 为回收站增加批量操作、按类型过滤和过期倒计时提示。
4. 补充真实桌面 UI、Git / WebDAV 远端和跨平台打包验收。
5. 继续实现月视图、重复日程、多 Workspace、加密和更完整的 Markdown 渲染。
