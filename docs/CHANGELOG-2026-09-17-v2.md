# 开发变更记录

## 1. 修改概述

- 在项目根目录新增 Windows 和 Linux 的 Tauri 打包脚本。
- Windows 脚本生成 x64 NSIS 安装包，Linux 脚本生成 AppImage 和 DEB 安装包。
- 脚本会自动定位项目根目录，并在依赖目录不存在或显式要求时执行 `npm ci`。
- README 增加了两个脚本的使用方式和 Linux 系统依赖提示。

## 2. 需求来源

### 用户需求

在根目录下提供编译 Windows 版本和 Linux 版本的脚本。

### 目标结果

用户可以分别在 Windows 和 Linux 环境中直接运行对应脚本，调用现有 Tauri 构建流程生成平台安装包。

## 3. 修改范围

| 文件 | 类型 | 修改内容 |
| --- | --- | --- |
| `build-windows.ps1` | 新增 | Windows PowerShell 打包脚本，生成 NSIS 安装包 |
| `build-linux.sh` | 新增 | Linux Bash 打包脚本，生成 AppImage 和 DEB 安装包 |
| `README.md` | 修改 | 增加脚本用法和平台打包说明 |

## 4. 核心实现说明

### 修改前

项目只有通用的 `npm run tauri build` 命令，Tauri 配置中的默认 bundle target 是 Windows NSIS，Linux 用户没有明确的平台打包入口。

### 修改后

- `build-windows.ps1` 调用 `npm run tauri build -- --bundles nsis`。
- `build-linux.sh` 调用 `npm run tauri build -- --bundles appimage,deb`，覆盖默认的 Windows bundle target。
- 两个脚本都从自身位置解析项目根目录，避免从其他工作目录执行时找不到 `package.json`。
- 默认复用已有 `node_modules`，传入 `-Install` 或 `--install` 时重新执行 `npm ci`。

### 为什么这样实现

将平台 bundle target 放在脚本中显式指定，可以保留现有 Tauri 配置的 Windows NSIS 默认行为，同时避免 Linux 构建误使用 NSIS。

### 为什么没有采用其他方案

没有自动安装 Linux 系统依赖或使用 `sudo`，因为 WebKitGTK、AppIndicator 等依赖与发行版有关，交由目标 Linux 环境按发行版文档准备更安全。

## 5. 关键函数说明

### `build-windows.ps1`

- 作用：在 Windows 上构建 Tauri NSIS 安装包。
- 输入：可选 `-Install` 参数。
- 输出：`src-tauri/target/release/bundle/nsis` 下的安装包。
- 调用关系：检查 npm → 可选执行 `npm ci` → 执行 Tauri Windows 构建。
- 注意事项：需要 Node.js、Rust、Tauri Windows 打包工具链。

### `build-linux.sh`

- 作用：在 Linux 上构建 AppImage 和 DEB 安装包。
- 输入：可选 `--install` 参数。
- 输出：`src-tauri/target/release/bundle/appimage` 和 `src-tauri/target/release/bundle/deb`。
- 调用关系：检查 npm → 可选执行 `npm ci` → 执行 Tauri Linux 构建。
- 注意事项：需要目标发行版提供 Tauri/WebKitGTK 等系统依赖。

## 6. 配置变更

无 Tauri 配置变更。Linux bundle target 通过脚本命令行参数覆盖，不改变现有 Windows 默认配置。

## 7. 影响范围分析

### 直接影响

根目录构建入口、README 使用说明。

### 间接影响

生成产物仍使用 `src-tauri/target/release`，不会改变应用运行时数据目录和前端开发流程。

### 风险点

Linux 打包依赖发行版系统库；如果目标环境未安装这些库，脚本会在 Tauri 构建阶段失败。

### 兼容性

不影响现有 `npm run tauri dev`、`npm run build` 和 `npm run tauri build` 命令。

## 8. 验证记录

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| PowerShell 脚本语法 | 是 | Windows PowerShell 5.1 解析通过，并完成实际执行 |
| Windows Tauri 打包 | 是 | 生成 `src-tauri/target/release/bundle/nsis/NoahNote_0.1.0_x64-setup.exe` |
| Linux Bash 语法 | 【未验证】 | 当前环境没有可用的 Bash，WSL 也未完成安装/初始化 |
| Linux Tauri 打包 | 【未验证】 | 当前环境为 Windows，未具备 Linux WebKitGTK 打包环境 |

## 9. 回滚方案

删除 `build-windows.ps1`、`build-linux.sh`，并移除 README 中的“打包脚本”章节即可；不会影响现有源代码或 Workspace 数据。

## 10. 后续优化建议

- 在 Linux CI 或真实 Linux 主机上执行一次完整 AppImage/DEB 构建。
- 按项目支持的发行版补充系统依赖安装说明或 CI 镜像。
