# DOKUMENTACJA TECHNICZNA
## Regis Matrix Lab v2.0.0

**Ostatnia aktualizacja:** 2026-01-20
**Autor:** Claude Opus 4.5 + Team

---

# SPIS TREŚCI

1. [Wprowadzenie](#1-wprowadzenie)
2. [Architektura systemu](#2-architektura-systemu)
3. [Struktura projektu](#3-struktura-projektu)
4. [Konfiguracja](#4-konfiguracja)
5. [Backend - Edge Functions](#5-backend---edge-functions)
6. [Frontend - React](#6-frontend---react)
7. [System autoryzacji](#7-system-autoryzacji)
8. [Integracje AI](#8-integracje-ai)
9. [SSE Streaming](#9-sse-streaming)
10. [Circuit Breaker](#10-circuit-breaker)
11. [Caching](#11-caching)
12. [Rate Limiting](#12-rate-limiting)
13. [Metrics & Monitoring](#13-metrics--monitoring)
14. [Logging & Audit](#14-logging--audit)
15. [Grounding System](#15-grounding-system)
16. [Error Handling](#16-error-handling)
17. [Provider Management](#17-provider-management)
18. [UX Improvements](#18-ux-improvements)
19. [Lokalizacja (i18n)](#19-lokalizacja-i18n)
20. [Storage i szyfrowanie](#20-storage-i-szyfrowanie)
21. [Testowanie](#21-testowanie)
22. [Deployment](#22-deployment)
23. [API Reference](#23-api-reference)
24. [Zmienne środowiskowe](#24-zmienne-środowiskowe)
25. [Skróty klawiaturowe](#25-skróty-klawiaturowe)

---

# 1. WPROWADZENIE

## 1.1 Opis projektu

**Regis Matrix Lab** to zaawansowany asystent badawczy oparty na sztucznej inteligencji z motywem "Matrix" (digital rain). Wersja 2.0 wprowadza 50 usprawnień komunikacji AI w 10 blokach architektonicznych.

### Główne cechy:

- **SSE Streaming** - strumieniowanie odpowiedzi w czasie rzeczywistym
- **Circuit Breaker** - wzorzec odporności na błędy providerów
- **Smart Caching** - LRU cache z TTL i deduplikacją requestów
- **Rate Limiting** - sliding window algorithm per IP/user/provider
- **Metrics Dashboard** - percentyle latencji, koszty, alerty
- **Structured Logging** - request ID, correlation ID, audit trail
- **Multi-Provider Grounding** - fallback search z 4 providerów
- **Error Recovery** - 20 kodów błędów z sugestiami naprawy
- **Provider Management** - UI do zarządzania providerami
- **Offline Support** - kolejka offline, optimistic updates

## 1.2 Główne funkcjonalności

| Funkcja | Opis |
|---------|------|
| **SSE Streaming** | Real-time streaming odpowiedzi AI |
| **Circuit Breaker** | Automatyczny fallback przy awarii providera |
| **LRU Cache** | Cache odpowiedzi (5min TTL, 100 entries) |
| **Rate Limiting** | 20/min IP, 50/min user, 100/min provider |
| **Metrics** | P50/P95/P99 latencji, koszty, błędy |
| **Grounding** | Google, Brave, Serper, DuckDuckGo fallback |
| **Multi-Provider** | Anthropic, OpenAI, Google, Mistral, Groq, Ollama |
| **JWT Auth** | Bezpieczna autoryzacja z httpOnly cookies |
| **Offline Queue** | Kolejka requestów przy braku sieci |
| **PWA** | Service Worker + instalacja |

## 1.3 Stack technologiczny

### Frontend
```
React 19 + TypeScript 5.2 + Vite 7.3.1
Tailwind CSS 3.4.1 + Framer Motion 11.0.8
Zustand 4.5.2 + TanStack Query 5.56.2
i18next 23.12.2 + React Hook Form 7.51.2
```

### Backend
```
Vercel Edge Functions (cdg1, fra1)
jose 5.2.3 (JWT) + Web Crypto API
openapi-typescript 7.10.1
```

### Testing
```
Playwright (E2E) + Vitest (Unit)
75 unit tests + 96 E2E tests
```

---

# 2. ARCHITEKTURA SYSTEMU

## 2.1 Diagram wysokopoziomowy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           KLIENT (Browser)                               │
├─────────────────────────────────────────────────────────────────────────┤
│  React 19 App                                                            │
│  ├── App.tsx (State orchestration)                                       │
│  ├── Components (ChatInterface, MetricsDashboard, ProviderManager)       │
│  ├── Hooks (useOptimisticUpdates, useOfflineQueue)                       │
│  ├── Lib (api-client, stream-parser, error-handler)                      │
│  └── Service Worker (PWA offline)                                        │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ HTTPS (fetch + SSE)
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      VERCEL EDGE FUNCTIONS                               │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Logger    │  │   Cache     │  │ Rate Limit  │  │  Circuit    │     │
│  │  (Audit)    │  │   (LRU)     │  │  (Sliding)  │  │  Breaker    │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         └─────────────────┴─────────────────┴─────────────────┘         │
│                                    │                                     │
│  ┌─────────────────────────────────┴─────────────────────────────────┐  │
│  │                        /api/execute (main)                         │  │
│  │                        /api/stream (SSE)                           │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Metrics    │  │  Grounding  │  │  Providers  │  │   Health    │     │
│  │  (Store)    │  │  (Search)   │  │  (6 APIs)   │  │  (Monitor)  │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Search Providers │ │   AI Providers   │ │    Monitoring    │
│  ├─ Google       │ │  ├─ Anthropic    │ │  ├─ Metrics      │
│  ├─ Brave        │ │  ├─ OpenAI       │ │  ├─ Alerts       │
│  ├─ Serper       │ │  ├─ Google       │ │  └─ Dashboard    │
│  └─ DuckDuckGo   │ │  ├─ Mistral      │ │                  │
│                  │ │  ├─ Groq         │ │                  │
│                  │ │  └─ Ollama       │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## 2.2 Flow przetwarzania requestu

```
1. Request → Logger (requestId, correlationId)
2. Rate Limit Check (IP → User → Provider)
3. Cache Check (SHA-256 key)
4. Deduplication (concurrent requests)
5. Circuit Breaker (provider state)
6. Grounding Decision (smart analysis)
7. Provider Call (with fallback)
8. Metrics Recording
9. Cache Population
10. Response (+ headers)
```

## 2.3 Przepływ danych SSE

```
Client                    Server
  │                         │
  │──POST /api/stream──────>│
  │                         │
  │<──data: {"chunk":"Hi"}──│
  │<──data: {"chunk":"!"}───│
  │<──data: {"done":true}───│
  │                         │
```

---

# 3. STRUKTURA PROJEKTU

```
RegisClaudeMaster/
├── api/                          # Backend - Vercel Edge Functions
│   ├── execute.ts                # Main AI execution endpoint
│   ├── stream.ts                 # SSE streaming endpoint
│   ├── models.ts                 # Available models list
│   ├── health.ts                 # System health check
│   │
│   ├── circuit-breaker.ts        # Circuit breaker pattern
│   ├── provider-health.ts        # Provider health tracking
│   ├── providers.ts              # Multi-provider AI calls
│   ├── provider-config.ts        # Provider configuration
│   ├── provider-admin.ts         # Provider admin endpoint
│   │
│   ├── cache.ts                  # LRU cache with TTL
│   ├── cache-admin.ts            # Cache management endpoint
│   ├── dedup.ts                  # Request deduplication
│   │
│   ├── rate-limit.ts             # Sliding window rate limiter
│   ├── cors.ts                   # CORS headers builder
│   │
│   ├── metrics.ts                # Metrics store
│   ├── metrics-dashboard.ts      # Metrics API endpoint
│   ├── alerts.ts                 # Alert system
│   │
│   ├── logger.ts                 # Structured logging
│   ├── audit.ts                  # Audit trail
│   ├── logs.ts                   # Log viewer endpoint
│   │
│   ├── grounding.ts              # Web search grounding
│   ├── errors.ts                 # Error codes & handling
│   │
│   └── auth/                     # Authentication
│       ├── login.ts
│       ├── logout.ts
│       ├── refresh.ts
│       └── auth-utils.ts
│
├── src/                          # Frontend - React
│   ├── App.tsx                   # Root component
│   ├── main.tsx                  # Entry point
│   │
│   ├── components/               # React components
│   │   ├── ChatInterface.tsx     # Main chat UI
│   │   ├── MetricsDashboard.tsx  # Metrics visualization
│   │   ├── ProviderManager.tsx   # Provider management UI
│   │   ├── ErrorDisplay.tsx      # Error display component
│   │   ├── SourcesList.tsx       # Grounding sources display
│   │   ├── CostDisplay.tsx       # Cost visualization
│   │   ├── GroundingToggle.tsx   # Grounding on/off toggle
│   │   ├── ProgressIndicator.tsx # Streaming progress
│   │   ├── FeedbackButton.tsx    # User feedback
│   │   ├── OfflineIndicator.tsx  # Offline status banner
│   │   └── ui/                   # Reusable UI components
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useOptimisticUpdates.ts
│   │   └── useOfflineQueue.ts
│   │
│   ├── lib/                      # Utilities
│   │   ├── api-client.ts         # API communication
│   │   ├── stream-parser.ts      # SSE stream parsing
│   │   ├── error-handler.ts      # Client-side error handling
│   │   ├── models-store.ts       # Zustand models store
│   │   ├── preferences-store.ts  # User preferences
│   │   ├── storage.ts            # IndexedDB/localStorage
│   │   └── utils.ts              # General utilities
│   │
│   └── i18n/                     # Internationalization
│       ├── config.ts
│       └── locales/
│           ├── en.json
│           └── pl.json
│
├── tests/                        # Tests
│   ├── unit/                     # Vitest unit tests
│   │   ├── lib/
│   │   │   ├── api-client.test.ts
│   │   │   ├── storage.test.ts
│   │   │   └── utils.test.ts
│   │   └── stores/
│   │       ├── models-store.test.ts
│   │       └── preferences-store.test.ts
│   │
│   ├── accessibility.spec.ts     # Playwright E2E
│   └── chat.spec.ts              # Playwright E2E
│
├── dist/                         # Build output
├── public/                       # Static assets
│
├── vite.config.ts                # Vite configuration
├── vitest.config.ts              # Vitest configuration
├── playwright.config.ts          # Playwright configuration
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── vercel.json                   # Vercel deployment config
└── package.json                  # Dependencies
```

---

# 4. KONFIGURACJA

## 4.1 vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Regis Matrix Lab',
        short_name: 'Regis',
        theme_color: '#0a1f0a',
        background_color: '#0a0a0a',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          animations: ['framer-motion'],
        },
      },
    },
  },
});
```

## 4.2 vercel.json

```json
{
  "regions": ["cdg1", "fra1"],
  "functions": {
    "api/execute.ts": { "maxDuration": 60 },
    "api/stream.ts": { "maxDuration": 60 },
    "api/metrics-dashboard.ts": { "maxDuration": 10 },
    "api/provider-admin.ts": { "maxDuration": 10 },
    "api/cache-admin.ts": { "maxDuration": 10 },
    "api/logs.ts": { "maxDuration": 10 }
  },
  "rewrites": [
    { "source": "/api/stream", "destination": "/api/stream" },
    { "source": "/api/metrics-dashboard", "destination": "/api/metrics-dashboard" },
    { "source": "/api/provider-admin", "destination": "/api/provider-admin" },
    { "source": "/api/cache-admin", "destination": "/api/cache-admin" },
    { "source": "/api/logs", "destination": "/api/logs" }
  ]
}
```

## 4.3 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "api"]
}
```

---

# 5. BACKEND - EDGE FUNCTIONS

## 5.1 Główny endpoint: /api/execute

**Plik:** `api/execute.ts`

### Interfejsy

```typescript
interface InputPayload {
  prompt: string;
  model?: string;
  stream?: boolean;
  groundingEnabled?: boolean;
  skipCache?: boolean;
}

interface OutputPayload {
  success: boolean;
  response?: string;
  sources?: GroundingSource[];
  model_used?: string;
  grounding_performed?: boolean;
  grounding_metadata?: GroundingResult;
  cached?: boolean;
  rate_limit?: RateLimitResult;
  error?: string;
}
```

### Flow przetwarzania

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  const ctx = extractRequestContext(req);
  const logger = createLogger(ctx.requestId, ctx.correlationId);

  logger.requestStart(req, { prompt: prompt?.slice(0, 100) });

  // 1. Rate limiting
  const rateLimitResult = await checkAllLimiters(ip, userId);
  if (!rateLimitResult.allowed) {
    recordAudit('rate_limit_exceeded', ip, { limitType: rateLimitResult.limitType });
    return res.status(429).json(createRateLimitError(rateLimitResult));
  }

  // 2. Cache check
  const cacheKey = await generateCacheKey(prompt, model, groundingEnabled);
  const cached = responseCache.get(cacheKey);
  if (cached && !skipCache) {
    logger.cacheHit('response', cacheKey);
    return res.status(200).json({ ...cached, cached: true });
  }

  // 3. Deduplication
  const result = await dedup(cacheKey, async () => {
    // 4. Grounding
    const groundingResult = await performSmartGrounding(prompt);

    // 5. Provider call with circuit breaker
    for (const provider of getProvidersByHealth()) {
      if (!providerCircuits.get(provider.id)?.canExecute()) continue;

      try {
        const response = await provider.call(prompt, groundingResult);
        providerCircuits.get(provider.id)?.recordSuccess();
        return response;
      } catch (error) {
        providerCircuits.get(provider.id)?.recordFailure();
      }
    }
    throw new AppError(ErrorCode.ALL_PROVIDERS_FAILED);
  });

  // 6. Cache & metrics
  responseCache.set(cacheKey, result);
  metricsStore.record({ provider, model, latency, tokens, cost });

  logger.requestEnd(200, Date.now() - startTime);
  return res.status(200).json(result);
}
```

## 5.2 Streaming endpoint: /api/stream

**Plik:** `api/stream.ts`

### Format SSE

```
data: {"chunk":"Hello","done":false}

data: {"chunk":" world!","done":false}

data: {"done":true,"model_used":"claude-3-sonnet","sources":[],"grounding_performed":false}

```

### Implementacja

```typescript
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await callProviderStreaming(provider, {
          prompt,
          model,
          systemPrompt: groundingContext,
          onChunk: (chunk) => sendEvent({ chunk, done: false }),
        });

        sendEvent({
          done: true,
          model_used: model,
          sources: groundingResult.sources,
          grounding_performed: groundingResult.groundingPerformed,
        });
      } catch (error) {
        sendEvent({ error: error.message, done: true });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

# 6. FRONTEND - REACT

## 6.1 Główne komponenty

### ChatInterface.tsx

Główny interfejs czatu z obsługą:
- Wysyłania wiadomości
- Streamingu odpowiedzi
- Wyświetlania źródeł
- Obsługi błędów

### MetricsDashboard.tsx

Dashboard metryk z:
- Wykresami latencji
- Kosztami per provider
- Alertami
- Eksportem danych

```tsx
export function MetricsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    if (autoRefresh) {
      const interval = setInterval(fetchDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  return (
    <div className="bg-black/30 backdrop-blur-sm rounded-lg p-6">
      <StatsGrid stats={data?.aggregated} />
      <LatencyChart timeSeries={data?.timeSeries} />
      <ProviderCards providers={data?.providerBreakdown} />
      <AlertsList alerts={data?.activeAlerts} />
    </div>
  );
}
```

### ProviderManager.tsx

UI zarządzania providerami:
- Lista providerów z statusem
- Włączanie/wyłączanie
- Zmiana priorytetów
- Stan circuit breakera

### ErrorDisplay.tsx

Wyświetlanie błędów z:
- Ikoną kontekstową
- Opisem błędu
- Sugestiami naprawy
- Przyciskami retry/dismiss

```tsx
interface ErrorDisplayProps {
  error: ApiError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorDisplay({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  const suggestions = getRecoverySuggestions(error);

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
      <span className="text-2xl">{getErrorIcon(error.code)}</span>
      <h4 className="text-red-300">{error.message}</h4>
      <ul className="mt-3">
        {suggestions.map((s, i) => (
          <li key={i} className="text-red-200/60">{s}</li>
        ))}
      </ul>
      {error.retryable && onRetry && (
        <button onClick={onRetry}>Try Again</button>
      )}
    </div>
  );
}
```

## 6.2 Custom Hooks

### useOptimisticUpdates.ts

```typescript
export function useOptimisticMessages() {
  const [messages, setMessages] = useState<Message[]>([]);

  const addOptimisticMessage = useCallback((content: string) => {
    const userMessage = { id: `user-${Date.now()}`, role: 'user', content };
    const placeholder = { id: `assistant-${Date.now()}`, role: 'assistant', content: '', pending: true };

    setMessages(prev => [...prev, userMessage, placeholder]);
    return placeholder.id;
  }, []);

  const updateAssistantMessage = useCallback((id: string, content: string, done = false) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, content, pending: !done } : msg
    ));
  }, []);

  return { messages, addOptimisticMessage, updateAssistantMessage };
}
```

### useOfflineQueue.ts

```typescript
export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedRequest[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const stored = localStorage.getItem('regis_offline_queue');
    if (stored) setQueue(JSON.parse(stored));
  }, []);

  useEffect(() => {
    localStorage.setItem('regis_offline_queue', JSON.stringify(queue));
  }, [queue]);

  const enqueue = useCallback((prompt: string, model?: string) => {
    const request = { id: `q-${Date.now()}`, prompt, model, timestamp: Date.now(), retries: 0 };
    setQueue(prev => [...prev, request]);
    return request.id;
  }, []);

  const processQueue = useCallback(async (executor: Function) => {
    if (!isOnline || queue.length === 0) return;

    for (const request of queue) {
      try {
        await executor(request.prompt, request.model);
        setQueue(prev => prev.filter(r => r.id !== request.id));
      } catch (error) {
        // Increment retry count
      }
    }
  }, [isOnline, queue]);

  return { queue, isOnline, enqueue, processQueue };
}
```

## 6.3 Zustand Stores

### models-store.ts

```typescript
interface ModelsState {
  models: ModelInfo[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;

  fetchModels: () => Promise<void>;
  refreshModels: () => Promise<void>;
  getModelsByProvider: (provider: string) => ModelInfo[];
  prefetchModels: () => void;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchModels: async () => {
    if (get().isLoading) return;

    const cacheValid = get().lastFetched && Date.now() - get().lastFetched < 5 * 60 * 1000;
    if (cacheValid && get().models.length > 0) return;

    set({ isLoading: true, error: null });

    try {
      const response = await fetch('/api/models');
      const data = await response.json();
      set({ models: data.models, lastFetched: Date.now() });
    } catch (error) {
      set({ error: 'Failed to fetch models' });
    } finally {
      set({ isLoading: false });
    }
  },

  prefetchModels: () => {
    get().fetchModels();
    // Background refresh every 4 minutes
    setInterval(() => get().fetchModels(), 4 * 60 * 1000);
  },
}));
```

---

# 7. SYSTEM AUTORYZACJI

## 7.1 JWT Flow

```
1. POST /api/auth/login (username, password)
   → Set-Cookie: access_token (15min), refresh_token (7d)

2. GET /api/execute (with cookies)
   → Verify access_token
   → If expired: try refresh

3. POST /api/auth/refresh (with refresh_token cookie)
   → New access_token

4. POST /api/auth/logout
   → Clear all cookies
```

## 7.2 Implementacja (api/auth/auth-utils.ts)

```typescript
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';

export async function createAccessToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { userId: string };
  } catch {
    return null;
  }
}

export function buildAuthCookies(accessToken: string, refreshToken: string): string[] {
  return [
    `access_token=${accessToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900`,
    `refresh_token=${refreshToken}; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
  ];
}
```

---

# 8. INTEGRACJE AI

## 8.1 Wspierani providerzy

| Provider | Modele | Streaming | Koszt/1K tokens |
|----------|--------|-----------|-----------------|
| **Anthropic** | Claude 3 Opus, Sonnet, Haiku | ✅ | $0.015 |
| **OpenAI** | GPT-4 Turbo, GPT-4, GPT-3.5 | ✅ | $0.01 |
| **Google** | Gemini Pro, Ultra | ✅ | $0.0005 |
| **Mistral** | Large, Medium, Small | ✅ | $0.004 |
| **Groq** | Llama 3 70B, Mixtral | ✅ | $0.0007 |
| **Ollama** | llama3.2, qwen2.5-coder, phi3 | ✅ | $0 (local) |

## 8.2 Provider Call (api/providers.ts)

```typescript
export async function callProvider(
  provider: string,
  prompt: string,
  systemPrompt?: string,
  model?: string
): Promise<ProviderCallResult> {
  const startTime = Date.now();

  switch (provider) {
    case 'anthropic':
      return callAnthropic(prompt, systemPrompt, model);
    case 'openai':
      return callOpenAI(prompt, systemPrompt, model);
    case 'google':
      return callGoogle(prompt, systemPrompt, model);
    case 'mistral':
      return callMistral(prompt, systemPrompt, model);
    case 'groq':
      return callGroq(prompt, systemPrompt, model);
    case 'ollama':
      return callOllama(prompt, systemPrompt, model);
    default:
      throw new AppError(ErrorCode.INVALID_MODEL);
  }
}

async function callAnthropic(prompt: string, systemPrompt?: string, model = 'claude-3-sonnet-20240229') {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  return {
    content: data.content[0].text,
    tokens: data.usage.input_tokens + data.usage.output_tokens,
    model,
  };
}
```

## 8.3 Streaming Provider Call

```typescript
export async function callProviderStreaming(
  provider: string,
  input: StreamingProviderCallInput
): Promise<void> {
  switch (provider) {
    case 'anthropic':
      return callAnthropicStreaming(input);
    case 'openai':
      return callOpenAIStreaming(input);
    // ... other providers
  }
}

async function callAnthropicStreaming(input: StreamingProviderCallInput) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 4096,
      stream: true,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.prompt }],
    }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const data = JSON.parse(line.slice(6));
      if (data.type === 'content_block_delta') {
        input.onChunk(data.delta.text);
      }
    }
  }
}
```

---

# 9. SSE STREAMING

## 9.1 Architektura

```
┌─────────────┐     POST /api/stream      ┌─────────────┐
│   Client    │ ───────────────────────── │   Server    │
│             │                           │             │
│  streamPrompt()                         │  handler()  │
│             │ <── text/event-stream ─── │             │
│             │     data: {"chunk":"..."}│             │
│             │     data: {"done":true}  │             │
└─────────────┘                           └─────────────┘
```

## 9.2 Backend: api/stream.ts

### Konfiguracja

```typescript
export const config = {
  runtime: 'edge',
  maxDuration: 60,
};
```

### Główna funkcja

```typescript
export default async function handler(req: Request): Promise<Response> {
  // 1. Parsowanie body
  const { prompt, model, groundingEnabled } = await req.json();

  // 2. Rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rateResult = ipLimiter.check(ip);
  if (!rateResult.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limited' }), {
      status: 429,
      headers: buildRateLimitHeaders(rateResult),
    });
  }

  // 3. Grounding (jeśli włączone)
  let groundingResult: GroundingResult = { sources: [], groundingPerformed: false };
  if (groundingEnabled) {
    groundingResult = await performGrounding(prompt);
  }

  // 4. Tworzenie streamu
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await callProviderStreaming(provider, {
          prompt,
          model,
          systemPrompt: buildGroundingContext(groundingResult),
          onChunk: (chunk) => sendEvent({ chunk, done: false }),
        });

        sendEvent({
          done: true,
          model_used: model,
          sources: groundingResult.sources,
          grounding_performed: groundingResult.groundingPerformed,
        });
      } catch (error) {
        sendEvent({ error: (error as Error).message, done: true });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-ID': generateRequestId(),
    },
  });
}
```

## 9.3 Frontend: src/lib/stream-parser.ts

### Interfejsy

```typescript
interface SSEChunkEvent {
  chunk: string;
  done: false;
}

interface SSEDoneEvent {
  done: true;
  model_used: string;
  sources: GroundingSource[];
  grounding_performed: boolean;
}

interface SSEErrorEvent {
  error: string;
  done: true;
}

type SSEEvent = SSEChunkEvent | SSEDoneEvent | SSEErrorEvent;

interface StreamState {
  buffer: string;
  fullContent: string;
  isDone: boolean;
  modelUsed: string;
  sources: GroundingSource[];
  groundingPerformed: boolean;
  error: string | null;
}
```

### Parser

```typescript
export function parseSSE(line: string): SSEEvent | null {
  if (!line.startsWith('data: ')) return null;

  try {
    return JSON.parse(line.slice(6));
  } catch {
    return null;
  }
}

export function createStreamState(): StreamState {
  return {
    buffer: '',
    fullContent: '',
    isDone: false,
    modelUsed: '',
    sources: [],
    groundingPerformed: false,
    error: null,
  };
}

export function processSSEChunk(
  state: StreamState,
  chunk: string,
  onChunk?: (text: string) => void
): StreamState {
  const newState = { ...state };
  newState.buffer += chunk;

  const lines = newState.buffer.split('\n');
  newState.buffer = lines.pop() || '';

  for (const line of lines) {
    const event = parseSSE(line);
    if (!event) continue;

    if ('error' in event) {
      newState.error = event.error;
      newState.isDone = true;
    } else if (event.done) {
      newState.isDone = true;
      newState.modelUsed = event.model_used;
      newState.sources = event.sources;
      newState.groundingPerformed = event.grounding_performed;
    } else {
      newState.fullContent += event.chunk;
      onChunk?.(event.chunk);
    }
  }

  return newState;
}
```

## 9.4 Frontend: src/lib/api-client.ts

### Streaming z callback

```typescript
export async function executePromptStreaming(
  prompt: string,
  model?: string,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<StreamingResult> {
  const response = await fetch(STREAM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model, stream: true }),
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Stream failed: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let state = createStreamState();
  let streamActive = true;

  while (streamActive) {
    const { done, value } = await reader.read();

    if (done) {
      streamActive = false;
      continue;
    }

    const chunk = decoder.decode(value, { stream: true });
    state = processSSEChunk(state, chunk, onChunk);

    if (state.error) throw new Error(state.error);
    if (state.isDone) streamActive = false;
  }

  reader.releaseLock();

  return {
    content: state.fullContent,
    modelUsed: state.modelUsed,
    sources: state.sources,
    groundingPerformed: state.groundingPerformed,
  };
}
```

### Streaming z async generator

```typescript
export async function* streamPrompt(
  prompt: string,
  model?: string,
  signal?: AbortSignal
): AsyncGenerator<string, StreamState, undefined> {
  const response = await fetch(STREAM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model, stream: true }),
    credentials: 'include',
    signal,
  });

  const reader = response.body!.getReader();
  let state = createStreamState();

  for await (const chunk of iterateSSEStream(reader)) {
    const event = parseSSE(chunk);
    if (!event) continue;

    if ('chunk' in event && !event.done) {
      state.fullContent += event.chunk;
      yield event.chunk;
    } else if (event.done) {
      state.isDone = true;
      if ('model_used' in event) {
        state.modelUsed = event.model_used;
        state.sources = event.sources;
        state.groundingPerformed = event.grounding_performed;
      }
    }
  }

  return state;
}
```

---

# 10. CIRCUIT BREAKER

## 10.1 Koncepcja

Circuit Breaker to wzorzec odporności na błędy, który zapobiega kaskadowym awariom poprzez automatyczne odcinanie niedziałających serwisów.

```
CLOSED ──(failures >= threshold)──> OPEN
   ▲                                   │
   │                                   │ (timeout)
   │                                   ▼
   └───(successes >= threshold)─── HALF_OPEN
```

## 10.2 Stany

| Stan | Opis | Zachowanie |
|------|------|------------|
| **CLOSED** | Normalny | Przepuszcza requesty |
| **OPEN** | Awaria | Blokuje requesty, zwraca błąd |
| **HALF_OPEN** | Test | Przepuszcza 1 request testowy |

## 10.3 Implementacja: api/circuit-breaker.ts

### Interfejsy

```typescript
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;     // 3 failures → OPEN
  successThreshold: number;     // 2 successes → CLOSED
  timeout: number;              // 30s → HALF_OPEN
  volumeThreshold: number;      // Min requests before opening
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalRequests: number;
  totalFailures: number;
}
```

### Klasa CircuitBreaker

```typescript
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange = Date.now();
  private totalRequests = 0;
  private totalFailures = 0;

  constructor(
    private readonly id: string,
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 30000,
      volumeThreshold: 5,
    }
  ) {}

  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) return true;

    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - this.lastStateChange;
      if (elapsed >= this.config.timeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one request
    return true;
  }

  recordSuccess(): void {
    this.totalRequests++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failures = 0; // Reset on success
    }
  }

  recordFailure(): void {
    this.totalRequests++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      this.failures++;
      if (this.failures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    console.log(`Circuit ${this.id}: ${this.state} → ${newState}`);
    this.state = newState;
    this.lastStateChange = Date.now();
    this.failures = 0;
    this.successes = 0;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }
}
```

### Globalny rejestr

```typescript
export const providerCircuits = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(providerId: string, config?: CircuitBreakerConfig): CircuitBreaker {
  if (!providerCircuits.has(providerId)) {
    providerCircuits.set(providerId, new CircuitBreaker(providerId, config));
  }
  return providerCircuits.get(providerId)!;
}

export function getAllCircuitStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  for (const [id, circuit] of providerCircuits) {
    stats[id] = circuit.getStats();
  }
  return stats;
}
```

### Helper wrapper

```typescript
export async function executeWithCircuitBreaker<T>(
  providerId: string,
  fn: () => Promise<T>,
  config?: CircuitBreakerConfig
): Promise<T> {
  const circuit = getCircuitBreaker(providerId, config);

  if (!circuit.canExecute()) {
    throw new AppError(ErrorCode.PROVIDER_UNAVAILABLE, {
      provider: providerId,
      circuitState: circuit.getStats().state,
    });
  }

  try {
    const result = await fn();
    circuit.recordSuccess();
    return result;
  } catch (error) {
    circuit.recordFailure();
    throw error;
  }
}
```

## 10.4 Provider Health: api/provider-health.ts

### Interfejs

```typescript
export interface ProviderHealth {
  providerId: string;
  latency: number;           // Average latency (ms)
  successRate: number;       // 0-1
  healthScore: number;       // 0-1 (for sorting)
  requestCount: number;
  errorCount: number;
  lastUpdated: number;
  status: 'healthy' | 'degraded' | 'down';
}
```

### Implementacja

```typescript
const providerHealthMap = new Map<string, ProviderHealth>();
const ROLLING_WINDOW = 20; // Last 20 requests

export function updateProviderHealth(
  providerId: string,
  latency: number,
  success: boolean
): void {
  const existing = providerHealthMap.get(providerId) || createInitialHealth(providerId);

  // Update metrics with rolling average
  const newLatency = (existing.latency * (ROLLING_WINDOW - 1) + latency) / ROLLING_WINDOW;
  const newSuccessRate = success
    ? Math.min(1, existing.successRate + (1 - existing.successRate) / ROLLING_WINDOW)
    : Math.max(0, existing.successRate - existing.successRate / ROLLING_WINDOW);

  const circuit = providerCircuits.get(providerId);
  const statePenalty = circuit?.getStats().state === CircuitState.OPEN ? 0 : 1;

  const healthScore = newSuccessRate * (1000 / (newLatency + 100)) * statePenalty;

  providerHealthMap.set(providerId, {
    providerId,
    latency: newLatency,
    successRate: newSuccessRate,
    healthScore,
    requestCount: existing.requestCount + 1,
    errorCount: existing.errorCount + (success ? 0 : 1),
    lastUpdated: Date.now(),
    status: determineStatus(newSuccessRate, newLatency, circuit?.getStats().state),
  });
}

export function getProvidersByHealth(): string[] {
  return [...providerHealthMap.values()]
    .filter(h => h.status !== 'down')
    .sort((a, b) => b.healthScore - a.healthScore)
    .map(h => h.providerId);
}
```

---

# 11. CACHING

## 11.1 Architektura

```
Request → Cache Key (SHA-256) → Cache Check → Hit? → Return cached
                                    ↓ Miss
                              Provider Call → Cache Set → Return
```

## 11.2 LRU Cache: api/cache.ts

### Klasa LRUCache

```typescript
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 100, defaultTTL = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // LRU: move to end
    this.cache.delete(key);
    entry.hits++;
    this.cache.set(key, entry);
    this.hits++;

    return entry.value;
  }

  set(key: string, value: T, ttl = this.defaultTTL): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
      hits: 0,
    });
  }

  stats(): CacheStats {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits / (this.hits + this.misses) || 0,
    };
  }
}
```

### Instancje cache

```typescript
// Response cache: 100 entries, 5 min TTL
export const responseCache = new LRUCache<OutputPayload>(100, 5 * 60 * 1000);

// Search cache: 50 entries, 10 min TTL
export const searchCache = new LRUCache<GroundingSource[]>(50, 10 * 60 * 1000);

// Models cache: 10 entries, 5 min TTL
export const modelsCache = new LRUCache<ModelInfo[]>(10, 5 * 60 * 1000);
```

### Generowanie kluczy

```typescript
export async function generateCacheKey(
  prompt: string,
  model?: string,
  grounding?: boolean
): Promise<string> {
  const input = JSON.stringify({ prompt, model, grounding });
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sync version using FNV-1a
export function generateCacheKeySync(
  prompt: string,
  model?: string,
  grounding?: boolean
): string {
  const input = JSON.stringify({ prompt, model, grounding });
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16);
}
```

## 11.3 Request Deduplication: api/dedup.ts

```typescript
const pendingRequests = new Map<string, Promise<unknown>>();

export async function dedup<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Check if request already in flight
  const existing = pendingRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  // Create new request
  const promise = fn().finally(() => {
    pendingRequests.delete(key);
  });

  // Memory leak prevention: auto-cleanup after 60s
  setTimeout(() => {
    pendingRequests.delete(key);
  }, 60000);

  pendingRequests.set(key, promise);
  return promise;
}
```

## 11.4 Cache Admin: api/cache-admin.ts

```typescript
// GET /api/cache-admin - statistics
// DELETE /api/cache-admin?type=all - clear all
// DELETE /api/cache-admin?type=responses - clear responses only
// DELETE /api/cache-admin?model=claude-3 - invalidate by model

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.json(getAllCacheStats());
  }

  if (req.method === 'DELETE') {
    const { type, model, pattern } = req.query;

    if (type === 'all') {
      clearAllCaches();
    } else if (model) {
      invalidateByModel(model as string);
    } else if (pattern) {
      invalidateByPattern(new RegExp(pattern as string));
    }

    return res.json({ success: true, stats: getAllCacheStats() });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

---

# 12. RATE LIMITING

## 12.1 Algorytm Sliding Window

```
Window: 60 seconds
Limit: 20 requests

Time: |-------|-------|-------|-------|
Reqs:    3       5       8       4    = 20 (at limit)

New request at T+61:
- Remove requests older than T-59
- Check if count < limit
- If yes: add request, allow
- If no: deny, return retry-after
```

## 12.2 Implementacja: api/rate-limit.ts

### Klasa SlidingWindowRateLimiter

```typescript
export interface RateLimitConfig {
  windowMs: number;        // Window size in ms
  maxRequests: number;     // Max requests per window
  keyPrefix?: string;      // Key prefix for namespacing
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export class SlidingWindowRateLimiter {
  private timestamps = new Map<string, number[]>();
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
    const windowStart = now - this.config.windowMs;

    // Get timestamps and filter old ones
    let timestamps = this.timestamps.get(fullKey) || [];
    timestamps = timestamps.filter(t => t > windowStart);

    const count = timestamps.length;
    const remaining = Math.max(0, this.config.maxRequests - count);
    const resetTime = timestamps.length > 0
      ? timestamps[0] + this.config.windowMs
      : now + this.config.windowMs;

    if (count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      };
    }

    return { allowed: true, remaining, resetTime };
  }

  consume(key: string): RateLimitResult {
    const result = this.check(key);
    if (result.allowed) {
      const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
      const timestamps = this.timestamps.get(fullKey) || [];
      timestamps.push(Date.now());
      this.timestamps.set(fullKey, timestamps);
    }
    return result;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.timestamps) {
      const filtered = timestamps.filter(t => t > now - this.config.windowMs);
      if (filtered.length === 0) {
        this.timestamps.delete(key);
      } else {
        this.timestamps.set(key, filtered);
      }
    }
  }
}
```

### Instancje limiterów

```typescript
// 20 requests per minute per IP (anonymous)
export const ipLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'ip',
});

// 50 requests per minute per authenticated user
export const userLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 50,
  keyPrefix: 'user',
});

// 100 requests per minute per provider
export const providerLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyPrefix: 'provider',
});
```

### API Key Pool

```typescript
interface ApiKeyPool {
  keys: string[];
  currentIndex: number;
  failures: Map<string, number>;
}

const keyPools = new Map<string, ApiKeyPool>();

export function initializeKeyPool(provider: string): void {
  const envKey = `${provider.toUpperCase()}_API_KEYS`;
  const keys = process.env[envKey]?.split(',').filter(Boolean) || [];

  if (keys.length > 0) {
    keyPools.set(provider, {
      keys,
      currentIndex: 0,
      failures: new Map(),
    });
  }
}

export function getNextApiKey(provider: string): string | null {
  const pool = keyPools.get(provider);
  if (!pool || pool.keys.length === 0) return null;

  // Round-robin with failure skipping
  let attempts = 0;
  while (attempts < pool.keys.length) {
    const key = pool.keys[pool.currentIndex];
    pool.currentIndex = (pool.currentIndex + 1) % pool.keys.length;

    const failures = pool.failures.get(key) || 0;
    if (failures < 3) {
      return key;
    }
    attempts++;
  }

  // All keys have too many failures, reset and try first
  pool.failures.clear();
  return pool.keys[0];
}

export function reportKeyUsage(provider: string, key: string, success: boolean): void {
  const pool = keyPools.get(provider);
  if (!pool) return;

  if (success) {
    pool.failures.delete(key);
  } else {
    const failures = pool.failures.get(key) || 0;
    pool.failures.set(key, failures + 1);
  }
}
```

### RFC 6585 Headers

```typescript
export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'Retry-After'?: string;
}

export function buildRateLimitHeaders(result: RateLimitResult, limit: number): RateLimitHeaders {
  const headers: RateLimitHeaders = {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
  };

  if (result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }

  return headers;
}
```

---

# 13. METRICS & MONITORING

## 13.1 Metryki zbierane

| Metryka | Opis | Agregacja |
|---------|------|-----------|
| **Latency** | Czas odpowiedzi (ms) | P50, P95, P99 |
| **Tokens** | Zużyte tokeny | Sum per provider |
| **Cost** | Koszt ($) | Sum per provider, per hour |
| **Error Rate** | % błędów | Rolling 100 requests |
| **Requests/min** | Przepustowość | Time series |

## 13.2 Metrics Store: api/metrics.ts

### Interfejsy

```typescript
export interface RequestMetric {
  id: string;
  timestamp: number;
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  latency: number;
  success: boolean;
  errorType?: string;
  userId?: string;
}

export interface AggregatedMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  successRate: number;
  errorsByType: Record<string, number>;
  requestsByProvider: Record<string, number>;
  costByProvider: Record<string, number>;
  requestsPerMinute: number[];
}

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}
```

### Klasa MetricsStore

```typescript
class MetricsStore {
  private metrics: RequestMetric[] = [];
  private readonly maxMetrics = 10000;
  private readonly retentionMs = 24 * 60 * 60 * 1000; // 24 hours

  record(metric: Omit<RequestMetric, 'id' | 'timestamp'>): void {
    this.metrics.push({
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      ...metric,
    });

    // Cleanup old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.cleanup();
    }
  }

  getAggregated(since?: number): AggregatedMetrics {
    const cutoff = since || Date.now() - this.retentionMs;
    const filtered = this.metrics.filter(m => m.timestamp >= cutoff);

    const totalRequests = filtered.length;
    const totalTokens = filtered.reduce((sum, m) => sum + m.tokens, 0);
    const totalCost = filtered.reduce((sum, m) => sum + m.cost, 0);
    const successCount = filtered.filter(m => m.success).length;
    const totalLatency = filtered.reduce((sum, m) => sum + m.latency, 0);

    // Group by provider
    const byProvider = filtered.reduce((acc, m) => {
      acc.requests[m.provider] = (acc.requests[m.provider] || 0) + 1;
      acc.cost[m.provider] = (acc.cost[m.provider] || 0) + m.cost;
      return acc;
    }, { requests: {} as Record<string, number>, cost: {} as Record<string, number> });

    // Group errors by type
    const errorsByType = filtered
      .filter(m => !m.success && m.errorType)
      .reduce((acc, m) => {
        acc[m.errorType!] = (acc[m.errorType!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    // Requests per minute (last 60 minutes)
    const requestsPerMinute = this.getTimeBuckets(60, 60 * 1000);

    return {
      totalRequests,
      totalTokens,
      totalCost,
      averageLatency: totalRequests > 0 ? totalLatency / totalRequests : 0,
      successRate: totalRequests > 0 ? successCount / totalRequests : 1,
      errorsByType,
      requestsByProvider: byProvider.requests,
      costByProvider: byProvider.cost,
      requestsPerMinute,
    };
  }

  getLatencyPercentiles(): LatencyPercentiles {
    const latencies = this.metrics
      .filter(m => m.success)
      .map(m => m.latency)
      .sort((a, b) => a - b);

    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    return {
      p50: latencies[Math.floor(latencies.length * 0.5)],
      p95: latencies[Math.floor(latencies.length * 0.95)],
      p99: latencies[Math.floor(latencies.length * 0.99)],
    };
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.retentionMs;
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);

    // Keep only last maxMetrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }
}

export const metricsStore = new MetricsStore();
```

## 13.3 Alerts: api/alerts.ts

### Konfiguracja progów

```typescript
export interface AlertThresholds {
  costPerHour: { warning: number; critical: number };
  errorRate: { warning: number; critical: number };
  latency: { warning: number; critical: number };
  providerConsecutiveFailures: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  costPerHour: { warning: 10, critical: 20 },      // $10/$20 per hour
  errorRate: { warning: 0.1, critical: 0.25 },    // 10%/25%
  latency: { warning: 5000, critical: 10000 },    // 5s/10s
  providerConsecutiveFailures: 5,
};
```

### Alert system

```typescript
export interface Alert {
  id: string;
  type: 'cost' | 'error_rate' | 'latency' | 'provider_down';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
}

const activeAlerts = new Map<string, Alert>();
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export function checkAlerts(metrics: AggregatedMetrics, percentiles: LatencyPercentiles): Alert[] {
  const newAlerts: Alert[] = [];
  const now = Date.now();

  // Cost alert
  const hourlyRate = metrics.totalCost * (60 / metrics.requestsPerMinute.length || 60);
  if (hourlyRate >= DEFAULT_THRESHOLDS.costPerHour.critical) {
    maybeCreateAlert('cost-critical', 'cost', 'critical', hourlyRate, DEFAULT_THRESHOLDS.costPerHour.critical, newAlerts);
  } else if (hourlyRate >= DEFAULT_THRESHOLDS.costPerHour.warning) {
    maybeCreateAlert('cost-warning', 'cost', 'warning', hourlyRate, DEFAULT_THRESHOLDS.costPerHour.warning, newAlerts);
  }

  // Error rate alert
  const errorRate = 1 - metrics.successRate;
  if (errorRate >= DEFAULT_THRESHOLDS.errorRate.critical) {
    maybeCreateAlert('error-critical', 'error_rate', 'critical', errorRate, DEFAULT_THRESHOLDS.errorRate.critical, newAlerts);
  }

  // Latency alert
  if (percentiles.p95 >= DEFAULT_THRESHOLDS.latency.critical) {
    maybeCreateAlert('latency-critical', 'latency', 'critical', percentiles.p95, DEFAULT_THRESHOLDS.latency.critical, newAlerts);
  }

  return newAlerts;
}

export function getActiveAlerts(): Alert[] {
  return [...activeAlerts.values()]
    .filter(a => !a.acknowledged)
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'critical' ? -1 : 1;
      }
      return b.timestamp - a.timestamp;
    });
}
```

## 13.4 Dashboard: api/metrics-dashboard.ts

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const aggregated = metricsStore.getAggregated();
  const percentiles = metricsStore.getLatencyPercentiles();
  const providerBreakdown = metricsStore.getProviderLatencyBreakdown();
  const timeSeries = metricsStore.getTimeSeries(24);
  const recentErrors = metricsStore.getRecent(10).filter(m => !m.success);
  const activeAlerts = getActiveAlerts();

  return res.json({
    aggregated,
    percentiles,
    providerBreakdown,
    timeSeries,
    recentErrors,
    activeAlerts,
    generatedAt: new Date().toISOString(),
  });
}
```

---

# 14. LOGGING & AUDIT

## 14.1 Structured Logging: api/logger.ts

### Format logu

```json
{
  "timestamp": "2026-01-20T19:30:00.000Z",
  "requestId": "req_abc123",
  "correlationId": "cor_xyz789",
  "level": "info",
  "message": "Request completed",
  "context": {
    "statusCode": 200,
    "duration": 1234,
    "provider": "anthropic",
    "model": "claude-3-sonnet"
  }
}
```

### Logger factory

```typescript
export function createLogger(requestId: string, correlationId?: string) {
  const log = (level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) => {
    const entry = {
      timestamp: new Date().toISOString(),
      requestId,
      correlationId,
      level,
      message,
      context,
    };

    const output = JSON.stringify(entry);

    if (level === 'error') console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);

    return entry;
  };

  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),

    requestStart: (req: VercelRequest, ctx?: Record<string, unknown>) => {
      return log('info', 'Request started', {
        method: req.method,
        url: req.url,
        ip: extractClientIp(req),
        userAgent: req.headers['user-agent'],
        ...ctx,
      });
    },

    requestEnd: (statusCode: number, duration: number, ctx?: Record<string, unknown>) => {
      return log('info', 'Request completed', { statusCode, duration, ...ctx });
    },

    providerCall: (provider: string, model: string, ctx?: Record<string, unknown>) => {
      return log('info', 'Provider call', { provider, model, ...ctx });
    },

    providerError: (provider: string, error: Error, ctx?: Record<string, unknown>) => {
      return log('error', 'Provider error', {
        provider,
        error: { name: error.name, message: error.message, stack: error.stack },
        ...ctx,
      });
    },

    cacheHit: (cacheType: string, key: string) => {
      return log('debug', 'Cache hit', { cacheType, key: key.slice(0, 16) });
    },

    cacheMiss: (cacheType: string, key: string) => {
      return log('debug', 'Cache miss', { cacheType, key: key.slice(0, 16) });
    },

    rateLimit: (limitType: string, ip: string, retryAfter: number) => {
      return log('warn', 'Rate limit exceeded', { limitType, ip, retryAfter });
    },
  };
}
```

## 14.2 Audit Trail: api/audit.ts

### Auditable actions

```typescript
export type AuditAction =
  | 'prompt_execute'
  | 'model_change'
  | 'provider_switch'
  | 'cache_clear'
  | 'rate_limit_exceeded'
  | 'auth_attempt'
  | 'auth_failure'
  | 'api_key_rotation'
  | 'circuit_breaker_open'
  | 'settings_change';
```

### Audit entry

```typescript
export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  userId?: string;
  ip: string;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  requestId?: string;
  correlationId?: string;
}

const auditLog: AuditEntry[] = [];
const MAX_ENTRIES = 1000;

export function recordAudit(
  action: AuditAction,
  ip: string,
  details: Record<string, unknown>,
  success = true,
  userId?: string,
  errorMessage?: string
): AuditEntry {
  // Sanitize sensitive data
  const sanitized = sanitizeDetails(details);

  const entry: AuditEntry = {
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    action,
    userId,
    ip,
    details: sanitized,
    success,
    errorMessage,
  };

  auditLog.unshift(entry);

  if (auditLog.length > MAX_ENTRIES) {
    auditLog.pop();
  }

  console.log(JSON.stringify({ type: 'AUDIT', ...entry }));

  return entry;
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...details };
  const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'key'];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}
```

## 14.3 Log Viewer: api/logs.ts

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Admin authentication
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action, userId, ip, limit, stats } = req.query;

  if (stats === 'true') {
    return res.json(getAuditStats());
  }

  const logs = getAuditLog({
    action: action as AuditAction,
    userId: userId as string,
    ip: ip as string,
    limit: limit ? parseInt(limit as string, 10) : 100,
  });

  return res.json({ count: logs.length, logs });
}
```

---

# 15. GROUNDING SYSTEM

## 15.1 Architektura

```
Prompt → Smart Decision → Should Ground?
                              ↓ Yes
                         Search Providers
                         ├─ Google (primary)
                         ├─ Brave (fallback)
                         ├─ Serper (fallback)
                         └─ DuckDuckGo (fallback)
                              ↓
                         Filter & Score
                              ↓
                         Build Context
```

## 15.2 Smart Grounding Decision: api/grounding.ts

### Kiedy grounding jest potrzebny

```typescript
const GROUNDING_KEYWORDS = [
  // Time-sensitive
  'current', 'latest', 'recent', 'today', 'now', '2024', '2025', '2026',
  'news', 'update', 'price', 'stock', 'weather', 'score',
  // Questions
  'who is', 'what is', 'where is', 'when did', 'how to',
  // Facts
  'capital', 'population', 'president', 'ceo', 'founded',
];

export function shouldGround(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return GROUNDING_KEYWORDS.some(kw => lower.includes(kw));
}

export function makeSmartGroundingDecision(prompt: string): SmartGroundingDecision {
  const needs = shouldGround(prompt);
  const confidence = calculateConfidence(prompt);

  return {
    shouldGround: needs && confidence > 0.5,
    confidence,
    reason: needs ? 'Contains time-sensitive keywords' : 'No grounding keywords detected',
  };
}
```

### Wykonanie grounding

```typescript
export async function performGrounding(
  prompt: string,
  config: Partial<GroundingConfig> = {}
): Promise<GroundingResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return { sources: [], groundingPerformed: false };
  }

  const searchQuery = extractSearchQuery(prompt);
  let sources: GroundingSource[] = [];
  let usedProvider = '';
  let fallbackUsed = false;

  // Try providers in order
  for (const provider of SEARCH_PROVIDERS) {
    try {
      sources = await searchWithProvider(provider.name, searchQuery);
      usedProvider = provider.name;
      break;
    } catch (error) {
      console.warn(`Search provider ${provider.name} failed:`, error);
      if (finalConfig.fallbackEnabled) {
        fallbackUsed = true;
        continue;
      }
      break;
    }
  }

  // Filter and score sources
  sources = filterAndScoreSources(sources, finalConfig);
  const qualityScore = calculateQualityScore(sources, finalConfig);

  return {
    sources: sources.slice(0, finalConfig.maxSources),
    groundingPerformed: true,
    searchQuery,
    searchProvider: usedProvider,
    fallbackUsed,
    qualityScore,
  };
}
```

### Scoring źródeł

```typescript
function filterAndScoreSources(
  sources: GroundingSource[],
  config: GroundingConfig
): GroundingSource[] {
  return sources
    .filter(source => {
      const domain = new URL(source.link).hostname;
      // Filter blocked domains
      if (config.blockedDomains.some(bd => domain.includes(bd))) {
        return false;
      }
      return true;
    })
    .map(source => {
      const domain = new URL(source.link).hostname;
      let score = 0.5; // Base score

      // Boost preferred domains
      if (config.preferredDomains.some(pd => domain.includes(pd))) {
        score += 0.3;
      }

      // Boost authoritative sources
      const authoritative = ['wikipedia.org', 'mdn.mozilla.org', 'w3.org', 'docs.'];
      if (authoritative.some(a => domain.includes(a))) {
        score += 0.15;
      }

      // Boost if has good snippet
      if (source.snippet && source.snippet.length > 50) {
        score += 0.1;
      }

      return { ...source, relevanceScore: Math.min(1, score), domain };
    })
    .filter(s => (s.relevanceScore || 0) >= config.minRelevanceScore)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
}
```

## 15.3 Komponenty UI

### GroundingToggle.tsx

```tsx
export function GroundingToggle({ enabled, onChange }: GroundingToggleProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full
          transition-colors focus:ring-2 focus:ring-green-500
          ${enabled ? 'bg-green-600' : 'bg-gray-600'}
        `}
      >
        <span className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${enabled ? 'translate-x-6' : 'translate-x-1'}
        `} />
      </button>
      <span className="text-sm text-green-300/70">
        {t('grounding.label', 'Web Search')}
      </span>
    </div>
  );
}
```

### SourcesList.tsx

```tsx
export function SourcesList({ sources, qualityScore }: SourcesListProps) {
  const { t } = useTranslation();

  if (sources.length === 0) return null;

  return (
    <div className="mt-4 border-t border-green-500/20 pt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-green-400">
          {t('sources.title', 'Sources')} ({sources.length})
        </h4>
        {qualityScore !== undefined && (
          <QualityBadge score={qualityScore} />
        )}
      </div>
      <ul className="space-y-2">
        {sources.map((source, idx) => (
          <SourceItem key={idx} source={source} index={idx} />
        ))}
      </ul>
    </div>
  );
}
```

---

# 16. ERROR HANDLING

## 16.1 Kody błędów: api/errors.ts

```typescript
export enum ErrorCode {
  // Client errors (4xx)
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  INVALID_MODEL = 'INVALID_MODEL',
  INVALID_PROMPT = 'INVALID_PROMPT',

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  ALL_PROVIDERS_FAILED = 'ALL_PROVIDERS_FAILED',
  GROUNDING_FAILED = 'GROUNDING_FAILED',
  CACHE_ERROR = 'CACHE_ERROR',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Auth errors
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_INVALID = 'AUTH_INVALID',
}
```

## 16.2 Mapowanie błędów

```typescript
export const ERROR_MESSAGES: Record<ErrorCode, ErrorDef> = {
  [ErrorCode.BAD_REQUEST]: {
    message: 'Invalid request format',
    httpStatus: 400,
    retryable: false
  },
  [ErrorCode.RATE_LIMITED]: {
    message: 'Too many requests',
    httpStatus: 429,
    retryable: true
  },
  [ErrorCode.PROVIDER_UNAVAILABLE]: {
    message: 'AI provider temporarily unavailable',
    httpStatus: 503,
    retryable: true
  },
  [ErrorCode.ALL_PROVIDERS_FAILED]: {
    message: 'All AI providers are currently unavailable',
    httpStatus: 503,
    retryable: true
  },
  // ... other codes
};
```

## 16.3 Sugestie naprawy

```typescript
export function getRecoverySuggestions(error: ApiError): string[] {
  const suggestions: string[] = [];

  if (error.retryable) {
    suggestions.push('Try the request again');
  }

  switch (error.code) {
    case ErrorCode.RATE_LIMITED:
      suggestions.push(`Wait ${error.retryAfter || 60} seconds before retrying`);
      break;
    case ErrorCode.ALL_PROVIDERS_FAILED:
      suggestions.push('Check your internet connection');
      suggestions.push('Try selecting a specific model instead of Auto');
      break;
    case ErrorCode.AUTH_EXPIRED:
      suggestions.push('Refresh the page to continue');
      break;
    case ErrorCode.INVALID_PROMPT:
      suggestions.push('Enter a question or message to send');
      break;
    case ErrorCode.PAYLOAD_TOO_LARGE:
      suggestions.push('Shorten your message and try again');
      break;
  }

  return suggestions;
}
```

## 16.4 Client Error Handler: src/lib/error-handler.ts

```typescript
export function parseError(error: unknown): ParsedError {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      apiError: createApiError(ErrorCode.NETWORK_ERROR),
      isNetworkError: true,
      isAuthError: false,
      shouldShowToUser: true,
    };
  }

  // Timeout/abort
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      apiError: createApiError(ErrorCode.TIMEOUT),
      isNetworkError: true,
      isAuthError: false,
      shouldShowToUser: false,
    };
  }

  // API errors
  if (isApiError(error)) {
    const isAuth = [ErrorCode.UNAUTHORIZED, ErrorCode.AUTH_EXPIRED].includes(error.code);
    return {
      apiError: error,
      isNetworkError: false,
      isAuthError: isAuth,
      shouldShowToUser: true,
    };
  }

  // Unknown
  return {
    apiError: createApiError(ErrorCode.INTERNAL_ERROR, {}, (error as Error).message),
    isNetworkError: false,
    isAuthError: false,
    shouldShowToUser: true,
  };
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const parsed = parseError(error);

      if (!parsed.apiError.retryable) throw error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
```

---

# 17. PROVIDER MANAGEMENT

## 17.1 Konfiguracja providerów: api/provider-config.ts

```typescript
export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  models: string[];
  costPer1kTokens: number;
  maxTokens: number;
  supportsStreaming: boolean;
  abTestGroup?: 'A' | 'B' | 'control';
  customSystemPrompt?: string;
  rateLimitPerMinute: number;
}

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    enabled: true,
    priority: 1,
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    costPer1kTokens: 0.015,
    maxTokens: 200000,
    supportsStreaming: true,
    rateLimitPerMinute: 60,
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    enabled: true,
    priority: 2,
    models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    costPer1kTokens: 0.01,
    maxTokens: 128000,
    supportsStreaming: true,
    rateLimitPerMinute: 60,
  },
  // ... other providers
];
```

## 17.2 Admin API: api/provider-admin.ts

```typescript
// GET /api/provider-admin - list all providers
// PUT /api/provider-admin - update provider config
// POST /api/provider-admin - actions (reorder, reset, set-ab-test)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.json({ providers: getProviderConfigs() });
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body;
    const updated = updateProviderConfig(id, updates);
    return res.json({ provider: updated });
  }

  if (req.method === 'POST') {
    const { action, id, priority } = req.body;

    if (action === 'reorder') {
      setProviderPriority(id, priority);
    } else if (action === 'reset') {
      resetToDefaults();
    }

    return res.json({ providers: getProviderConfigs() });
  }
}
```

## 17.3 UI Component: src/components/ProviderManager.tsx

```tsx
export function ProviderManager() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});

  useEffect(() => {
    fetchProviders();
    fetchStatuses();

    // Auto-refresh statuses every 30s
    const interval = setInterval(fetchStatuses, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-black/30 backdrop-blur-sm rounded-lg p-4">
      <h3 className="text-lg font-medium text-green-400 mb-4">
        AI Providers
      </h3>

      <div className="space-y-3">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            status={statuses[provider.id]}
            onToggle={(enabled) => toggleProvider(provider.id, enabled)}
            onPriorityChange={(dir) => movePriority(provider.id, dir)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

# 18. UX IMPROVEMENTS

## 18.1 Optimistic Updates

```tsx
const { messages, addOptimisticMessage, updateAssistantMessage } = useOptimisticMessages();

const handleSubmit = async (prompt: string) => {
  // Immediately show user message and placeholder
  const assistantId = addOptimisticMessage(prompt);

  try {
    await executePromptStreaming(prompt, model, (chunk) => {
      // Update placeholder progressively
      updateAssistantMessage(assistantId, chunk, false);
    });
    updateAssistantMessage(assistantId, '', true);
  } catch (error) {
    markError(assistantId);
  }
};
```

## 18.2 Offline Queue

```tsx
const { queue, isOnline, enqueue, processQueue } = useOfflineQueue();

const handleSubmit = async (prompt: string) => {
  if (!isOnline) {
    // Queue for later
    enqueue(prompt, model);
    showToast('Message queued for when you\'re back online');
    return;
  }

  // Process normally
  await sendMessage(prompt);
};

// When coming back online
useEffect(() => {
  if (isOnline && queue.length > 0) {
    processQueue(sendMessage);
  }
}, [isOnline]);
```

## 18.3 Progress Indicator

```tsx
export function ProgressIndicator({ isStreaming, tokensReceived, estimatedTokens = 500 }) {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => setDots(d => d >= 3 ? 1 : d + 1), 400);
    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!isStreaming) return null;

  const progress = Math.min(100, (tokensReceived / estimatedTokens) * 100);

  return (
    <div className="flex items-center gap-3 text-green-400/70">
      <span className="font-mono">{'▹'.repeat(dots)}{'▸'.repeat(3 - dots)}</span>
      <div className="flex-1 h-1.5 bg-green-500/10 rounded-full">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      {tokensReceived > 0 && (
        <span className="text-xs">{tokensReceived} tokens</span>
      )}
    </div>
  );
}
```

## 18.4 Feedback Button

```tsx
export function FeedbackButton({ messageId, onFeedback }) {
  const [submitted, setSubmitted] = useState(false);
  const [showComment, setShowComment] = useState(false);

  const handleRating = (rating: 'positive' | 'negative') => {
    if (rating === 'negative') {
      setShowComment(true);
    } else {
      onFeedback(messageId, rating);
      setSubmitted(true);
    }
  };

  if (submitted) return <span className="text-xs text-green-500/50">Thanks! ✓</span>;

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => handleRating('positive')}>👍</button>
      <button onClick={() => handleRating('negative')}>👎</button>
      {showComment && (
        <CommentInput onSubmit={(comment) => {
          onFeedback(messageId, 'negative', comment);
          setSubmitted(true);
        }} />
      )}
    </div>
  );
}
```

## 18.5 Offline Indicator

```tsx
export function OfflineIndicator({ isOnline, queueLength, onSync }) {
  if (isOnline && queueLength === 0) return null;

  return (
    <div className={`fixed bottom-4 right-4 p-3 rounded-lg ${
      isOnline ? 'bg-green-500/20' : 'bg-yellow-500/20'
    }`}>
      <span>{isOnline ? '🔄' : '📴'}</span>
      <span>{isOnline ? 'Syncing...' : 'You\'re offline'}</span>
      {queueLength > 0 && <span>{queueLength} messages queued</span>}
      {isOnline && queueLength > 0 && (
        <button onClick={onSync}>Sync now</button>
      )}
    </div>
  );
}
```

---

# 19. LOKALIZACJA (i18n)

## 19.1 Konfiguracja

```typescript
// src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import pl from './locales/pl.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pl: { translation: pl } },
  lng: localStorage.getItem('language') || 'pl',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
```

## 19.2 Struktura tłumaczeń

```json
// src/i18n/locales/pl.json
{
  "app": {
    "title": "Regis Matrix Lab",
    "subtitle": "Asystent badawczy AI"
  },
  "chat": {
    "placeholder": "Wpisz pytanie do Regis...",
    "send": "Wyślij",
    "clear": "Wyczyść czat"
  },
  "grounding": {
    "label": "Wyszukiwanie",
    "enabled": "Włączone",
    "disabled": "Wyłączone"
  },
  "sources": {
    "title": "Źródła",
    "quality": "Jakość",
    "high": "Wysoka",
    "medium": "Średnia",
    "low": "Niska"
  },
  "errors": {
    "RATE_LIMITED": {
      "title": "Zbyt wiele żądań",
      "message": "Poczekaj chwilę przed ponowną próbą"
    },
    "ALL_PROVIDERS_FAILED": {
      "title": "Usługa niedostępna",
      "message": "Wszyscy dostawcy AI są obecnie niedostępni"
    }
  },
  "feedback": {
    "thanks": "Dziękujemy!",
    "helpful": "Pomocne",
    "notHelpful": "Niepomocne",
    "whatWrong": "Co poszło nie tak?"
  },
  "offline": {
    "offline": "Jesteś offline",
    "queued": "{{count}} wiadomości w kolejce",
    "syncing": "Synchronizuję...",
    "syncNow": "Synchronizuj teraz"
  },
  "common": {
    "retry": "Ponów",
    "dismiss": "Zamknij",
    "loading": "Ładowanie...",
    "send": "Wyślij"
  }
}
```

---

# 20. STORAGE I SZYFROWANIE

## 20.1 IndexedDB + AES-256-GCM

```typescript
// src/lib/storage.ts
const DB_NAME = 'regis-matrix';
const STORE_NAME = 'backups';

async function getEncryptionKey(): Promise<CryptoKey> {
  // Check IndexedDB for existing key
  let key = await loadKeyFromIndexedDB();

  if (!key) {
    // Generate new non-extractable key
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt']
    );
    await saveKeyToIndexedDB(key);
  }

  return key;
}

export async function saveBackup(messages: Message[]): Promise<void> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const data = new TextEncoder().encode(JSON.stringify(messages));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  await saveToIndexedDB({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
    timestamp: Date.now(),
  });
}

export async function loadLatestBackup(): Promise<Message[] | null> {
  const backup = await getLatestFromIndexedDB();
  if (!backup) return null;

  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(backup.iv) },
    key,
    new Uint8Array(backup.data)
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}
```

## 20.2 Backup Rotation

```typescript
const MAX_BACKUPS = 10;

async function rotateBackups(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const count = await store.count();
  if (count <= MAX_BACKUPS) return;

  // Delete oldest
  const cursor = await store.openCursor();
  let deleted = 0;
  const toDelete = count - MAX_BACKUPS;

  while (cursor && deleted < toDelete) {
    await cursor.delete();
    deleted++;
    await cursor.continue();
  }
}
```

---

# 21. TESTOWANIE

## 21.1 Konfiguracja Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/unit/setup/vitest-setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

## 21.2 Konfiguracja Playwright

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 30000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 0.0.0.0 --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

## 21.3 Przykładowe testy

### Unit test

```typescript
// tests/unit/lib/api-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executePrompt } from '@/lib/api-client';

describe('api-client', () => {
  it('sends POST request with correct payload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, response: 'Hello' }),
    } as Response);

    const result = await executePrompt('test prompt', 'claude-3');

    expect(fetch).toHaveBeenCalledWith('/api/execute', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('test prompt'),
    }));
    expect(result.response).toBe('Hello');
  });
});
```

### E2E test

```typescript
// tests/chat.spec.ts
import { expect, test } from '@playwright/test';

test.describe('Chat functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays welcome message', async ({ page }) => {
    await expect(page.getByText(/witaj|welcome/i)).toBeVisible();
  });

  test('submit enables after typing', async ({ page }) => {
    const input = page.getByPlaceholder('Wpisz pytanie do Regis...');
    await input.fill('Test prompt');

    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeEnabled();
  });
});
```

## 21.4 Uruchamianie testów

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Coverage
pnpm test --coverage

# Watch mode
pnpm test --watch
```

---

# 22. DEPLOYMENT

## 22.1 Vercel CLI

```bash
# Install
npm i -g vercel

# Preview deployment
vercel

# Production deployment
vercel --prod
```

## 22.2 Environment Variables

Wymagane w Vercel Dashboard:

| Variable | Opis |
|----------|------|
| `JWT_SECRET` | Klucz do podpisywania JWT |
| `ANTHROPIC_API_KEY` | Klucz API Anthropic |
| `OPENAI_API_KEY` | Klucz API OpenAI |
| `GOOGLE_API_KEY` | Klucz API Google |
| `MISTRAL_API_KEY` | Klucz API Mistral |
| `GROQ_API_KEY` | Klucz API Groq |
| `GOOGLE_SEARCH_API_KEY` | Klucz Google Custom Search |
| `GOOGLE_SEARCH_CX` | ID wyszukiwarki Google |
| `BRAVE_API_KEY` | Klucz Brave Search (opcjonalny) |
| `ADMIN_API_KEY` | Klucz do admin endpoints |

## 22.3 Build output

```
dist/
├── index.html
├── manifest.webmanifest
├── sw.js
├── workbox-*.js
└── assets/
    ├── index-[hash].js      (~740 KB)
    ├── index-[hash].css     (~28 KB)
    ├── vendor-[hash].js     (~12 KB)
    ├── animations-[hash].js (~115 KB)
    ├── en-[hash].js
    └── pl-[hash].js
```

---

# 23. API REFERENCE

## 23.1 Endpoints

| Method | Endpoint | Opis |
|--------|----------|------|
| POST | `/api/execute` | Wykonanie prompta (non-streaming) |
| POST | `/api/stream` | Wykonanie prompta (SSE streaming) |
| GET | `/api/models` | Lista dostępnych modeli |
| GET | `/api/health` | Status systemu i providerów |
| GET | `/api/metrics-dashboard` | Dashboard metryk |
| GET | `/api/logs` | Audit logi (admin) |
| GET/PUT/POST | `/api/provider-admin` | Zarządzanie providerami |
| GET/DELETE | `/api/cache-admin` | Zarządzanie cache |
| POST | `/api/auth/login` | Logowanie |
| POST | `/api/auth/logout` | Wylogowanie |
| POST | `/api/auth/refresh` | Odświeżenie tokenu |

## 23.2 POST /api/execute

**Request:**
```json
{
  "prompt": "Explain quantum computing",
  "model": "claude-3-sonnet",
  "groundingEnabled": true,
  "skipCache": false
}
```

**Response:**
```json
{
  "success": true,
  "response": "Quantum computing is...",
  "sources": [
    { "title": "Wikipedia", "link": "https://...", "relevanceScore": 0.85 }
  ],
  "model_used": "claude-3-sonnet-20240229",
  "grounding_performed": true,
  "grounding_metadata": {
    "qualityScore": 0.78,
    "searchProvider": "google",
    "fallbackUsed": false
  },
  "cached": false,
  "rate_limit": {
    "remaining": 19,
    "resetTime": 1705776000
  }
}
```

## 23.3 POST /api/stream

**Request:** Same as /api/execute

**Response:** SSE stream
```
data: {"chunk":"Quantum ","done":false}

data: {"chunk":"computing ","done":false}

data: {"chunk":"is...","done":false}

data: {"done":true,"model_used":"claude-3-sonnet","sources":[],"grounding_performed":false}

```

## 23.4 GET /api/health

**Response:**
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "timestamp": "2026-01-20T19:30:00.000Z",
  "summary": {
    "healthy": 5,
    "degraded": 1,
    "down": 0
  },
  "providers": [
    {
      "id": "anthropic",
      "status": "healthy",
      "circuit": {
        "state": "CLOSED",
        "failures": 0
      },
      "health": {
        "latency": 1234,
        "successRate": 0.98,
        "healthScore": 0.95
      }
    }
  ]
}
```

---

# 24. ZMIENNE ŚRODOWISKOWE

## 24.1 Wymagane

```env
# JWT
JWT_SECRET=your-secret-key-min-32-chars

# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Search
GOOGLE_SEARCH_API_KEY=AIza...
GOOGLE_SEARCH_CX=...
```

## 24.2 Opcjonalne

```env
# Additional AI Providers
GOOGLE_API_KEY=AIza...
MISTRAL_API_KEY=...
GROQ_API_KEY=...

# Multiple API Keys (rotation)
ANTHROPIC_API_KEYS=key1,key2,key3
OPENAI_API_KEYS=key1,key2

# Fallback Search
BRAVE_API_KEY=...
SERPER_API_KEY=...

# Admin
ADMIN_API_KEY=admin-secret-key

# Feature Flags
ENABLE_GROUNDING=true
ENABLE_STREAMING=true
ENABLE_METRICS=true
```

---

# 25. SKRÓTY KLAWIATUROWE

| Skrót | Akcja |
|-------|-------|
| `Ctrl+K` | Focus na pole wprowadzania |
| `Ctrl+L` | Wyczyść czat |
| `Ctrl+Z` | Cofnij ostatnią wiadomość |
| `Ctrl+Y` | Ponów cofniętą wiadomość |
| `Ctrl+Enter` | Wyślij wiadomość |
| `Escape` | Anuluj streaming |
| `Ctrl+Shift+D` | Przełącz dark/light mode |

---

# CHANGELOG

## v2.0.0 (2026-01-20)

### Dodane
- SSE Streaming z progressive UI
- Circuit Breaker dla providerów
- LRU Cache z TTL i deduplikacją
- Sliding window rate limiting
- Metrics dashboard z percentylami
- Structured logging z request ID
- Multi-provider grounding z fallback
- 20 kodów błędów z recovery suggestions
- Provider management UI
- Optimistic updates i offline queue
- Progress indicators dla streaming
- Feedback buttons
- Offline indicator

### Zmienione
- Upgrade vite 5.x → 7.3.1
- Upgrade openapi-typescript 6.x → 7.10.1
- Rozszerzony /api/health endpoint
- Ulepszony system grounding

### Naprawione
- Wszystkie security vulnerabilities (npm audit: 0)
- ESLint errors

---

**Autor dokumentacji:** Claude Opus 4.5
**Data:** 2026-01-20
**Wersja dokumentacji:** 2.0.0
