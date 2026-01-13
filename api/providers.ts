interface ProviderCallInput {
  prompt: string;
  context: string;
  model: string;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  provider: string;
  costPer1kTokens: number;
  isConfigured: () => boolean;
  call: (input: ProviderCallInput) => Promise<string>;
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]);
}

function getModelsFromEnv(envKey: string, fallback: string[]): string[] {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export const providerModels = {
  anthropic: () => getModelsFromEnv('ANTHROPIC_MODELS', ['claude-3-5-sonnet-20240620']),
  openai: () => getModelsFromEnv('OPENAI_MODELS', ['gpt-4o-mini']),
  google: () => getModelsFromEnv('GOOGLE_MODELS', ['gemini-2.0-flash']),
  mistral: () => getModelsFromEnv('MISTRAL_MODELS', ['mistral-small-latest']),
  groq: () => getModelsFromEnv('GROQ_MODELS', ['llama-3.1-70b-versatile']),
  ollama: () => getModelsFromEnv('OLLAMA_MODELS', ['qwen2.5-coder:7b']),
};

function buildProviderModels(
  provider: ProviderDefinition['provider'],
  models: string[],
  labelPrefix: string,
  costPer1kTokens: number,
  isConfigured: () => boolean,
  call: ProviderDefinition['call']
): ProviderDefinition[] {
  return models.map((model) => ({
    id: model,
    label: `${labelPrefix} (${model})`,
    provider,
    costPer1kTokens,
    isConfigured,
    call,
  }));
}

export function listAvailableModels(): ProviderDefinition[] {
  return [
    ...buildProviderModels(
      'anthropic',
      providerModels.anthropic(),
      'Claude',
      0.003,
      () => hasEnv('ANTHROPIC_API_KEY'),
      callAnthropic
    ),
    ...buildProviderModels(
      'openai',
      providerModels.openai(),
      'OpenAI',
      0.00015,
      () => hasEnv('OPENAI_API_KEY'),
      callOpenAI
    ),
    ...buildProviderModels(
      'google',
      providerModels.google(),
      'Gemini',
      0.0001,
      () => hasEnv('GOOGLE_API_KEY'),
      callGoogle
    ),
    ...buildProviderModels(
      'mistral',
      providerModels.mistral(),
      'Mistral',
      0.0002,
      () => hasEnv('MISTRAL_API_KEY'),
      callMistral
    ),
    ...buildProviderModels(
      'groq',
      providerModels.groq(),
      'Groq',
      0.0002,
      () => hasEnv('GROQ_API_KEY'),
      callGroq
    ),
    ...buildProviderModels(
      'ollama',
      providerModels.ollama(),
      'Ollama',
      0,
      () => hasEnv('CLOUDFLARE_TUNNEL_URL'),
      callOllama
    ),
  ];
}

async function callAnthropic({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data?.content?.[0]?.text || 'No response generated';
}

async function callOpenAI({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || 'No response generated';
}

async function callGoogle({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
    throw new Error(`Google API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
}

async function callMistral({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not configured');
  }

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || 'No response generated';
}

async function callGroq({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nUser:\n${prompt}` : prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || 'No response generated';
}

async function callOllama({ prompt, context, model }: ProviderCallInput): Promise<string> {
  const tunnelUrl = process.env.CLOUDFLARE_TUNNEL_URL;
  if (!tunnelUrl) {
    throw new Error('CLOUDFLARE_TUNNEL_URL not configured');
  }

  const response = await fetch(`${tunnelUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
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
