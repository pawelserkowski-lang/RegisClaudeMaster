# ARCHITECTURE

## High-level Flow

1. **UI (React + Vite)** collects the prompt via React Hook Form + Zod.
2. The client sends `POST /api/execute` with `{ prompt, model }`.
3. The Edge Function:
   - validates JWT (httpOnly cookies) or internal API key,
   - performs grounding with Google Custom Search,
   - routes to providers in fallback order:
     **Anthropic → OpenAI → Google → Mistral → Groq → Ollama**,
   - records token + cost metrics.
4. The client renders:
   - messages + sources,
   - health dashboard,
   - localized UI (i18next).

## Key Modules

### Frontend
- `src/App.tsx` – main UI and state orchestration.
- `src/components/ChatInterface.tsx` – Markdown rendering and sources.
- `src/lib/api-client.ts` – retry + refresh session.
- `src/lib/storage.ts` – AES-256 backups to IndexedDB.

### Backend (Edge Functions)
- `api/execute.ts` – main handler with fallback routing.
- `api/models.ts` – list models based on available provider keys.
- `api/health.ts` – provider status, token + cost counters.
- `api/auth/*` – JWT login/refresh/logout.
- `api/providers.ts` – provider integrations.

## Security & Auth

- JWT stored in **httpOnly cookies**.
- Refresh tokens issued automatically by `/api/auth/refresh`.
- Client retries after 401; on failure, user is logged out.
- All secrets are provided via environment variables only.

## Offline & Backup

- Service Worker caches static assets.
- Messages are backed up every 5 minutes to IndexedDB.
- Backups are AES-256-GCM encrypted, with crypto operations logged.

## Observability

- Structured JSON logs in production via `api/logger.ts`.
- Health dashboard uses `/api/health`.
