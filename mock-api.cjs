const http = require('http');

const MODELS = [
  { id: 'claude-3-5-sonnet-20240620', label: 'Claude (claude-3-5-sonnet)', provider: 'anthropic' },
  { id: 'gpt-4o-mini', label: 'OpenAI (gpt-4o-mini)', provider: 'openai' },
  { id: 'gemini-2.0-flash', label: 'Gemini (gemini-2.0-flash)', provider: 'google' },
  { id: 'llama3.2:3b', label: 'Ollama (llama3.2:3b)', provider: 'ollama' },
];

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // Health endpoint
  if (url === '/api/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.2.0-mock',
      summary: { total: 4, healthy: 4, degraded: 0, down: 0, notConfigured: 0, averageLatency: 50, overallSuccessRate: 100 },
      providers: MODELS.map(m => ({
        model: m.id,
        provider: m.provider,
        configured: true,
        status: 'ok',
        circuit: { state: 'CLOSED', failures: 0, successes: 10, timeUntilRetry: null },
        health: { latency: 50, successRate: 1, healthScore: 10, requestCount: 100, errorCount: 0, lastChecked: Date.now() },
        usage: { tokens: 1000, cost: 0.01 },
        tokens: 1000,
        cost: 0.01
      }))
    }));
    return;
  }

  // Models endpoint
  if (url === '/api/models') {
    res.writeHead(200);
    res.end(JSON.stringify({ models: MODELS }));
    return;
  }

  // Execute endpoint (chat)
  if (url === '/api/execute' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const userMessage = data.prompt || 'Hello';

      res.writeHead(200);
      res.end(JSON.stringify({
        response: `**Mock Response** 🧛\n\nOtrzymałem Twoją wiadomość: "${userMessage}"\n\nTo jest mock API - prawdziwe AI nie jest połączone. Uruchom \`vercel dev\` z Node.js 20 LTS żeby mieć pełną funkcjonalność.`,
        model_used: 'mock-model',
        sources: []
      }));
    });
    return;
  }

  // Stream endpoint
  if (url === '/api/stream' && req.method === 'POST') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200);

    const msg = 'To jest mock streaming response. Zainstaluj Node.js 20 LTS żeby używać prawdziwego AI.';
    let i = 0;
    const interval = setInterval(() => {
      if (i < msg.length) {
        res.write(`data: ${JSON.stringify({ token: msg[i] })}\n\n`);
        i++;
      } else {
        res.write(`data: ${JSON.stringify({ done: true, model_used: 'mock' })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    }, 30);
    return;
  }

  // 404 for other routes
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\n🧛 Mock API running on http://localhost:${PORT}`);
  console.log('   Endpoints: /api/health, /api/models, /api/execute, /api/stream\n');
});
