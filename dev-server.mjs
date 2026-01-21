/**
 * Custom dev server for Node.js 25 (bypasses Vercel CLI crash)
 * Runs Vite + API server in parallel
 */

import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamic imports for API modules
let providers, metrics, providerHealth, circuitBreaker, cors;

async function loadModules() {
  try {
    providers = await import('./api/providers.js');
    metrics = await import('./api/metrics.js');
    providerHealth = await import('./api/provider-health.js');
    circuitBreaker = await import('./api/circuit-breaker.js');
    cors = await import('./api/cors.js');
    console.log('✅ API modules loaded');
  } catch (e) {
    console.log('⚠️  API modules not loaded (using mock data):', e.message);
  }
}

// Start Vite dev server
function startVite() {
  console.log('🚀 Starting Vite dev server...');
  const vite = spawn('npx', ['vite', '--port', '5173'], {
    cwd: __dirname,
    shell: true,
    stdio: 'inherit'
  });

  vite.on('error', (err) => console.error('Vite error:', err));
  vite.on('close', (code) => {
    if (code !== 0) console.log(`Vite exited with code ${code}`);
  });

  return vite;
}

// Mock data for API
const MODELS = [
  { id: 'claude-3-5-sonnet-20240620', label: 'Claude (claude-3-5-sonnet)', provider: 'anthropic' },
  { id: 'gpt-4o-mini', label: 'OpenAI (gpt-4o-mini)', provider: 'openai' },
  { id: 'gemini-2.0-flash', label: 'Gemini (gemini-2.0-flash)', provider: 'google' },
  { id: 'llama-3.1-70b-versatile', label: 'Groq (llama-3.1-70b)', provider: 'groq' },
  { id: 'llama3.2:3b', label: 'Ollama (llama3.2:3b)', provider: 'ollama' },
];

function createHealthResponse() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.2.0-dev',
    summary: {
      total: MODELS.length,
      healthy: MODELS.length,
      degraded: 0,
      down: 0,
      notConfigured: 0,
      averageLatency: 50,
      overallSuccessRate: 100
    },
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
  };
}

// API Server
function startApiServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
      res.end(JSON.stringify(createHealthResponse()));
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
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const userMessage = data.prompt || 'Hello';

          // Try to call real AI if modules loaded
          // For now, return mock response
          res.writeHead(200);
          res.end(JSON.stringify({
            response: `**Dev Server Response** 🧛\n\nWiadomość: "${userMessage}"\n\nTo jest lokalny dev server dla Node.js 25. API działa w trybie mock.\n\nŻeby używać prawdziwego AI, uruchom Ollama lokalnie.`,
            model_used: 'dev-mock',
            sources: []
          }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Stream endpoint
    if (url === '/api/stream' && req.method === 'POST') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);

      const msg = 'Dev server streaming response dla Node.js 25.';
      let i = 0;
      const interval = setInterval(() => {
        if (i < msg.length) {
          res.write(`data: ${JSON.stringify({ token: msg[i] })}\n\n`);
          i++;
        } else {
          res.write(`data: ${JSON.stringify({ done: true, model_used: 'dev-mock' })}\n\n`);
          clearInterval(interval);
          res.end();
        }
      }, 30);
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found', path: url }));
  });

  server.listen(3001, () => {
    console.log('🧛 API server running on http://localhost:3001');
  });

  return server;
}

// Main
async function main() {
  console.log('\\n========================================');
  console.log('   REGIS DEV SERVER (Node.js 25)');
  console.log('========================================\\n');

  await loadModules();

  startApiServer();
  startVite();

  console.log('\\n📍 Frontend: http://localhost:5173');
  console.log('📍 API:      http://localhost:3001');
  console.log('\\nPress Ctrl+C to stop\\n');
}

main().catch(console.error);
