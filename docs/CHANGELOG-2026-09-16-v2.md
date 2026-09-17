# 变更日志：NoahNote第二阶段

## 1. 修改概述

- 在第一阶段本地优先闭环基础上，增加日程 / 时间块、Checklist 和静态模板。
- 日程支持日、周、列表视图，以及日期、时间、全天、备注、任务 / 项目关联和归档。
- Checklist 支持独立创建、逐项完成、排序、删除、说明、标签和归档。
- 模板支持笔记、任务、项目、Checklist 四种类型，可编辑默认 JSON 内容并快速生成目标空间内容。
- 总览、全局搜索、命令面板和个人 / 工作空间切换已接入新增类型。

## 2. 需求来源与范围

需求来源为根目录 [需求文档.md](../需求文档.md)。本阶段依据已确认的第二阶段子范围实现：日程 / 日历、任务时间块、独立 Checklist、静态模板。

需求文档中列出的月视图、重复日程、提前提醒、地点、日程附件、日程关联笔记、任务拖拽排程、知识库、双向链接、历史版本和多 Workspace，以及同步后端扩展，继续作为后续阶段边界。

任务状态已同步到 [开发计划任务.md](../开发计划任务.md)。

## 3. 修改范围

| 区域 | 文件 | 作用 |
| --- | --- | --- |
| 领域模型 | `src-tauri/src/models.rs`、`src/types.ts` | 增加日程、Checklist、ChecklistItem、Template 和 TemplateKind |
| SQLite | `src-tauri/src/storage/database.rs` | 增加 events、checklists、templates 表、索引读写和 FTS 搜索 |
| 工作区 | `src-tauri/src/workspace/repository.rs` | 增加 JSON 持久化、重建索引、校验、归档和模板实例化 |
| Tauri API | `src-tauri/src/commands.rs`、`src-tauri/src/lib.rs` | 暴露新增内容的列表、读取、创建、更新、归档和使用模板命令 |
| 前端 API | `src/lib/api.ts` | 封装新增命令及输入类型 |
| 页面 | `src/pages/SchedulePage.tsx`、`ChecklistsPage.tsx`、`TemplatesPage.tsx` | 增加三类功能页面 |
| 工作台 | `src/App.tsx`、`src/components/AppShell.tsx`、`CommandPalette.tsx`、`Modal.tsx`、`OverviewPage.tsx` | 接入导航、弹窗、搜索跳转、快捷入口和总览卡片 |
| 样式 | `src/styles/app.css` | 增加日历、事件卡片、Checklist 和模板编辑器布局及响应式规则 |
| 文档 | `README.md`、`开发计划任务.md` | 更新能力说明、任务状态和后续边界 |

## 4. 核心实现

### 4.1 日程与时间块

- 日程规范文件保存于 `personal/events/*.json` 或 `work/events/*.json`。
- 后端校验日期为 `YYYY-MM-DD`，非全天日程必须提供 `HH:mm` 开始 / 结束时间且结束时间晚于开始时间。
- 全天事件会清除时间字段；列表查询支持空间、日期起止范围和归档过滤。
- 前端提供日、周、列表三种视图；周视图以周一为起点，事件卡片可打开编辑器。

### 4.2 Checklist

- Checklist 保存于各空间的 `checklists/*.json`，项目独立于任务状态体系。
- 保存时会清理空项目、补齐缺失 ID、重新编号 position，并将标题、说明和项目内容写入 FTS5。
- 编辑器支持完成切换、上下移动、删除、追加项目和归档。

### 4.3 模板

- 模板保存于各空间的 `templates/*.json`，payload 使用 JSON 记录类型对应的默认字段。
- 创建和更新时按类型反序列化校验 payload；使用模板时覆盖目标空间并复用既有内容创建流程。
- 模板生成目标支持笔记、任务、项目和 Checklist，目标空间跟随当前空间选择；全部空间时使用默认空间。

## 5. 数据一致性与兼容

- 新增 SQLite 表使用 `CREATE TABLE IF NOT EXISTS`，对已有第一阶段工作区采用增量创建，不要求迁移旧内容。
- 启动、备份恢复和同步拉取后的重建索引会扫描新增的 events、checklists、templates 目录。
- Git / WebDAV 的规范文件扫描继续覆盖 `personal/` 和 `work/`，本地 ZIP 备份仍排除运行中的 SQLite 数据库。
- 归档日程和 Checklist 会从 FTS5 搜索索引移除；模板本身不作为搜索结果，但可通过模板页面使用。

## 6. 关键函数与行为

- `WorkspaceRepository::create_event / update_event`：校验时间、维护 revision、写入 JSON 并更新事件索引。
- `WorkspaceRepository::create_checklist / update_checklist`：规范化清单项目并保持文件、数据库一致。
- `WorkspaceRepository::create_template / create_from_template`：校验模板 payload，并复用现有 CRUD 创建目标内容。
- `Database::list_events / list_checklists / list_templates`：执行空间、时间范围和归档过滤。
- `App.tsx`：刷新新增集合、调度新增命令、遵循当前空间使用模板并处理页面跳转。

## 7. 验证记录

| 命令 | 结果 |
| --- | --- |
| `npm run build` | 通过，TypeScript 编译和 Vite 生产构建成功 |
| `npm test` | 通过，1 个测试文件、2 个测试用例 |
| `cargo fmt --all -- --check` | 通过 |
| `cargo clippy --all-targets --all-features -- -D warnings` | 通过 |
| `cargo test` | 通过，8 个 Rust 单元测试；覆盖日程时间 / 日期筛选、Checklist 规范化、模板跨空间实例化和重启重建 |
| `npm run tauri build` | 通过，生成 Windows x64 NSIS 安装包 |

产物：`src-tauri/target/release/bundle/nsis/NoahNote_0.1.0_x64-setup.exe`。

以下项目尚未在本环境进行交互式验证：真实 Git / WebDAV 远端、完整手动桌面 UI 流程、Linux / macOS 打包和多屏 / 极端窗口尺寸行为。

## 8. 影响、风险与兼容性

- 新增内容默认写入现有应用数据目录下的 Workspace，不影响 `需求文档.md`。
- 目前日程不含重复、提醒、地点、附件和笔记关联；这些字段后续增加时需要同步更新模型、JSON、SQLite 和 UI。
- 模板编辑器面向 JSON 使用者，当前提供基本格式校验；后续可按类型改为结构化表单。
- WebDAV 凭据仍沿用第一阶段本地设置保存方案，生产版应接入系统凭据库或加密存储。

## 9. 回滚方式

当前目录没有 Git 历史可用于一键回滚。本阶段变更集中在上表文件；如需回退，可按本日志的修改范围移除新增页面、模型、命令和样式，并恢复 `README.md`、`开发计划任务.md`。已生成的 events、checklists、templates JSON 可在回退前备份，SQLite 为可重建索引。

## 10. 后续优化

1. 增加月视图、重复规则、提前提醒、地点、附件和笔记关联。
2. 增加任务拖拽到日历的时间块排程，以及日程与任务截止日期的联动。
3. 将模板编辑从通用 JSON 升级为按类型的结构化表单，并增加内置模板种子数据。
4. 增加真实同步服务测试、手动 UI 验收和跨平台构建流水线。
5. 继续实现知识库树、双向链接、历史版本、回收站和多 Workspace。
