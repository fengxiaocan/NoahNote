use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("文件操作失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("数据库操作失败：{0}")]
    Database(#[from] rusqlite::Error),
    #[error("数据格式错误：{0}")]
    Json(#[from] serde_json::Error),
    #[error("备份操作失败：{0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("网络请求失败：{0}")]
    Http(String),
    #[error("命令执行失败：{0}")]
    Command(String),
    #[error("配置错误：{0}")]
    Config(String),
    #[error("参数无效：{0}")]
    Validation(String),
    #[error("找不到内容：{0}")]
    NotFound(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
