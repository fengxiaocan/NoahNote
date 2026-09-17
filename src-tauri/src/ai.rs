use reqwest::{blocking::Client, Url};
use serde_json::json;

use crate::{
    error::{AppError, AppResult},
    models::{AiProvider, AiRequest, AiResult, AiSettings},
};

pub fn run(settings: &AiSettings, request: AiRequest) -> AppResult<AiResult> {
    if !settings.enabled || matches!(settings.provider, AiProvider::None) {
        return Err(AppError::Config(
            "AI 默认关闭，请先在设置中启用并选择 Provider".into(),
        ));
    }
    validate_operation(&request.operation)?;
    let endpoint = endpoint(settings)?;
    if !is_local_endpoint(&endpoint) && !settings.allow_external {
        return Err(AppError::Config(
            "外部 AI 请求已被隐私保护拦截，请显式开启允许外部请求".into(),
        ));
    }

    let max_chars = settings.max_context_chars.clamp(500, 100_000) as usize;
    let content = truncate(&request.content, max_chars);
    let context = truncate(&request.context, max_chars / 2);
    let prompt = build_prompt(&request, &content, &context);
    let url = endpoint
        .join("chat/completions")
        .map_err(|error| AppError::Config(format!("AI Endpoint 无效：{error}")))?;
    let client = Client::builder()
        .build()
        .map_err(|error| AppError::Http(error.to_string()))?;
    let mut builder = client
        .post(url)
        .json(&json!({
            "model": settings.model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": "你是 NoahNote的本地工作助手。请简洁、结构化地回答，不泄露或臆造不存在的信息。"},
                {"role": "user", "content": prompt}
            ]
        }));
    if let Some(key) = settings
        .api_key
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        builder = builder.bearer_auth(key);
    }
    let response = builder
        .send()
        .map_err(|error| AppError::Http(error.to_string()))?;
    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|error| AppError::Http(format!("AI 响应格式无效：{error}")))?;
    if !status.is_success() {
        let detail = body
            .get("error")
            .and_then(|value| value.get("message"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("服务端未返回错误详情");
        return Err(AppError::Http(format!(
            "AI 请求失败（{}）：{detail}",
            status
        )));
    }
    let content = body
        .get("choices")
        .and_then(|value| value.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(serde_json::Value::as_str)
        .or_else(|| body.get("output").and_then(serde_json::Value::as_str))
        .or_else(|| body.get("text").and_then(serde_json::Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Http("AI 响应中没有可用内容".into()))?;

    Ok(AiResult {
        operation: request.operation,
        content: content.to_string(),
        provider: settings.provider.clone(),
        model: settings.model.clone(),
    })
}

fn endpoint(settings: &AiSettings) -> AppResult<Url> {
    let raw = match settings.provider {
        AiProvider::Local => settings
            .endpoint
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("http://127.0.0.1:11434/v1"),
        AiProvider::OpenaiCompatible => settings
            .endpoint
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("https://api.openai.com/v1"),
        AiProvider::Custom => settings
            .endpoint
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| AppError::Config("Custom AI Provider 需要填写 Endpoint".into()))?,
        AiProvider::None => return Err(AppError::Config("未选择 AI Provider".into())),
    };
    let raw = format!("{}/", raw.trim_end_matches('/'));
    Url::parse(&raw).map_err(|error| AppError::Config(format!("AI Endpoint 无效：{error}")))
}

fn is_local_endpoint(url: &Url) -> bool {
    matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
}

fn validate_operation(operation: &str) -> AppResult<()> {
    if matches!(
        operation,
        "summary" | "title" | "tags" | "meeting" | "tasks" | "qa"
    ) {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "不支持的 AI 操作：{operation}"
        )))
    }
}

fn build_prompt(request: &AiRequest, content: &str, context: &str) -> String {
    let task = match request.operation.as_str() {
        "summary" => "总结内容，输出 3-6 条关键点和一个不超过 30 字的结论。",
        "title" => "为内容生成 3 个简洁、可检索的中文标题候选，每行一个。",
        "tags" => "提取 3-8 个中文或英文标签，只输出逗号分隔的标签。",
        "meeting" => "整理为会议纪要：背景、决定、待办、风险四个小节。",
        "tasks" => "从内容中拆分可执行任务，每行输出：任务｜负责人（未知则写待确认）｜截止时间（未知则写待定）。",
        "qa" => "基于提供的内容回答问题；若内容不足，请明确说明证据不足。",
        _ => "处理内容。",
    };
    let question = request
        .question
        .as_deref()
        .map(|value| format!("\n问题：{}", truncate(value, 2_000)))
        .unwrap_or_default();
    format!("{task}{question}\n\n内容：\n{content}\n\n相关上下文（仅供参考）：\n{context}")
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars.max(1)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_ai_does_not_make_a_request() {
        let result = run(
            &AiSettings::default(),
            AiRequest {
                operation: "summary".into(),
                content: "secret".into(),
                context: String::new(),
                question: None,
            },
        );
        assert!(matches!(result, Err(AppError::Config(_))));
    }

    #[test]
    fn local_provider_rejects_remote_endpoint_without_permission() {
        let result = run(
            &AiSettings {
                enabled: true,
                provider: AiProvider::Local,
                endpoint: Some("https://example.com/v1".into()),
                ..AiSettings::default()
            },
            AiRequest {
                operation: "summary".into(),
                content: "secret".into(),
                context: String::new(),
                question: None,
            },
        );
        assert!(
            matches!(result, Err(AppError::Config(message)) if message.contains("外部 AI 请求"))
        );
    }
}
