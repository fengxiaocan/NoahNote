# 2026-09-16 正式第三阶段变更

## 1. 目标

依据《需求文档.md》第 67 节，完成 S3、NAS、SFTP、AI、OCR、PDF 管理、语义搜索和插件系统的本地优先基础能力。

## 2. 数据层

- 新增 PDF 文档表与 sidecar 元数据：永久 UUID、文件名、相对路径、大小、SHA-256、页数、文本、OCR 状态、revision 等。
- 新增本地语义索引表；SQLite FTS5 继续作为全文搜索和语义搜索回退。
- 旧版 `settings.json` 缺失第三阶段字段时自动使用兼容默认值。

## 3. 同步

- 新增本地目录、SMB/NAS 路径、S3 兼容存储和 SFTP Provider。
- 本地目录 / SMB 使用 Workspace manifest 和安全复制；S3 使用 AWS SigV4；SFTP 使用系统 OpenSSH 批处理。
- 同步只处理 `personal` / `work` 内容文件，不复制运行中的 SQLite 数据库。
- 同步目标禁止位于 Workspace 内部；远端 manifest 路径必须落在受控内容空间。

## 4. PDF 与 OCR

- 支持导入 PDF、原文件保存、内嵌预览、导出、文本抽取和本地检索。
- OCR 为可配置本地命令适配器，支持 `{input}` / `{output}` 占位符与超时控制。
- OCR 默认关闭，不会自动上传 PDF；OCR 文本会回写文档并重新建立索引。

## 5. AI

- 支持 Local、OpenAI Compatible、Custom API Provider。
- AI 默认关闭；外部 Endpoint 需要单独打开允许外部请求，API Key 不进入错误信息。
- 提供摘要、标题、标签、会议纪要、任务拆分和问答入口。

## 6. 语义搜索

- 使用确定性的本地字符 n-gram / token 哈希向量建立离线语义索引。
- 全局搜索与 PDF 页面支持 FTS5 + 语义结果混合排序。
- 该实现不依赖外部 embedding 服务，后续可以在不改变索引接口的前提下替换向量 Provider。

## 7. 插件

- 支持插件 manifest 的校验、安装、启用和禁用。
- 权限白名单为 `workspace.read`、`workspace.write`、`commands.register`、`ui.panel`。
- 当前版本只保存生命周期和权限元数据，不执行任意代码，不连接插件市场。

## 8. 前端

- 新增 PDF 文档页、混合搜索、文本预览、OCR / 导出 / 回收站操作。
- 新增插件管理页和安全边界提示。
- 设置页新增全部同步 Provider、AI、OCR、语义搜索配置。
- AI 工作台以可选面板形式提供文档摘要、标题、标签、会议纪要、任务拆分和问答。

## 9. 验证

- `npm run build` 通过。
- `npm test` 通过：2 个前端测试。
- `cargo fmt --all -- --check` 通过。
- `cargo clippy --all-targets --all-features -- -D warnings` 通过。
- `cargo test` 通过：18 个 Rust 测试。

## 10. 验收边界

真实 S3、SFTP、SMB/NAS、OCR 命令和 AI Endpoint 需要在目标环境配置凭据或本地服务后联调；本轮未伪造外部服务成功结果。SFTP 为私钥 / SSH Agent 路径，避免把密码放入系统进程参数。
