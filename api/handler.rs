use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;
use vercel_runtime::{run, Body, Error, Request, Response, StatusCode};

/// Input payload from frontend
#[derive(Debug, Deserialize)]
struct InputPayload {
    prompt: String,
    #[serde(default)]
    model: Option<String>,
}

/// Output payload to frontend
#[derive(Debug, Serialize)]
struct OutputPayload {
    success: bool,
    response: String,
    sources: Vec<SearchResult>,
    model_used: String,
    grounding_performed: bool,
}

/// Search result from Google Custom Search
#[derive(Debug, Serialize, Deserialize, Clone)]
struct SearchResult {
    title: String,
    link: String,
    snippet: String,
}

/// Google Custom Search API response
#[derive(Debug, Deserialize)]
struct GoogleSearchResponse {
    items: Option<Vec<GoogleSearchItem>>,
}

#[derive(Debug, Deserialize)]
struct GoogleSearchItem {
    title: String,
    link: String,
    snippet: Option<String>,
}

/// Perform grounding via Google Custom Search
async fn perform_grounding(query: &str) -> Result<Vec<SearchResult>> {
    let api_key = env::var("GOOGLE_API_KEY").context("GOOGLE_API_KEY not set")?;
    let search_cx = env::var("GOOGLE_SEARCH_CX").context("GOOGLE_SEARCH_CX not set")?;

    let url = format!(
        "https://www.googleapis.com/customsearch/v1?key={}&cx={}&q={}&num=5",
        api_key,
        search_cx,
        urlencoding::encode(query)
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .context("Failed to fetch search results")?;

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    let search_response: GoogleSearchResponse = response
        .json()
        .await
        .unwrap_or(GoogleSearchResponse { items: None });

    let results = search_response
        .items
        .unwrap_or_default()
        .into_iter()
        .map(|item| SearchResult {
            title: item.title,
            link: item.link,
            snippet: item.snippet.unwrap_or_default(),
        })
        .collect();

    Ok(results)
}

/// Call Ollama via Cloudflare Tunnel (for code tasks)
async fn call_ollama(prompt: &str, context: &str) -> Result<String> {
    let tunnel_url = env::var("CLOUDFLARE_TUNNEL_URL").context("CLOUDFLARE_TUNNEL_URL not set")?;

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/api/generate", tunnel_url))
        .json(&json!({
            "model": "qwen2.5-coder:7b",
            "prompt": format!("Context:\n{}\n\nTask:\n{}", context, prompt),
            "stream": false
        }))
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .context("Failed to call Ollama")?;

    let result: serde_json::Value = response.json().await?;
    Ok(result["response"].as_str().unwrap_or("").to_string())
}

/// Call Gemini API (for general tasks)
async fn call_gemini(prompt: &str, context: &str) -> Result<String> {
    let api_key = env::var("GOOGLE_API_KEY").context("GOOGLE_API_KEY not set")?;

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={}",
            api_key
        ))
        .json(&json!({
            "contents": [{
                "parts": [{
                    "text": format!("Context from web search:\n{}\n\nUser request:\n{}", context, prompt)
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048
            }
        }))
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .context("Failed to call Gemini")?;

    let result: serde_json::Value = response.json().await?;

    let text = result["candidates"]
        .get(0)
        .and_then(|c| c["content"]["parts"].get(0))
        .and_then(|p| p["text"].as_str())
        .unwrap_or("No response generated");

    Ok(text.to_string())
}

/// Check if prompt is code-related
fn is_code_prompt(prompt: &str) -> bool {
    let code_keywords = [
        "code", "function", "implement", "script", "program",
        "debug", "fix", "refactor", "rust", "python", "javascript",
        "typescript", "sql", "api", "endpoint", "algorithm"
    ];

    let prompt_lower = prompt.to_lowercase();
    code_keywords.iter().any(|kw| prompt_lower.contains(kw))
}

/// Validate API key from request header
fn validate_api_key(req: &Request) -> bool {
    let expected_key = env::var("INTERNAL_AUTH_KEY").unwrap_or_default();

    if expected_key.is_empty() {
        return true; // No auth configured
    }

    req.headers()
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .map(|key| key == expected_key)
        .unwrap_or(false)
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(handler).await
}

async fn handler(req: Request) -> Result<Response<Body>, Error> {
    // CORS preflight
    if req.method() == "OPTIONS" {
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "POST, OPTIONS")
            .header("Access-Control-Allow-Headers", "Content-Type, x-api-key")
            .body(Body::Empty)?);
    }

    // Validate API key
    if !validate_api_key(&req) {
        return Ok(Response::builder()
            .status(StatusCode::UNAUTHORIZED)
            .header("Content-Type", "application/json")
            .body(Body::Text(json!({"error": "Invalid API key"}).to_string()))?);
    }

    // Parse request body
    let body = req.into_body();
    let body_bytes = match body {
        Body::Text(s) => s.into_bytes(),
        Body::Binary(b) => b.to_vec(),
        _ => vec![],
    };

    let input: InputPayload = match serde_json::from_slice(&body_bytes) {
        Ok(p) => p,
        Err(e) => {
            return Ok(Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header("Content-Type", "application/json")
                .body(Body::Text(json!({"error": format!("Invalid JSON: {}", e)}).to_string()))?);
        }
    };

    // Step 1: Grounding - search for context
    let sources = perform_grounding(&input.prompt).await.unwrap_or_default();
    let context = sources
        .iter()
        .map(|s| format!("- {}: {}", s.title, s.snippet))
        .collect::<Vec<_>>()
        .join("\n");

    // Step 2: Route to appropriate model
    let (response, model_used) = if is_code_prompt(&input.prompt) {
        // Code task -> Ollama via tunnel
        match call_ollama(&input.prompt, &context).await {
            Ok(r) => (r, "ollama/qwen2.5-coder".to_string()),
            Err(_) => {
                // Fallback to Gemini
                let r = call_gemini(&input.prompt, &context).await.unwrap_or_default();
                (r, "gemini-1.5-flash (fallback)".to_string())
            }
        }
    } else {
        // General task -> Gemini
        let r = call_gemini(&input.prompt, &context).await.unwrap_or_default();
        (r, "gemini-1.5-flash".to_string())
    };

    // Build output
    let output = OutputPayload {
        success: true,
        response,
        sources,
        model_used,
        grounding_performed: !context.is_empty(),
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::Text(serde_json::to_string(&output)?))?)
}
