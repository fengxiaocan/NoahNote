# 2026-09-16 第 2 组能力完善

## 1. 目标

依据《需求文档.md》和《开发计划任务.md》“本轮完善第 2 组”，补齐已有基础实现的同步、语义搜索和 AI 隐私边界，并把可验证的同步状态暴露到设置页。

## 2. 同步

- manifest 升级为 v2，记录相对路径、文件大小和 SHA-256；读取时兼容旧版字符串路径数组。
- 为非 Git Provider 保存本地基线快照，用于识别本地和远端同时修改的文件。
- WebDAV、本地目录、SMB/NAS、S3、SFTP 的普通 pull / push 在发现冲突时跳过冲突文件并返回路径列表。
- 设置页提供“保留远端版本”和“保留本地版本”的显式覆盖操作；Git 冲突仍交给 Git 原生合并流程。
- 对基线中被远端删除、且本地未修改的文件执行安全删除；本地已修改的文件不会被静默删除。
- 新增同步历史命令和设置页展示，记录成功、冲突、失败结果，最多保留 100 条。
- 同步范围纳入受控 `plugins` 目录，仍排除 `config`、SQLite 数据库和运行时文件。

## 3. 语义搜索

- 语义索引覆盖任务、项目、Inbox、日程、Checklist、模板、笔记、知识页和 PDF。
- 内容归档或关闭语义索引时清理对应的旧记录；重新开启时从全部内容重建。
- 增加全量结构化内容索引和索引开关清理的回归测试。

## 4. AI 隐私

- Local Provider 即使配置了远端 Endpoint，也必须显式开启“允许发送内容到外部 Endpoint”。
- 增加远端 Endpoint 被拦截的单元测试。

## 5. 验证

- `cargo fmt --all -- --check`：通过。
- `cargo clippy --all-targets --all-features -- -D warnings`：通过。
- `cargo test`：22 个 Rust 测试通过。
- `npm test`：2 个前端测试通过。
- `npm run build`：通过。
- `npm run tauri build`：通过，安装包为 `src-tauri/target/release/bundle/nsis/NoahNote_0.1.0_x64-setup.exe`。

## 6. 未完成与边界

- 尚未使用真实 S3、SFTP、SMB/NAS 凭据进行联调，也未执行真实 OCR 命令或 AI Endpoint 验收。
- 插件仍是经过权限校验的 manifest 生命周期管理，不执行任意插件代码，也不连接市场；运行时沙箱需要单独设计。
- 同步和 AI 的账号、密钥字段仍由现有 `settings.json` 配置机制保存，操作系统密钥环 / 加密存储尚未实现。
- 多 Workspace、端到端加密、Git 可视化合并及需求文档中其他延期项保持未完成状态。
