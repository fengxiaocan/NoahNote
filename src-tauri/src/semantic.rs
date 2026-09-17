use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};

use crate::{
    error::AppResult,
    models::{SearchResult, SemanticDocumentRecord, Space},
    storage::Database,
};

pub const EMBEDDING_DIMENSIONS: usize = 128;

pub struct IndexInput<'a> {
    pub id: &'a str,
    pub kind: &'a str,
    pub title: &'a str,
    pub content: &'a str,
    pub space: &'a Space,
    pub updated_at: &'a str,
    pub tags: &'a [String],
}

/// Local, deterministic embedding used by the offline-first semantic index.
/// It intentionally has no network dependency: token and character n-gram hashes
/// provide useful similarity for notes and PDFs while a remote embedding service
/// remains optional for a future provider implementation.
pub fn embed_text(value: &str) -> Vec<f32> {
    let mut vector = vec![0.0_f32; EMBEDDING_DIMENSIONS];
    let normalized = value.to_lowercase();
    let chars: Vec<char> = normalized.chars().collect();
    for window in 1..=3 {
        for slice in chars.windows(window) {
            add_hash(&mut vector, slice.iter().collect::<String>().as_str(), 1.0);
        }
    }
    for token in normalized
        .split_whitespace()
        .filter(|token| !token.is_empty())
    {
        add_hash(&mut vector, token, 2.0);
    }
    normalize(&mut vector);
    vector
}

pub fn cosine_similarity(left: &[f32], right: &[f32]) -> f64 {
    let length = left.len().min(right.len());
    let mut dot = 0.0_f64;
    let mut left_norm = 0.0_f64;
    let mut right_norm = 0.0_f64;
    for index in 0..length {
        let lhs = f64::from(left[index]);
        let rhs = f64::from(right[index]);
        dot += lhs * rhs;
        left_norm += lhs * lhs;
        right_norm += rhs * rhs;
    }
    if left_norm == 0.0 || right_norm == 0.0 {
        return 0.0;
    }
    (dot / (left_norm.sqrt() * right_norm.sqrt())).clamp(-1.0, 1.0)
}

pub fn index_document(database: &Database, input: IndexInput<'_>) -> AppResult<()> {
    database.upsert_semantic_document(&SemanticDocumentRecord {
        id: input.id.to_string(),
        kind: input.kind.to_string(),
        title: input.title.to_string(),
        content: input.content.to_string(),
        space: input.space.clone(),
        vector: embed_text(&format!(
            "{}\n{}\n{}",
            input.title,
            input.content,
            input.tags.join(" ")
        )),
        updated_at: input.updated_at.to_string(),
        tags: input.tags.to_vec(),
    })
}

pub fn search(
    database: &Database,
    query: &str,
    space: &Space,
    limit: usize,
) -> AppResult<Vec<SearchResult>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let mut by_id = HashMap::<String, SearchResult>::new();
    for mut result in database.search(query, space)? {
        result.score = 1.0;
        by_id.insert(result.id.clone(), result);
    }

    let query_vector = embed_text(query);
    for document in database.list_semantic_documents(space)? {
        let similarity = cosine_similarity(&query_vector, &document.vector);
        if similarity < 0.08 {
            continue;
        }
        let candidate = SearchResult {
            id: document.id.clone(),
            kind: document.kind,
            title: document.title,
            snippet: snippet(&document.content),
            space: document.space,
            updated_at: document.updated_at,
            tags: document.tags,
            score: similarity,
        };
        by_id
            .entry(candidate.id.clone())
            .and_modify(|current| {
                current.score = (current.score * 0.7 + similarity * 0.7).min(1.7);
                if current.snippet.is_empty() {
                    current.snippet = candidate.snippet.clone();
                }
            })
            .or_insert(candidate);
    }

    let mut results: Vec<SearchResult> = by_id.into_values().collect();
    results.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.updated_at.cmp(&left.updated_at))
    });
    results.truncate(limit.max(1));
    Ok(results)
}

fn add_hash(vector: &mut [f32], value: &str, weight: f32) {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    let hash = hasher.finish();
    let index = (hash as usize) % vector.len();
    let sign = if hash & 1 == 0 { 1.0 } else { -1.0 };
    vector[index] += sign * weight;
}

fn normalize(vector: &mut [f32]) {
    let norm = vector
        .iter()
        .map(|value| f64::from(*value).powi(2))
        .sum::<f64>()
        .sqrt();
    if norm == 0.0 {
        return;
    }
    for value in vector {
        *value = (*value as f64 / norm) as f32;
    }
}

fn snippet(content: &str) -> String {
    let compact = content.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(220).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn related_text_has_higher_similarity() {
        let query = embed_text("网络延迟 timeout");
        let related = embed_text("检查网络延迟和 timeout");
        let unrelated = embed_text("周末采购清单牛奶");
        assert!(cosine_similarity(&query, &related) > cosine_similarity(&query, &unrelated));
    }
}
