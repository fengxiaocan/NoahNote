use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use sha2::{Digest, Sha256};

use crate::{
    error::{AppError, AppResult},
    models::OcrSettings,
};

pub fn read_pdf_text(path: &Path) -> String {
    pdf_extract::extract_text(path).unwrap_or_default()
}

pub fn sha256(bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(bytes);
    hex::encode(digest.finalize())
}

pub fn page_count(bytes: &[u8]) -> i64 {
    let marker = b"/Type /Page";
    bytes
        .windows(marker.len())
        .enumerate()
        .filter(|(index, window)| {
            *window == marker && bytes.get(index + marker.len()) != Some(&b's')
        })
        .count() as i64
}

pub fn run_ocr(settings: &OcrSettings, pdf_path: &Path) -> AppResult<String> {
    if !settings.enabled {
        return Err(AppError::Config("OCR 默认关闭，请先在设置中启用".into()));
    }
    let command = settings.command.trim();
    if command.is_empty() {
        return Err(AppError::Config("OCR 命令不能为空".into()));
    }
    if !pdf_path.is_file() {
        return Err(AppError::NotFound("待 OCR 的 PDF 不存在".into()));
    }

    let mut output_path = pdf_path.with_extension("ocr.txt");
    let mut args = if settings.arguments.is_empty() {
        vec![pdf_path.to_string_lossy().to_string(), "stdout".into()]
    } else {
        settings
            .arguments
            .iter()
            .map(|argument| {
                argument
                    .replace("{input}", &pdf_path.to_string_lossy())
                    .replace("{output}", &output_path.to_string_lossy())
            })
            .collect()
    };
    if settings
        .arguments
        .iter()
        .any(|value| value.contains("{output}"))
    {
        output_path = pdf_path.with_extension("ocr.txt");
    } else if settings.arguments.is_empty() {
        args = vec![pdf_path.to_string_lossy().to_string(), "stdout".into()];
    }

    let mut child = Command::new(command)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| AppError::Command(format!("无法启动 OCR 命令：{error}")))?;
    let timeout = Duration::from_secs(settings.timeout_seconds.clamp(1, 3_600) as u64);
    let started = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|error| AppError::Command(format!("OCR 状态读取失败：{error}")))?
            .is_some()
        {
            break;
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Command("OCR 执行超时".into()));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let output = child
        .wait_with_output()
        .map_err(|error| AppError::Command(format!("读取 OCR 输出失败：{error}")))?;
    if !output.status.success() {
        return Err(AppError::Command(format!(
            "OCR 命令退出码 {}",
            output.status.code().unwrap_or(-1)
        )));
    }

    let mut text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if settings
        .arguments
        .iter()
        .any(|value| value.contains("{output}"))
        && output_path.is_file()
    {
        text = fs::read_to_string(&output_path)?.trim().to_string();
        let _ = fs::remove_file(output_path);
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_and_counts_pdf_markers() {
        let bytes = b"%PDF /Type /Page /Type /Pages /Type /Page";
        assert_eq!(page_count(bytes), 2);
        assert_eq!(sha256(b"hello").len(), 64);
    }
}
