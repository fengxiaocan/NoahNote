# 开发变更记录

## 1. 修改概述

- 移除 NoahNote 右上角显示“你”的账户入口，避免界面出现无实际功能的用户标识。
- 修正 Windows 应用隐藏控制台的配置位置，确保 release 可执行文件以 GUI 子系统启动。
- 保留开发模式的调试输出能力；打包后的 Windows 应用启动时不再弹出命令行窗口。

## 2. 需求来源

### 用户需求

把右上角的用户你去掉，启动的时候，不要显示命令行。

### 目标结果

右上角不再显示用户“你”；双击 Windows release 应用或安装后的快捷方式时，只显示 NoahNote 窗口，不显示控制台窗口。

## 3. 修改范围

| 文件 | 类型 | 修改内容 |
| --- | --- | --- |
| `src/components/AppShell.tsx` | 修改 | 移除右上角账户按钮。 |
| `src/styles/app.css` | 修改 | 删除账户按钮的专用样式，并将通用按钮样式限定为刷新按钮。 |
| `src-tauri/src/main.rs` | 修改 | 在 Windows 二进制入口添加 release GUI 子系统属性。 |
| `src-tauri/src/lib.rs` | 修改 | 移除原先放在库 crate 上的 Windows 子系统属性。 |
| `docs/CHANGELOG-2026-09-17-v3.md` | 新增 | 记录本次界面与启动行为变更。 |

## 4. 核心实现说明

### 修改前

- `AppShell` 的顶部操作区最后渲染一个标题为“当前账户”、内容为“你”的按钮。
- `windows_subsystem = "windows"` 写在 `lib.rs`，未作用于负责生成 Windows `.exe` 的二进制 crate 根文件，因此 release 应用仍可能以控制台子系统启动。

### 修改后

- 删除账户按钮 JSX 及其 `.avatar-button` 样式，顶部仍保留空间切换、快速记录和刷新操作。
- 将 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` 放到 `main.rs` 的 crate 根部，并从 `lib.rs` 移除。
- release 构建的 PE 子系统已检查为 `2`（Windows GUI），不会创建控制台窗口。

### 为什么这样实现

账户按钮没有对应的账户状态或交互逻辑，直接移除可以避免保留无效入口。Windows 子系统属性必须作用于最终二进制 crate，放在 `main.rs` 能确保 Tauri release 可执行文件采用 GUI 启动方式。

### 为什么没有采用其他方案

没有通过 CSS 隐藏账户按钮，因为那会保留无效的可访问元素和账户入口逻辑；没有修改 Tauri 开发命令，因为开发模式保留控制台有助于查看调试日志，用户要求的打包启动行为已由 release 子系统配置解决。

## 5. 关键函数说明

### `main`

- 作用：调用 Tauri 库 crate 的应用启动函数。
- 输入：无。
- 输出：启动 NoahNote 桌面应用。
- 调用关系：Windows 可执行文件入口 → `noah_assistant_lib::run()`。
- 注意事项：crate 根部的 Windows GUI 子系统属性仅在 release 构建启用。

## 6. 配置变更

### 修改前

Windows 子系统属性位于 `src-tauri/src/lib.rs`，最终二进制入口 `main.rs` 未声明该属性。

### 修改后

Windows release 子系统属性位于 `src-tauri/src/main.rs`，使用 `cfg_attr(not(debug_assertions), windows_subsystem = "windows")`。

### 影响原因

让最终 Windows `.exe` 以 GUI 子系统运行，避免安装后或直接双击 release 应用时显示命令行窗口；debug 模式仍保留控制台输出。

## 7. 影响范围分析

### 直接影响

- 顶部导航栏的视觉布局不再包含账户头像/文字按钮。
- Windows release 应用的启动窗口行为。

### 间接影响

- 顶部操作区右侧宽度略有缩减，空间切换、快速记录和刷新功能不受影响。
- 发布包启动时不再方便通过控制台查看标准错误输出，故开发模式仍保留调试控制台。

### 风险点

- 未提供账户入口的替代功能；当前项目没有账户管理逻辑，因此不影响现有数据流。
- 本次未进行手动双击安装包的完整 UI 验收。

### 兼容性

- 不改变 Workspace 数据格式、Tauri 命令、前端路由或同步逻辑。
- release 行为兼容现有 Windows 安装包；debug 启动行为保持原有调试输出方式。

## 8. 验证记录

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| TypeScript / Vite 构建 | 是 | `npm run build` 通过。 |
| 前端单元测试 | 是 | `npm test` 通过，1 个测试文件、2 个测试用例。 |
| Rust 格式检查 | 是 | `cargo fmt --check` 通过。 |
| Rust 编译检查 | 是 | `cargo check` 通过。 |
| Windows Tauri release 构建 | 是 | `npm run tauri build -- --bundles nsis` 通过，生成 x64 NSIS 安装包。 |
| 账户按钮引用检查 | 是 | 源码中未发现 `avatar-button` 或“当前账户”引用。 |
| Windows PE 子系统检查 | 是 | `noah_assistant.exe` Subsystem=2，即 Windows GUI（无控制台）。 |
| 实际双击安装包验收 | 【未验证】 | 已验证 release exe 的 PE 子系统，尚未手动安装并双击验收。 |

## 9. 回滚方案

恢复 `src/components/AppShell.tsx`、`src/styles/app.css`、`src-tauri/src/main.rs` 和 `src-tauri/src/lib.rs` 的本次修改即可。若恢复旧的账户按钮，同时恢复 `.avatar-button` 样式；若恢复旧的启动配置，Windows release 应用可能再次显示控制台窗口。

## 10. 后续优化建议

- 如未来加入多用户或账户设置，再单独设计账户入口及其交互逻辑。
- 如需调试 release 运行日志，可增加文件日志或开发者工具入口，而不是恢复控制台窗口。
