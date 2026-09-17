# 变更日志：思维灵光

## 1. 修改概述

- 为 NoahNote增加“思维灵光”功能，用于快速保存尚未成形的想法。
- 在现有 Inbox 数据链路上增加灵光类型和三阶段状态：刚想到、发酵中、已转行动。
- 增加独立的“思维灵光”导航页，支持筛选、转任务、转笔记、跨空间移动、归档和删除。
- 保留原有 Inbox、搜索、个人 / 工作空间和本地优先存储逻辑。

## 2. 需求来源

### 用户需求

记录想法，即“思维灵光”。

### 目标结果

用户可以快速记录一个想法，稍后将它标记为正在发酵，或转化为任务 / 笔记，同时保留原始灵光。

## 3. 修改范围

| 文件 | 类型 | 修改内容 |
| --- | --- | --- |
| `src/types.ts` | 修改 | 增加 `spark` 内容类型、`SparkStage` 和 `PageId` 页面入口。 |
| `src/lib/api.ts` | 修改 | 增加灵光状态更新 API。 |
| `src/App.tsx` | 修改 | 接入灵光创建、页面路由、状态更新、转化行为和 Inbox 过滤。 |
| `src/components/AppShell.tsx` | 修改 | 增加“思维灵光”侧边栏入口。 |
| `src/components/CommandPalette.tsx` | 修改 | 增加记录 / 打开思维灵光命令。 |
| `src/components/Modal.tsx` | 修改 | 增加灵光记录表单，并允许快速记录直接选择灵光类型。 |
| `src/pages/SparksPage.tsx` | 新增 | 实现灵光列表、状态筛选、状态修改和转化操作。 |
| `src/pages/InboxPage.tsx` | 修改 | 补充灵光类型兼容显示。 |
| `src/pages/OverviewPage.tsx` | 修改 | 增加“记录灵光”快捷入口。 |
| `src/styles/app.css` | 修改 | 增加灵光页面、状态标签和卡片操作样式。 |
| `src-tauri/src/models.rs` | 修改 | 增加 `SparkStage`、`InboxKind::Spark` 和可选灵光状态字段。 |
| `src-tauri/src/storage/database.rs` | 修改 | 增加 `spark_stage` 列、旧数据库迁移和读写映射。 |
| `src-tauri/src/workspace/repository.rs` | 修改 | 实现状态更新、灵光创建默认状态和转化后的原始记录保留。 |
| `src-tauri/src/commands.rs` | 修改 | 暴露 `update_spark_stage` Tauri 命令。 |
| `src-tauri/src/lib.rs` | 修改 | 注册新的 Tauri 命令。 |
| `docs/CHANGELOG-2026-09-17.md` | 新增 | 记录本轮开发变更。 |

## 4. 核心实现说明

### 修改前

Inbox 只支持笔记、任务、备忘和清单四类临时内容。内容没有独立的想法生命周期，也没有专门的回顾页面。

### 修改后

- `思维灵光` 复用 Inbox 的 JSON 文件和 SQLite 索引，不新增独立内容表。
- 新建灵光默认进入 `new` 状态；用户可以手动切换到 `developing` 或 `converted`。
- 从灵光转为任务 / 笔记时，继续创建目标内容，但原始灵光保留并标记为 `converted`；普通 Inbox 内容仍维持原有转化后归档行为。
- 旧的 Inbox JSON 没有 `sparkStage` 时按空值读取，旧记录不会受到影响；旧 SQLite 数据库启动时会自动增加可空的 `spark_stage` 列。
- 搜索仍复用 Inbox 的全文和语义索引，打开搜索结果时根据记录类型进入 Inbox 或思维灵光页面。

### 为什么这样实现

复用现有 Inbox 可以保持本地优先文件结构、搜索、备份和同步的一致性，减少重复数据模型，也方便将来继续增加 AI 整理和定期唤醒能力。

### 为什么没有采用其他方案

本轮没有新增独立的 `sparks` 数据表或独立同步目录，因为灵光当前仍属于“先记录、后整理”的轻量内容；独立表会扩大迁移、备份和同步范围。

## 5. 关键函数说明

### `WorkspaceRepository::update_spark_stage`

- 作用：更新一条灵光的生命周期状态。
- 输入：灵光 ID、目标状态。
- 输出：更新后的 `InboxItem`。
- 调用关系：`update_spark_stage` Tauri 命令 → Repository → JSON / SQLite / 搜索索引。
- 注意事项：只接受 `InboxKind::Spark`，普通 Inbox 内容会返回校验错误。

### `WorkspaceRepository::promote_inbox_item`

- 作用：将 Inbox 内容转为任务或笔记。
- 输入：内容 ID、目标类型。
- 输出：新建的任务或笔记 JSON 值。
- 调用关系：灵光页面 / Inbox 页面 → 前端 API → Tauri 命令 → Repository。
- 注意事项：灵光转化后保留原记录并标记为 `converted`；其他类型仍然归档原 Inbox 内容。

### `SparksPage`

- 作用：展示灵光、按状态筛选并提供状态与转化操作。
- 输入：当前空间中的灵光及现有 Inbox 操作回调。
- 输出：用户操作通过 App 层回写本地 Workspace。
- 调用关系：`App.tsx` 页面分发 → `SparksPage` → `api.updateSparkStage` / 既有 Inbox API。
- 注意事项：没有记录时提供空状态和直接创建入口。

## 6. 配置变更

无配置变更。

## 7. 影响范围分析

### 直接影响

- Inbox 数据模型和 SQLite `inbox` 表。
- 前端导航、快速记录、命令面板、总览快捷入口和新增思维灵光页面。
- 灵光的转任务 / 转笔记流程。

### 间接影响

- FTS5 和语义索引会继续索引灵光内容。
- 备份、恢复、重建索引和同步会自然携带新增的 `sparkStage` 字段。

### 风险点

- 当前版本没有自动 AI 分类、定时唤醒提醒和灵光正文编辑器，这些属于后续增强方向。
- 已转行动的灵光仍保留在灵光页面，需要用户手动归档。

### 兼容性

- 旧 Inbox JSON 缺少新字段时默认按普通旧记录读取。
- 已存在的 SQLite 数据库会在打开时自动迁移，新增列允许为空。
- 普通笔记、任务、备忘和清单的原有行为保持不变。

## 8. 验证记录

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| TypeScript / Vite 构建 | 是 | `npm run build` 通过。 |
| 前端单元测试 | 是 | `npm test` 通过，1 个测试文件、2 个测试用例。 |
| Rust 格式检查 | 是 | `cargo fmt --check` 通过。 |
| Rust 单元测试 | 是 | `cargo test` 通过，24 个测试全部通过。 |
| 灵光状态流转测试 | 是 | 新增测试覆盖新建、发酵、转任务和原始灵光保留。 |
| Windows Tauri 打包 | 是 | `npm run tauri build` 通过，生成 x64 NSIS 安装包。 |
| 实际交互式桌面验收 | 【未验证】 | 已完成构建级和后端行为验证，尚未手动点击验收完整 UI 流程。 |

备注：首次运行 Rust 测试时发现旧测试构造器缺少新增字段，已补充默认值后重新执行并通过；首次格式检查发现新增断言未换行，已执行 `cargo fmt` 修正。

## 9. 回滚方案

本目录没有 Git 历史可用于一键回滚。若需要撤销本轮，应恢复上述前端和 Rust 文件，删除 `src/pages/SparksPage.tsx` 与本变更记录，并让 SQLite 继续保留 `spark_stage` 可空列；该列不会影响旧逻辑。若要完全清理字段，需要先备份 Workspace，再执行数据库迁移并同步清理对应 JSON 字段。

## 10. 后续优化建议

1. 增加灵光编辑能力和目标任务 / 笔记的双向关联。
2. 增加可选的 AI 标题、摘要和标签整理，不改变默认本地优先策略。
3. 增加每日 / 每周灵光唤醒和回顾设置。
4. 为灵光增加附件、语音捕捉和系统托盘快速记录入口。
