import type { VercelRequest, VercelResponse } from '@vercel/node';

interface InputPayload {
  prompt: string;
  model?: string;
}

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface OutputPayload {
  success: boolean;
  response: string;
  sources: SearchResult[];
  model_used: string;
  grounding_performed: boolean;
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

// Perform web grounding via Google Custom Search
async function performGrounding(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchCx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !searchCx) {
    console.log('Google Search not configured, skipping grounding');
    return [];
  }

  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchCx}&q=${encodeURIComponent(query)}&num=5`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('Google Search failed:', response.status);
      return [];
    }

    const data: GoogleSearchResponse = await response.json();

    return (data.items || []).map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet || '',
    }));
  } catch (error) {
    console.error('Grounding error:', error);
    return [];
  }
}

// Call Gemini API
async function callGemini(prompt: string, context: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: context
                  ? `Context from web search:\n${context}\n\nUser request:\n${prompt}`
                  : prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
}

// Call Ollama via Cloudflare Tunnel
async function callOllama(prompt: string, context: string): Promise<string> {
  const tunnelUrl = process.env.CLOUDFLARE_TUNNEL_URL;

  if (!tunnelUrl) {
    throw new Error('CLOUDFLARE_TUNNEL_URL not configured');
  }

  const response = await fetch(`${tunnelUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5-coder:7b',
      prompt: context ? `Context:\n${context}\n\nTask:\n${prompt}` : prompt,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return data.response || '';
}

// Check if prompt is code-related
function isCodePrompt(prompt: string): boolean {
  const codeKeywords = [
    'code', 'function', 'implement', 'script', 'program',
    'debug', 'fix', 'refactor', 'rust', 'python', 'javascript',
    'typescript', 'sql', 'api', 'endpoint', 'algorithm',
  ];

  const promptLower = prompt.toLowerCase();
  return codeKeywords.some((kw) => promptLower.includes(kw));
}

// Validate API key
function validateApiKey(req: VercelRequest): boolean {
  const expectedKey = process.env.INTERNAL_AUTH_KEY;

  if (!expectedKey) {
    return true; // No auth configured
  }

  const providedKey = req.headers['x-api-key'];
  return providedKey === expectedKey;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Validate API key
  if (!validateApiKey(req)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  try {
    const input: InputPayload = req.body;

    if (!input?.prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    // Step 1: Grounding
    const sources = await performGrounding(input.prompt);
    const context = sources
      .map((s) => `- ${s.title}: ${s.snippet}`)
      .join('\n');

    // Step 2: Route to appropriate model
    let response: string;
    let modelUsed: string;

    if (isCodePrompt(input.prompt) && process.env.CLOUDFLARE_TUNNEL_URL) {
      // Code task -> try Ollama first
      try {
        response = await callOllama(input.prompt, context);
        modelUsed = 'ollama/qwen2.5-coder';
      } catch {
        // Fallback to Gemini
        response = await callGemini(input.prompt, context);
        modelUsed = 'gemini-1.5-flash (fallback)';
      }
    } else {
      // General task -> Gemini
      response = await callGemini(input.prompt, context);
      modelUsed = 'gemini-1.5-flash';
    }

    const output: OutputPayload = {
      success: true,
      response,
      sources,
      model_used: modelUsed,
      grounding_performed: sources.length > 0,
    };

    res.status(200).json(output);
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
