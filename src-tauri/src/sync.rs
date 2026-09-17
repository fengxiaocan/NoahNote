use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Output},
};

use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::{blocking::Client, Method, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    error::{AppError, AppResult},
    models::{SyncHistoryEntry, SyncProvider, SyncReport, SyncSettings},
    workspace::WorkspaceRepository,
};

const SYNC_HISTORY_LIMIT: usize = 100;

#[derive(Debug, Clone, Copy)]
pub enum SyncAction {
    Status,
    Pull,
    Push,
    ForcePull,
    ForcePush,
}

impl SyncAction {
    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "status" => Ok(Self::Status),
            "pull" => Ok(Self::Pull),
            "push" => Ok(Self::Push),
            "force_pull" => Ok(Self::ForcePull),
            "force_push" => Ok(Self::ForcePush),
            _ => Err(AppError::Validation(
                "同步操作只能是 status、pull、push、force_pull 或 force_push".into(),
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Status => "status",
            Self::Pull => "pull",
            Self::Push => "push",
            Self::ForcePull => "force_pull",
            Self::ForcePush => "force_push",
        }
    }
}

pub fn run(repository: &mut WorkspaceRepository, action: SyncAction) -> AppResult<SyncReport> {
    let settings = repository.settings().sync;
    let provider = settings.provider.as_str().to_string();
    let result = match settings.provider {
        SyncProvider::None => Err(AppError::Config("请先在设置中选择同步方式".into())),
        SyncProvider::Git => git_sync(repository.root(), &settings, action),
        SyncProvider::Webdav => webdav_sync(repository, &settings, action),
        SyncProvider::LocalFolder => folder_sync(repository, &settings, action, false),
        SyncProvider::Smb => folder_sync(repository, &settings, action, true),
        SyncProvider::S3 => s3_sync(repository, &settings, action),
        SyncProvider::Sftp => sftp_sync(repository, &settings, action),
    };
    if let Ok(report) = &result {
        let has_conflicts = !report.conflicts.is_empty();
        if !has_conflicts && !matches!(action, SyncAction::Status) {
            if let Ok(manifest) = local_manifest(repository.root()) {
                let _ = save_sync_snapshot(repository.root(), &provider, &manifest);
            }
        }
        let status = if has_conflicts { "conflict" } else { "success" };
        let _ = append_sync_history(repository.root(), report, status);
    } else if let Err(error) = &result {
        let _ = append_sync_history(
            repository.root(),
            &SyncReport {
                provider: provider.clone(),
                action: action.as_str().into(),
                message: error.to_string(),
                changed_files: 0,
                conflicts: Vec::new(),
            },
            "failed",
        );
    }
    result
}

pub fn history(root: &Path) -> AppResult<Vec<SyncHistoryEntry>> {
    let path = root.join("config").join("sync-history.json");
    if !path.is_file() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn append_sync_history(root: &Path, report: &SyncReport, status: &str) -> AppResult<()> {
    let mut entries = history(root)?;
    entries.insert(
        0,
        SyncHistoryEntry {
            id: Uuid::new_v4().to_string(),
            provider: report.provider.clone(),
            action: report.action.clone(),
            status: status.into(),
            message: report.message.clone(),
            changed_files: report.changed_files,
            conflicts: report.conflicts.clone(),
            created_at: Utc::now().to_rfc3339(),
        },
    );
    entries.truncate(SYNC_HISTORY_LIMIT);
    let path = root.join("config").join("sync-history.json");
    let temporary = path.with_file_name("sync-history.json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(&entries)?)?;
    if path.exists() {
        fs::remove_file(&path)?;
    }
    fs::rename(temporary, path)?;
    Ok(())
}

fn git_sync(root: &Path, settings: &SyncSettings, action: SyncAction) -> AppResult<SyncReport> {
    if matches!(action, SyncAction::ForcePull | SyncAction::ForcePush) {
        return Err(AppError::Config(
            "Git 冲突请使用 Git 工具完成合并后再同步，不能通过覆盖操作跳过".into(),
        ));
    }
    let remote = settings
        .git_remote_url
        .as_deref()
        .filter(|value| !value.trim().is_empty());
    let branch = validate_branch(&settings.git_branch)?;
    if !root.join(".git").exists() && matches!(action, SyncAction::Status) {
        return Ok(SyncReport {
            provider: "git".into(),
            action: action.as_str().into(),
            message: "本地 Git 仓库尚未初始化".into(),
            changed_files: 0,
            conflicts: Vec::new(),
        });
    }
    if matches!(action, SyncAction::Pull | SyncAction::Push) && remote.is_none() {
        return Err(AppError::Config("Git 同步需要填写远程仓库地址".into()));
    }
    ensure_git_repository(root, remote, branch)?;
    match action {
        SyncAction::Status => {
            let output = git(root, ["status", "--short", "--branch"])?;
            let changed = output
                .stdout
                .lines()
                .filter(|line| !line.starts_with("##"))
                .count() as i64;
            let remote_label = remote
                .map(|value| format!(" · {value}"))
                .unwrap_or_default();
            Ok(SyncReport {
                provider: "git".into(),
                action: "status".into(),
                message: format!("Git 状态正常，{changed} 个文件待同步{remote_label}"),
                changed_files: changed,
                conflicts: Vec::new(),
            })
        }
        SyncAction::Pull => {
            let output = git_output(root, ["pull", "--rebase", "origin", branch])?;
            let status = git(root, ["status", "--porcelain"])?;
            let conflicts = conflict_paths(&status.stdout);
            if !conflicts.is_empty() {
                let backup_path = backup_conflicts(root, &conflicts)?;
                return Ok(SyncReport {
                    provider: "git".into(),
                    action: "pull".into(),
                    message: format!(
                        "检测到 {} 个冲突，冲突副本已保存到 {}",
                        conflicts.len(),
                        backup_path.display()
                    ),
                    changed_files: conflicts.len() as i64,
                    conflicts,
                });
            }
            if !output.success() {
                return Err(AppError::Command(format!(
                    "Git pull：{}",
                    output.stderr.trim()
                )));
            }
            Ok(SyncReport {
                provider: "git".into(),
                action: "pull".into(),
                message: command_message("已拉取远端更新", &output),
                changed_files: changed_lines(&output.stdout),
                conflicts: Vec::new(),
            })
        }
        SyncAction::Push => {
            git(root, ["add", "personal", "work", "plugins"])?;
            let staged = git_output(root, ["diff", "--cached", "--name-only"])?;
            if staged.stdout.trim().is_empty() {
                return Ok(SyncReport {
                    provider: "git".into(),
                    action: "push".into(),
                    message: "没有需要提交的本地变更".into(),
                    changed_files: 0,
                    conflicts: Vec::new(),
                });
            }
            let commit_message = format!("Noah sync {}", Utc::now().format("%Y-%m-%d %H:%M"));
            let commit = git(root, ["commit", "-m", &commit_message])?;
            git(root, ["push", "origin", branch])?;
            Ok(SyncReport {
                provider: "git".into(),
                action: "push".into(),
                message: format!(
                    "已提交并推送 {} 个文件。{}",
                    staged.stdout.lines().count(),
                    command_message("", &commit).trim()
                ),
                changed_files: staged.stdout.lines().count() as i64,
                conflicts: Vec::new(),
            })
        }
        SyncAction::ForcePull | SyncAction::ForcePush => Err(AppError::Config(
            "Git 冲突请使用 Git 工具完成合并后再同步，不能通过覆盖操作跳过".into(),
        )),
    }
}

fn ensure_git_repository(root: &Path, remote: Option<&str>, branch: &str) -> AppResult<()> {
    if !root.join(".git").exists() {
        git(root, ["init", "-b", branch])?;
    }
    if let Some(remote) = remote {
        let current = git_output(root, ["remote", "get-url", "origin"])?;
        if current.success() {
            git(root, ["remote", "set-url", "origin", remote])?;
        } else {
            git(root, ["remote", "add", "origin", remote])?;
        }
    }
    Ok(())
}

fn validate_branch(branch: &str) -> AppResult<&str> {
    let branch = branch.trim();
    if branch.is_empty() || branch.starts_with('-') || branch.chars().any(char::is_whitespace) {
        return Err(AppError::Validation("Git 分支名无效".into()));
    }
    Ok(branch)
}

fn git<const N: usize>(root: &Path, args: [&str; N]) -> AppResult<CommandOutput> {
    let output = git_output(root, args)?;
    if !output.success() {
        return Err(AppError::Command(format!(
            "Git {}：{}",
            args.join(" "),
            output.stderr.trim()
        )));
    }
    Ok(output)
}

type CommandOutput = CommandResult;

#[derive(Debug)]
struct CommandResult {
    stdout: String,
    stderr: String,
    status: std::process::ExitStatus,
}

impl CommandResult {
    fn success(&self) -> bool {
        self.status.success()
    }
}

fn git_output<const N: usize>(root: &Path, args: [&str; N]) -> AppResult<CommandResult> {
    let output: Output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| AppError::Command(format!("无法执行 Git：{error}")))?;
    Ok(CommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        status: output.status,
    })
}

fn changed_lines(value: &str) -> i64 {
    value.lines().filter(|line| !line.trim().is_empty()).count() as i64
}
fn command_message(prefix: &str, output: &CommandOutput) -> String {
    let detail = output.stdout.trim();
    if detail.is_empty() {
        prefix.to_string()
    } else if prefix.is_empty() {
        detail.to_string()
    } else {
        format!("{prefix} {detail}")
    }
}
fn conflict_paths(status: &str) -> Vec<String> {
    status
        .lines()
        .filter_map(|line| {
            if line.len() >= 3 && matches!(&line[..2], "UU" | "AA" | "DD" | "AU" | "UA") {
                Some(line[3..].to_string())
            } else {
                None
            }
        })
        .collect()
}
fn backup_conflicts(root: &Path, conflicts: &[String]) -> AppResult<PathBuf> {
    let directory = root.join("backups").join("conflicts").join(format!(
        "{}-{}",
        Utc::now().format("%Y%m%d-%H%M%S"),
        &Uuid::new_v4().to_string()[..8]
    ));
    for relative in conflicts {
        let source = root.join(relative);
        if !source.is_file() {
            continue;
        }
        let target = directory.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(source, target)?;
    }
    Ok(directory)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RemoteManifest {
    version: u32,
    files: Vec<RemoteFile>,
    generated_at: String,
}

#[derive(Debug, Clone, Serialize)]
struct RemoteFile {
    path: String,
    size: u64,
    sha256: String,
}

impl<'de> Deserialize<'de> for RemoteFile {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        match value {
            serde_json::Value::String(path) => Ok(Self {
                path,
                size: 0,
                sha256: String::new(),
            }),
            serde_json::Value::Object(_) => {
                #[derive(Deserialize)]
                struct DetailedRemoteFile {
                    path: String,
                    #[serde(default)]
                    size: u64,
                    #[serde(default)]
                    sha256: String,
                }
                let detailed: DetailedRemoteFile = serde_json::from_value(value)
                    .map_err(|error| serde::de::Error::custom(error.to_string()))?;
                Ok(Self {
                    path: detailed.path,
                    size: detailed.size,
                    sha256: detailed.sha256,
                })
            }
            _ => Err(serde::de::Error::custom("同步清单文件条目格式无效")),
        }
    }
}

impl RemoteFile {
    fn from_path(root: &Path, path: &Path) -> AppResult<Self> {
        let full_path = root.join(path);
        let bytes = fs::read(&full_path)?;
        Ok(Self {
            path: path.to_string_lossy().replace('\\', "/"),
            size: bytes.len() as u64,
            sha256: sha256_hex(&bytes),
        })
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct SyncState {
    #[serde(default)]
    providers: BTreeMap<String, RemoteManifest>,
}

fn sync_state_path(root: &Path) -> PathBuf {
    root.join("config").join("sync-state.json")
}

fn read_sync_state(root: &Path) -> AppResult<SyncState> {
    let path = sync_state_path(root);
    if !path.is_file() {
        return Ok(SyncState::default());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn save_sync_snapshot(root: &Path, provider: &str, manifest: &RemoteManifest) -> AppResult<()> {
    let mut state = read_sync_state(root)?;
    state.providers.insert(provider.into(), manifest.clone());
    let path = sync_state_path(root);
    let temporary = path.with_file_name("sync-state.json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(&state)?)?;
    if path.exists() {
        fs::remove_file(&path)?;
    }
    fs::rename(temporary, path)?;
    Ok(())
}

fn local_manifest(root: &Path) -> AppResult<RemoteManifest> {
    let files = local_sync_files(root)?;
    let files = files
        .iter()
        .map(|path| RemoteFile::from_path(root, path))
        .collect::<AppResult<Vec<_>>>()?;
    Ok(RemoteManifest {
        version: 2,
        files,
        generated_at: Utc::now().to_rfc3339(),
    })
}

fn manifest_conflicts(
    root: &Path,
    provider: &str,
    remote: &RemoteManifest,
) -> AppResult<Vec<String>> {
    let local = local_manifest(root)?;
    let state = read_sync_state(root)?;
    let base = state.providers.get(provider);
    let local_map = local
        .files
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect::<HashMap<_, _>>();
    let remote_map = remote
        .files
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect::<HashMap<_, _>>();
    let base_map = base.map(|manifest| {
        manifest
            .files
            .iter()
            .map(|file| (file.path.as_str(), file))
            .collect::<HashMap<_, _>>()
    });
    let mut paths = BTreeSet::new();
    paths.extend(local_map.keys().copied());
    paths.extend(remote_map.keys().copied());
    if let Some(base_map) = &base_map {
        paths.extend(base_map.keys().copied());
    }

    let mut conflicts = Vec::new();
    for path in paths {
        let local_file = local_map.get(path).copied();
        let remote_file = remote_map.get(path).copied();
        let base_file = base_map.as_ref().and_then(|files| files.get(path).copied());
        let local_changed = changed_since_base(local_file, base_file);
        let remote_changed = changed_since_base(remote_file, base_file);
        if local_changed && remote_changed && file_difference(local_file, remote_file) == Some(true)
        {
            conflicts.push(path.to_string());
        }
    }
    Ok(conflicts)
}

fn changed_since_base(current: Option<&RemoteFile>, base: Option<&RemoteFile>) -> bool {
    match base {
        Some(base) => file_difference(current, Some(base)) == Some(true),
        None => current.is_some(),
    }
}

fn file_difference(left: Option<&RemoteFile>, right: Option<&RemoteFile>) -> Option<bool> {
    match (left, right) {
        (None, None) => Some(false),
        (None, Some(_)) | (Some(_), None) => Some(true),
        (Some(left), Some(right)) => {
            if left.sha256.is_empty() || right.sha256.is_empty() {
                None
            } else {
                Some(left.sha256 != right.sha256 || left.size != right.size)
            }
        }
    }
}

fn remove_remote_deletions(root: &Path, remote: &RemoteManifest, provider: &str) -> AppResult<()> {
    let state = read_sync_state(root)?;
    let Some(base) = state.providers.get(provider) else {
        return Ok(());
    };
    let remote_paths = remote
        .files
        .iter()
        .map(|file| file.path.as_str())
        .collect::<std::collections::HashSet<_>>();
    let local = local_manifest(root)?;
    let local_map = local
        .files
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect::<HashMap<_, _>>();
    for base_file in &base.files {
        if remote_paths.contains(base_file.path.as_str()) {
            continue;
        }
        let Some(local_file) = local_map.get(base_file.path.as_str()).copied() else {
            continue;
        };
        if file_difference(Some(local_file), Some(base_file)) != Some(false) {
            continue;
        }
        let path = safe_sync_path(&base_file.path)?;
        let full_path = root.join(path);
        if full_path.is_file() {
            fs::remove_file(full_path)?;
        }
    }
    Ok(())
}

fn conflict_report(provider: &str, action: SyncAction, conflicts: Vec<String>) -> SyncReport {
    SyncReport {
        provider: provider.into(),
        action: action.as_str().into(),
        message: format!(
            "检测到 {} 个同步冲突，已跳过冲突文件；请在设置中选择保留本地或远端版本",
            conflicts.len()
        ),
        changed_files: conflicts.len() as i64,
        conflicts,
    }
}

fn webdav_sync(
    repository: &mut WorkspaceRepository,
    settings: &SyncSettings,
    action: SyncAction,
) -> AppResult<SyncReport> {
    let base = settings
        .webdav_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Config("WebDAV 同步需要填写服务器地址".into()))?;
    let base = normalize_base_url(base)?;
    let client = Client::builder()
        .build()
        .map_err(|error| AppError::Http(error.to_string()))?;
    let request = |method: Method, url: Url| {
        let mut builder = client.request(method, url);
        if let (Some(username), Some(password)) =
            (&settings.webdav_username, &settings.webdav_password)
        {
            builder = builder.basic_auth(username, Some(password));
        }
        builder
    };
    match action {
        SyncAction::Status => {
            let response = request(
                Method::HEAD,
                base.join(".noah-manifest.json")
                    .map_err(|error| AppError::Http(error.to_string()))?,
            )
            .send()
            .map_err(|error| AppError::Http(error.to_string()))?;
            if !response.status().is_success() && response.status().as_u16() != 404 {
                return Err(AppError::Http(format!(
                    "WebDAV 状态码 {}",
                    response.status()
                )));
            }
            Ok(SyncReport {
                provider: "webdav".into(),
                action: "status".into(),
                message: if response.status().is_success() {
                    "WebDAV 已连接，远端存在 Workspace 清单".into()
                } else {
                    "WebDAV 已连接，远端尚未创建 Workspace 清单".into()
                },
                changed_files: 0,
                conflicts: Vec::new(),
            })
        }
        SyncAction::Push | SyncAction::ForcePush => {
            let should_check_conflicts = matches!(action, SyncAction::Push);
            if let Some(remote) = read_webdav_manifest(&request, &base)? {
                if should_check_conflicts {
                    let conflicts = manifest_conflicts(repository.root(), "webdav", &remote)?;
                    if !conflicts.is_empty() {
                        return Ok(conflict_report("webdav", action, conflicts));
                    }
                }
            }
            let files = local_sync_files(repository.root())?;
            let mut uploaded = 0_i64;
            for relative in &files {
                let source = repository.root().join(relative);
                let url = base
                    .join(&relative.to_string_lossy().replace('\\', "/"))
                    .map_err(|error| AppError::Http(error.to_string()))?;
                ensure_remote_parent(&request, &base, &url)?;
                let response = request(Method::PUT, url)
                    .body(fs::read(source)?)
                    .send()
                    .map_err(|error| AppError::Http(error.to_string()))?;
                if !response.status().is_success() {
                    return Err(AppError::Http(format!(
                        "上传 {} 失败：{}",
                        relative.display(),
                        response.status()
                    )));
                }
                uploaded += 1;
            }
            let manifest = local_manifest(repository.root())?;
            let manifest_url = base
                .join(".noah-manifest.json")
                .map_err(|error| AppError::Http(error.to_string()))?;
            let response = request(Method::PUT, manifest_url)
                .json(&manifest)
                .send()
                .map_err(|error| AppError::Http(error.to_string()))?;
            if !response.status().is_success() {
                return Err(AppError::Http(format!(
                    "上传远端清单失败：{}",
                    response.status()
                )));
            }
            Ok(SyncReport {
                provider: "webdav".into(),
                action: action.as_str().into(),
                message: format!("已上传 {uploaded} 个文件到 WebDAV"),
                changed_files: uploaded,
                conflicts: Vec::new(),
            })
        }
        SyncAction::Pull | SyncAction::ForcePull => {
            let manifest_url = base
                .join(".noah-manifest.json")
                .map_err(|error| AppError::Http(error.to_string()))?;
            let response = request(Method::GET, manifest_url)
                .send()
                .map_err(|error| AppError::Http(error.to_string()))?;
            if response.status().as_u16() == 404 {
                return Err(AppError::NotFound(
                    "远端没有 Noah Workspace 清单，请先推送一次".into(),
                ));
            }
            if !response.status().is_success() {
                return Err(AppError::Http(format!(
                    "下载远端清单失败：{}",
                    response.status()
                )));
            }
            let manifest: RemoteManifest = response
                .json()
                .map_err(|error| AppError::Http(error.to_string()))?;
            if matches!(action, SyncAction::Pull) {
                let conflicts = manifest_conflicts(repository.root(), "webdav", &manifest)?;
                if !conflicts.is_empty() {
                    return Ok(conflict_report("webdav", action, conflicts));
                }
            }
            let mut downloaded = 0_i64;
            for remote_file in &manifest.files {
                let relative = remote_file.path.as_str();
                let relative_path = safe_sync_path(relative)?;
                let url = base
                    .join(&relative.replace('\\', "/"))
                    .map_err(|error| AppError::Http(error.to_string()))?;
                let response = request(Method::GET, url)
                    .send()
                    .map_err(|error| AppError::Http(error.to_string()))?;
                if !response.status().is_success() {
                    return Err(AppError::Http(format!(
                        "下载 {} 失败：{}",
                        relative,
                        response.status()
                    )));
                }
                let bytes = response
                    .bytes()
                    .map_err(|error| AppError::Http(error.to_string()))?;
                let target = repository.root().join(relative_path);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(target, bytes)?;
                downloaded += 1;
            }
            remove_remote_deletions(repository.root(), &manifest, "webdav")?;
            repository.reindex()?;
            Ok(SyncReport {
                provider: "webdav".into(),
                action: action.as_str().into(),
                message: format!("已从 WebDAV 拉取 {downloaded} 个文件"),
                changed_files: downloaded,
                conflicts: Vec::new(),
            })
        }
    }
}

fn normalize_base_url(value: &str) -> AppResult<Url> {
    let value = if value.ends_with('/') {
        value.to_string()
    } else {
        format!("{value}/")
    };
    Url::parse(&value).map_err(|error| AppError::Config(format!("WebDAV 地址无效：{error}")))
}

fn read_webdav_manifest<F>(request: &F, base: &Url) -> AppResult<Option<RemoteManifest>>
where
    F: Fn(Method, Url) -> reqwest::blocking::RequestBuilder,
{
    let manifest_url = base
        .join(".noah-manifest.json")
        .map_err(|error| AppError::Http(error.to_string()))?;
    let response = request(Method::GET, manifest_url)
        .send()
        .map_err(|error| AppError::Http(error.to_string()))?;
    if response.status().as_u16() == 404 {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(AppError::Http(format!(
            "读取远端清单失败：{}",
            response.status()
        )));
    }
    response
        .json()
        .map(Some)
        .map_err(|error| AppError::Http(format!("远端清单格式无效：{error}")))
}

fn local_sync_files(root: &Path) -> AppResult<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(root)
            .map_err(|error| AppError::Command(error.to_string()))?;
        let first = relative.components().next();
        if !matches!(first, Some(std::path::Component::Normal(value)) if value == "personal" || value == "work" || value == "plugins")
        {
            continue;
        }
        files.push(relative.to_path_buf());
    }
    files.sort();
    Ok(files)
}

fn safe_sync_path(value: &str) -> AppResult<PathBuf> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
        || !matches!(path.components().next(), Some(std::path::Component::Normal(value)) if value == "personal" || value == "work" || value == "plugins")
    {
        return Err(AppError::Validation(format!("远端路径不安全：{value}")));
    }
    Ok(path.to_path_buf())
}

fn ensure_remote_parent<F>(request: &F, base_url: &Url, file_url: &Url) -> AppResult<()>
where
    F: Fn(Method, Url) -> reqwest::blocking::RequestBuilder,
{
    let method = Method::from_bytes(b"MKCOL").map_err(|error| AppError::Http(error.to_string()))?;
    let base_path = base_url.path().trim_end_matches('/');
    let relative = file_url
        .path()
        .strip_prefix(base_path)
        .ok_or_else(|| AppError::Http("WebDAV 路径越界".into()))?;
    let segments: Vec<&str> = relative
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    let directory_segments = segments.len().saturating_sub(1);
    let mut directory_url = base_url.clone();
    for segment in segments.into_iter().take(directory_segments) {
        directory_url = directory_url
            .join(&format!("{segment}/"))
            .map_err(|error| AppError::Http(error.to_string()))?;
        let response = request(method.clone(), directory_url.clone())
            .send()
            .map_err(|error| AppError::Http(error.to_string()))?;
        if !response.status().is_success()
            && response.status().as_u16() != 405
            && response.status().as_u16() != 409
        {
            return Err(AppError::Http(format!(
                "创建 WebDAV 目录失败：{}",
                response.status()
            )));
        }
    }
    Ok(())
}

fn folder_sync(
    repository: &mut WorkspaceRepository,
    settings: &SyncSettings,
    action: SyncAction,
    smb: bool,
) -> AppResult<SyncReport> {
    let configured = if smb {
        settings.smb_path.as_deref()
    } else {
        settings.local_folder_path.as_deref()
    }
    .filter(|value| !value.trim().is_empty())
    .ok_or_else(|| {
        AppError::Config(if smb {
            "SMB/NAS 同步需要填写共享目录路径".into()
        } else {
            "本地目录同步需要填写目标目录".into()
        })
    })?;
    let target = external_sync_root(repository.root(), configured)?;
    let provider = if smb { "smb" } else { "local_folder" };
    let manifest_path = target.join(".noah-manifest.json");
    match action {
        SyncAction::Status => {
            let manifest = read_manifest(&manifest_path)?;
            Ok(SyncReport {
                provider: provider.into(),
                action: action.as_str().into(),
                message: if manifest.is_some() {
                    format!("{provider} 目录已连接，远端存在 Workspace 清单")
                } else {
                    format!("{provider} 目录已连接，远端尚未创建 Workspace 清单")
                },
                changed_files: 0,
                conflicts: Vec::new(),
            })
        }
        SyncAction::Push | SyncAction::ForcePush => {
            if matches!(action, SyncAction::Push) {
                if let Some(remote) = read_manifest(&manifest_path)? {
                    let conflicts = manifest_conflicts(repository.root(), provider, &remote)?;
                    if !conflicts.is_empty() {
                        return Ok(conflict_report(provider, action, conflicts));
                    }
                }
            }
            let files = local_sync_files(repository.root())?;
            for relative in &files {
                copy_sync_file(repository.root(), &target, relative)?;
            }
            write_manifest(&manifest_path, repository.root(), &files)?;
            Ok(SyncReport {
                provider: provider.into(),
                action: action.as_str().into(),
                message: format!("已复制 {} 个文件到 {provider}", files.len()),
                changed_files: files.len() as i64,
                conflicts: Vec::new(),
            })
        }
        SyncAction::Pull | SyncAction::ForcePull => {
            let manifest = read_manifest(&manifest_path)?.ok_or_else(|| {
                AppError::NotFound(format!(
                    "{provider} 目录没有 Noah Workspace 清单，请先推送一次"
                ))
            })?;
            if matches!(action, SyncAction::Pull) {
                let conflicts = manifest_conflicts(repository.root(), provider, &manifest)?;
                if !conflicts.is_empty() {
                    return Ok(conflict_report(provider, action, conflicts));
                }
            }
            let mut downloaded = 0_i64;
            for remote_file in &manifest.files {
                let relative = remote_file.path.as_str();
                let relative_path = safe_sync_path(relative)?;
                let source = target.join(&relative_path);
                if !source.is_file() {
                    return Err(AppError::NotFound(format!(
                        "{provider} 文件不存在：{relative}"
                    )));
                }
                copy_sync_file_from(&source, repository.root(), &relative_path)?;
                downloaded += 1;
            }
            remove_remote_deletions(repository.root(), &manifest, provider)?;
            repository.reindex()?;
            Ok(SyncReport {
                provider: provider.into(),
                action: action.as_str().into(),
                message: format!("已从 {provider} 拉取 {downloaded} 个文件"),
                changed_files: downloaded,
                conflicts: Vec::new(),
            })
        }
    }
}

fn external_sync_root(workspace_root: &Path, configured: &str) -> AppResult<PathBuf> {
    let target = PathBuf::from(configured.trim());
    if !target.is_absolute()
        || target
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(AppError::Validation(
            "同步目标必须是绝对路径且不能包含 ..".into(),
        ));
    }
    let canonical_root = fs::canonicalize(workspace_root)?;
    let target_for_check = if target.exists() {
        fs::canonicalize(&target)?
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| AppError::Validation("同步目标目录无效".into()))?;
        let canonical_parent = fs::canonicalize(parent).map_err(|_| {
            AppError::Validation("同步目标的父目录必须存在，避免路径解析歧义".into())
        })?;
        canonical_parent.join(
            target
                .file_name()
                .ok_or_else(|| AppError::Validation("同步目标目录无效".into()))?,
        )
    };
    if target_for_check == canonical_root || target_for_check.starts_with(&canonical_root) {
        return Err(AppError::Validation(
            "同步目标不能位于 Noah Workspace 内部".into(),
        ));
    }
    fs::create_dir_all(&target)?;
    Ok(fs::canonicalize(target)?)
}

fn read_manifest(path: &Path) -> AppResult<Option<RemoteManifest>> {
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&fs::read(path)?)?))
}

fn write_manifest(path: &Path, root: &Path, files: &[PathBuf]) -> AppResult<()> {
    let manifest = RemoteManifest {
        version: 2,
        files: files
            .iter()
            .map(|path| RemoteFile::from_path(root, path))
            .collect::<AppResult<Vec<_>>>()?,
        generated_at: Utc::now().to_rfc3339(),
    };
    fs::write(path, serde_json::to_vec_pretty(&manifest)?)?;
    Ok(())
}

fn copy_sync_file(root: &Path, target: &Path, relative: &Path) -> AppResult<()> {
    let source = root.join(relative);
    let destination = target.join(relative);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, destination)?;
    Ok(())
}

fn copy_sync_file_from(source: &Path, root: &Path, relative: &Path) -> AppResult<()> {
    let destination = root.join(relative);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, destination)?;
    Ok(())
}

fn s3_sync(
    repository: &mut WorkspaceRepository,
    settings: &SyncSettings,
    action: SyncAction,
) -> AppResult<SyncReport> {
    let endpoint = settings
        .s3_endpoint
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Config("S3 同步需要填写 Endpoint".into()))?;
    let endpoint = normalize_base_url(endpoint)?;
    let bucket = settings
        .s3_bucket
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Config("S3 同步需要填写 Bucket".into()))?;
    let access_key = settings
        .s3_access_key
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Config("S3 同步需要填写 Access Key".into()))?;
    let secret_key = settings
        .s3_secret_key
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Config("S3 同步需要填写 Secret Key".into()))?;
    let region = settings
        .s3_region
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("us-east-1");
    let prefix = settings.s3_prefix.as_deref().unwrap_or_default();
    validate_s3_prefix(prefix)?;
    let client = Client::builder()
        .build()
        .map_err(|error| AppError::Http(error.to_string()))?;
    let manifest_key = s3_key(prefix, ".noah-manifest.json");
    match action {
        SyncAction::Status => {
            let response = s3_request(
                &client,
                Method::HEAD,
                &endpoint,
                bucket,
                region,
                access_key,
                secret_key,
                &manifest_key,
                None,
            )?;
            if !response.status().is_success() && response.status().as_u16() != 404 {
                return Err(AppError::Http(format!("S3 状态码 {}", response.status())));
            }
            Ok(SyncReport {
                provider: "s3".into(),
                action: action.as_str().into(),
                message: if response.status().is_success() {
                    "S3 已连接，远端存在 Workspace 清单".into()
                } else {
                    "S3 已连接，远端尚未创建 Workspace 清单".into()
                },
                changed_files: 0,
                conflicts: Vec::new(),
            })
        }
        SyncAction::Push | SyncAction::ForcePush => {
            if matches!(action, SyncAction::Push) {
                let remote = s3_request(
                    &client,
                    Method::GET,
                    &endpoint,
                    bucket,
                    region,
                    access_key,
                    secret_key,
                    &manifest_key,
                    None,
                )?;
                if remote.status().as_u16() != 404 {
                    if !remote.status().is_success() {
                        return Err(AppError::Http(format!(
                            "读取 S3 清单失败：{}",
                            remote.status()
                        )));
                    }
                    let remote: RemoteManifest = remote
                        .json()
                        .map_err(|error| AppError::Http(format!("S3 清单格式无效：{error}")))?;
                    let conflicts = manifest_conflicts(repository.root(), "s3", &remote)?;
                    if !conflicts.is_empty() {
                        return Ok(conflict_report("s3", action, conflicts));
                    }
                }
            }
            let files = local_sync_files(repository.root())?;
            for relative in &files {
                let body = fs::read(repository.root().join(relative))?;
                let response = s3_request(
                    &client,
                    Method::PUT,
                    &endpoint,
                    bucket,
                    region,
                    access_key,
                    secret_key,
                    &s3_key(prefix, &relative.to_string_lossy().replace('\\', "/")),
                    Some(&body),
                )?;
                if !response.status().is_success() {
                    return Err(AppError::Http(format!(
                        "上传 {} 失败：{}",
                        relative.display(),
                        response.status()
                    )));
                }
            }
            let manifest = local_manifest(repository.root())?;
            let body = serde_json::to_vec(&manifest)?;
            let response = s3_request(
                &client,
                Method::PUT,
                &endpoint,
                bucket,
                region,
                access_key,
                secret_key,
                &manifest_key,
                Some(&body),
            )?;
            if !response.status().is_success() {
                return Err(AppError::Http(format!(
                    "上传 S3 清单失败：{}",
                    response.status()
                )));
            }
            Ok(SyncReport {
                provider: "s3".into(),
                action: action.as_str().into(),
                message: format!("已上传 {} 个文件到 S3", files.len()),
                changed_files: files.len() as i64,
                conflicts: Vec::new(),
            })
        }
        SyncAction::Pull | SyncAction::ForcePull => {
            let response = s3_request(
                &client,
                Method::GET,
                &endpoint,
                bucket,
                region,
                access_key,
                secret_key,
                &manifest_key,
                None,
            )?;
            if response.status().as_u16() == 404 {
                return Err(AppError::NotFound(
                    "S3 没有 Noah Workspace 清单，请先推送一次".into(),
                ));
            }
            if !response.status().is_success() {
                return Err(AppError::Http(format!(
                    "下载 S3 清单失败：{}",
                    response.status()
                )));
            }
            let manifest: RemoteManifest = response
                .json()
                .map_err(|error| AppError::Http(format!("S3 清单格式无效：{error}")))?;
            if matches!(action, SyncAction::Pull) {
                let conflicts = manifest_conflicts(repository.root(), "s3", &manifest)?;
                if !conflicts.is_empty() {
                    return Ok(conflict_report("s3", action, conflicts));
                }
            }
            let mut downloaded = 0_i64;
            for remote_file in &manifest.files {
                let relative = remote_file.path.as_str();
                let relative_path = safe_sync_path(relative)?;
                let response = s3_request(
                    &client,
                    Method::GET,
                    &endpoint,
                    bucket,
                    region,
                    access_key,
                    secret_key,
                    &s3_key(prefix, relative),
                    None,
                )?;
                if !response.status().is_success() {
                    return Err(AppError::Http(format!(
                        "下载 S3 文件 {} 失败：{}",
                        relative,
                        response.status()
                    )));
                }
                let bytes = response
                    .bytes()
                    .map_err(|error| AppError::Http(error.to_string()))?;
                let target = repository.root().join(relative_path);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(target, bytes)?;
                downloaded += 1;
            }
            remove_remote_deletions(repository.root(), &manifest, "s3")?;
            repository.reindex()?;
            Ok(SyncReport {
                provider: "s3".into(),
                action: action.as_str().into(),
                message: format!("已从 S3 拉取 {downloaded} 个文件"),
                changed_files: downloaded,
                conflicts: Vec::new(),
            })
        }
    }
}

fn validate_s3_prefix(prefix: &str) -> AppResult<()> {
    if prefix
        .split('/')
        .any(|part| part == ".." || part.contains('\\') || part.contains('\0'))
    {
        return Err(AppError::Validation("S3 Prefix 不安全".into()));
    }
    Ok(())
}

fn s3_key(prefix: &str, key: &str) -> String {
    let prefix = prefix.trim_matches('/');
    if prefix.is_empty() {
        key.trim_start_matches('/').into()
    } else {
        format!("{prefix}/{}", key.trim_start_matches('/'))
    }
}

#[allow(clippy::too_many_arguments)]
fn s3_request(
    client: &Client,
    method: Method,
    endpoint: &Url,
    bucket: &str,
    region: &str,
    access_key: &str,
    secret_key: &str,
    key: &str,
    body: Option<&[u8]>,
) -> AppResult<reqwest::blocking::Response> {
    let url = s3_url(endpoint, bucket, key)?;
    let payload = body.unwrap_or_default();
    let payload_hash = sha256_hex(payload);
    let timestamp = Utc::now();
    let amz_date = timestamp.format("%Y%m%dT%H%M%SZ").to_string();
    let date = timestamp.format("%Y%m%d").to_string();
    let host = url
        .host_str()
        .ok_or_else(|| AppError::Config("S3 Endpoint 缺少主机名".into()))?;
    let host = if let Some(port) = url.port() {
        format!("{host}:{port}")
    } else {
        host.to_string()
    };
    let canonical_uri = if url.path().is_empty() {
        "/"
    } else {
        url.path()
    };
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_headers =
        format!("host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n");
    let canonical_request = format!(
        "{}\n{}\n\n{}\n{}\n{}",
        method.as_str(),
        canonical_uri,
        canonical_headers,
        signed_headers,
        payload_hash
    );
    let scope = format!("{date}/{region}/s3/aws4_request");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );
    let date_key = hmac_sha256(format!("AWS4{secret_key}").as_bytes(), date.as_bytes())?;
    let region_key = hmac_sha256(&date_key, region.as_bytes())?;
    let service_key = hmac_sha256(&region_key, b"s3")?;
    let signing_key = hmac_sha256(&service_key, b"aws4_request")?;
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes())?);
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"
    );
    let mut request = client
        .request(method, url)
        .header("host", host)
        .header("x-amz-content-sha256", payload_hash)
        .header("x-amz-date", amz_date)
        .header("authorization", authorization);
    if body.is_some() {
        request = request.body(payload.to_vec());
    }
    request
        .send()
        .map_err(|error| AppError::Http(error.to_string()))
}

fn s3_url(endpoint: &Url, bucket: &str, key: &str) -> AppResult<Url> {
    let mut url = endpoint.clone();
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| AppError::Config("S3 Endpoint 不能是 base URL".into()))?;
        segments.push(bucket);
        for segment in key.split('/').filter(|segment| !segment.is_empty()) {
            segments.push(segment);
        }
    }
    Ok(url)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(bytes);
    hex::encode(digest.finalize())
}

fn hmac_sha256(key: &[u8], value: &[u8]) -> AppResult<Vec<u8>> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key)
        .map_err(|_| AppError::Config("S3 签名密钥无效".into()))?;
    mac.update(value);
    Ok(mac.finalize().into_bytes().to_vec())
}

fn sftp_sync(
    repository: &mut WorkspaceRepository,
    settings: &SyncSettings,
    action: SyncAction,
) -> AppResult<SyncReport> {
    let host = settings
        .sftp_host
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Config("SFTP 同步需要填写主机".into()))?;
    let username = settings
        .sftp_username
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Config("SFTP 同步需要填写用户名".into()))?;
    if host.chars().any(char::is_whitespace) || username.chars().any(char::is_whitespace) {
        return Err(AppError::Validation(
            "SFTP 主机和用户名不能包含空白字符".into(),
        ));
    }
    let port =
        u16::try_from(settings.sftp_port).map_err(|_| AppError::Config("SFTP 端口无效".into()))?;
    let remote_root = settings
        .sftp_remote_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("/noah-workspace");
    if remote_root.contains("..") || remote_root.contains('\0') {
        return Err(AppError::Validation("SFTP 远端目录不安全".into()));
    }
    let key = settings
        .sftp_private_key
        .as_deref()
        .filter(|value| !value.trim().is_empty());
    if let Some(key) = key {
        if !Path::new(key).is_file() {
            return Err(AppError::Validation("SFTP 私钥文件不存在".into()));
        }
    } else if settings
        .sftp_password
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
    {
        return Err(AppError::Config(
            "为避免密码出现在进程参数中，SFTP 请配置私钥或 SSH Agent；密码字段暂不通过系统 OpenSSH 传递".into(),
        ));
    }
    let manifest_path = remote_join(remote_root, ".noah-manifest.json");
    match action {
        SyncAction::Status => {
            let output = run_sftp_batch(
                host,
                username,
                port,
                key,
                &format!("pwd\n-ls {}\n", sftp_quote(&manifest_path)),
            )?;
            let connected = output.success();
            Ok(SyncReport {
                provider: "sftp".into(),
                action: action.as_str().into(),
                message: if connected && output.stdout.contains(".noah-manifest.json") {
                    "SFTP 已连接，远端存在 Workspace 清单".into()
                } else {
                    "SFTP 已连接，远端尚未创建 Workspace 清单".into()
                },
                changed_files: 0,
                conflicts: Vec::new(),
            })
        }
        SyncAction::Push | SyncAction::ForcePush => {
            if matches!(action, SyncAction::Push) {
                if let Some(remote) = read_sftp_manifest(
                    host,
                    username,
                    port,
                    key,
                    &manifest_path,
                    repository.root(),
                )? {
                    let conflicts = manifest_conflicts(repository.root(), "sftp", &remote)?;
                    if !conflicts.is_empty() {
                        return Ok(conflict_report("sftp", action, conflicts));
                    }
                }
            }
            let files = local_sync_files(repository.root())?;
            let manifest = local_manifest(repository.root())?;
            let temporary_manifest = repository
                .root()
                .join("config")
                .join(format!(".noah-sync-{}.json", Uuid::new_v4()));
            fs::write(&temporary_manifest, serde_json::to_vec(&manifest)?)?;
            let mut batch = format!("-mkdir {}\n", sftp_quote(remote_root));
            for relative in &files {
                let key = relative.to_string_lossy().replace('\\', "/");
                let remote_path = remote_join(remote_root, &key);
                for directory in remote_parent_directories(remote_root, &key) {
                    batch.push_str(&format!("-mkdir {}\n", sftp_quote(&directory)));
                }
                batch.push_str(&format!(
                    "put {} {}\n",
                    sftp_quote(&repository.root().join(relative).to_string_lossy()),
                    sftp_quote(&remote_path)
                ));
            }
            batch.push_str(&format!(
                "put {} {}\n",
                sftp_quote(&temporary_manifest.to_string_lossy()),
                sftp_quote(&manifest_path)
            ));
            let result = run_sftp_batch(host, username, port, key, &batch);
            let _ = fs::remove_file(&temporary_manifest);
            result?;
            Ok(SyncReport {
                provider: "sftp".into(),
                action: action.as_str().into(),
                message: format!("已上传 {} 个文件到 SFTP", files.len()),
                changed_files: files.len() as i64,
                conflicts: Vec::new(),
            })
        }
        SyncAction::Pull | SyncAction::ForcePull => {
            let temporary_manifest = repository
                .root()
                .join("config")
                .join(format!(".noah-sync-{}.json", Uuid::new_v4()));
            let result = run_sftp_batch(
                host,
                username,
                port,
                key,
                &format!(
                    "get {} {}\n",
                    sftp_quote(&manifest_path),
                    sftp_quote(&temporary_manifest.to_string_lossy())
                ),
            );
            if let Err(error) = result {
                let _ = fs::remove_file(&temporary_manifest);
                return Err(AppError::NotFound(format!(
                    "SFTP 没有 Noah Workspace 清单，请先推送一次：{error}"
                )));
            }
            let manifest_bytes = fs::read(&temporary_manifest)?;
            let _ = fs::remove_file(&temporary_manifest);
            let manifest: RemoteManifest = serde_json::from_slice(&manifest_bytes)?;
            if matches!(action, SyncAction::Pull) {
                let conflicts = manifest_conflicts(repository.root(), "sftp", &manifest)?;
                if !conflicts.is_empty() {
                    return Ok(conflict_report("sftp", action, conflicts));
                }
            }
            let mut downloaded = 0_i64;
            let mut batch = String::new();
            for remote_file in &manifest.files {
                let relative = remote_file.path.as_str();
                let relative_path = safe_sync_path(relative)?;
                let remote_path = remote_join(remote_root, relative);
                let target = repository.root().join(relative_path);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                batch.push_str(&format!(
                    "get {} {}\n",
                    sftp_quote(&remote_path),
                    sftp_quote(&target.to_string_lossy())
                ));
                downloaded += 1;
            }
            run_sftp_batch(host, username, port, key, &batch)?;
            remove_remote_deletions(repository.root(), &manifest, "sftp")?;
            repository.reindex()?;
            Ok(SyncReport {
                provider: "sftp".into(),
                action: action.as_str().into(),
                message: format!("已从 SFTP 拉取 {downloaded} 个文件"),
                changed_files: downloaded,
                conflicts: Vec::new(),
            })
        }
    }
}

fn remote_join(root: &str, key: &str) -> String {
    format!(
        "{}/{}",
        root.trim_end_matches('/'),
        key.trim_start_matches('/')
    )
}

fn remote_parent_directories(root: &str, key: &str) -> Vec<String> {
    let segments: Vec<&str> = key
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    (1..segments.len())
        .map(|index| remote_join(root, &segments[..index].join("/")))
        .collect()
}

fn sftp_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn read_sftp_manifest(
    host: &str,
    username: &str,
    port: u16,
    private_key: Option<&str>,
    remote_path: &str,
    root: &Path,
) -> AppResult<Option<RemoteManifest>> {
    let temporary = root
        .join("config")
        .join(format!(".noah-sync-{}.json", Uuid::new_v4()));
    let result = run_sftp_batch(
        host,
        username,
        port,
        private_key,
        &format!(
            "get {} {}\n",
            sftp_quote(remote_path),
            sftp_quote(&temporary.to_string_lossy())
        ),
    );
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
        return Ok(None);
    }
    let bytes = fs::read(&temporary)?;
    let _ = fs::remove_file(&temporary);
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| AppError::Command(format!("SFTP 清单格式无效：{error}")))
}

fn run_sftp_batch(
    host: &str,
    username: &str,
    port: u16,
    private_key: Option<&str>,
    batch: &str,
) -> AppResult<CommandResult> {
    let port = port.to_string();
    let mut command = Command::new("sftp");
    command.args(["-b", "-", "-P", &port, "-oBatchMode=yes"]);
    if let Some(private_key) = private_key {
        command.args(["-i", private_key]);
    }
    command.arg(format!("{username}@{host}"));
    let mut child = command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|error| AppError::Command(format!("无法启动系统 SFTP：{error}")))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(batch.as_bytes())
            .map_err(|error| AppError::Command(format!("写入 SFTP 批处理失败：{error}")))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| AppError::Command(format!("读取 SFTP 输出失败：{error}")))?;
    let result = CommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        status: output.status,
    };
    if !result.success() {
        return Err(AppError::Command(format!(
            "系统 SFTP 失败：{}",
            result.stderr.trim()
        )));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn sync_paths_stay_inside_content_spaces() {
        assert!(safe_sync_path("personal/notes/a.md").is_ok());
        assert!(safe_sync_path("../database/workspace.db").is_err());
        assert!(safe_sync_path("config/settings.json").is_err());
    }

    #[test]
    fn folder_target_cannot_be_workspace_or_relative() {
        let directory = tempdir().unwrap();
        let workspace = directory.path().join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        assert!(external_sync_root(&workspace, workspace.to_str().unwrap()).is_err());
        assert!(external_sync_root(&workspace, "remote").is_err());
        let remote = directory.path().join("remote");
        assert!(external_sync_root(&workspace, remote.to_str().unwrap()).is_ok());
    }

    #[test]
    fn remote_manifest_accepts_legacy_file_paths() {
        let manifest: RemoteManifest = serde_json::from_value(serde_json::json!({
            "version": 1,
            "files": ["personal/notes/old.md"],
            "generated_at": "2026-09-16T00:00:00Z"
        }))
        .unwrap();
        assert_eq!(manifest.files[0].path, "personal/notes/old.md");
        assert_eq!(manifest.files[0].size, 0);
        assert!(manifest.files[0].sha256.is_empty());
    }

    #[test]
    fn manifest_conflicts_when_local_and_remote_change_from_base() {
        let directory = tempdir().unwrap();
        let root = directory.path().join("workspace");
        let local_file = root.join("personal/notes/conflict.md");
        fs::create_dir_all(local_file.parent().unwrap()).unwrap();
        fs::create_dir_all(root.join("config")).unwrap();
        fs::write(&local_file, b"base").unwrap();
        let base = local_manifest(&root).unwrap();
        save_sync_snapshot(&root, "local_folder", &base).unwrap();

        fs::write(&local_file, b"local edit").unwrap();
        let remote_bytes = b"remote edit";
        let remote = RemoteManifest {
            version: 2,
            files: vec![RemoteFile {
                path: "personal/notes/conflict.md".into(),
                size: remote_bytes.len() as u64,
                sha256: sha256_hex(remote_bytes),
            }],
            generated_at: Utc::now().to_rfc3339(),
        };
        let conflicts = manifest_conflicts(&root, "local_folder", &remote).unwrap();
        assert_eq!(conflicts, vec!["personal/notes/conflict.md"]);
    }
}
