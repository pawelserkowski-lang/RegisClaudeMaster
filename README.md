# Regis Claude Master

> AI-Powered Research Assistant with Vercel Edge Functions and React Frontend

[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://vercel.com)
[![Edge](https://img.shields.io/badge/Vercel-Edge-black?logo=vercel)](https://vercel.com)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?logo=typescript)](https://www.typescriptlang.org/)

## Overview

Regis Claude Master is a full-stack AI research assistant that combines:

- **Vercel Edge Functions Backend** - Low-latency API runtime with provider fallbacks
- **React Frontend** - Modern UI with Framer Motion animations
- **Web Grounding** - Google Custom Search for context-aware responses
- **Multi-Model Support** - Anthropic → OpenAI → Google → Mistral → Groq → Ollama
- **Offline Support** - Service Worker + AES-256 encrypted IndexedDB backups
- **Internationalization** - i18next with lazy-loaded locales

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel Platform                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   Static Site   │    │   Serverless Function       │ │
│  │   (React/Vite)  │    │   (Edge/TypeScript)         │ │
│  │                 │    │                             │ │
│  │  src/App.tsx    │───▶│  /api/execute               │ │
│  │  src/components │    │                             │ │
│  │  dist/          │    │  1. Grounding (Google CSE)  │ │
│  └─────────────────┘    │  2. Provider Fallback       │ │
│                         │  3. Response Generation     │ │
│                         └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │  Google  │       │  Gemini  │       │  Ollama  │
    │ Search   │       │  API     │       │ (Tunnel) │
    └──────────┘       └──────────┘       └──────────┘
```

## Features

| Feature | Description |
|---------|-------------|
| **Web Grounding** | Automatic context from Google Custom Search |
| **Smart Routing** | Code tasks → Ollama, General → Gemini |
| **Matrix Theme** | Glassmorphism UI with green accent |
| **Research Status** | Visual indicator during grounding phase |
| **Code Highlighting** | Markdown rendering with syntax highlighting |
| **Source Attribution** | Links to search results used |
| **Health Dashboard** | Provider status + token/cost counters |
| **JWT Auth** | httpOnly cookies with refresh tokens |

## Tech Stack

### Backend (`api/`)
- **TypeScript** - Edge runtime
- **Vercel Edge Functions** - Low latency execution
- **jose** - JWT signing/verification

### Frontend (`src/`)
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **TanStack Query** - Server state
- **Zustand** - Shared state (reserved for global needs)
- **React Hook Form + Zod** - Forms and validation
- **i18next** - Localization
- **Lucide React** - Icons

## Project Structure

```
RegisClaudeMaster/
├── api/                    # Edge functions
│   ├── execute.ts          # Main request handler
│   ├── health.ts           # Health dashboard
│   ├── models.ts           # Model listing
│   └── auth/               # JWT auth endpoints
├── src/                    # React frontend
│   ├── components/
│   │   ├── ChatInterface.tsx
│   │   └── ResearchStatus.tsx
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── storage.ts
│   │   └── utils.ts
│   ├── styles/
│   │   └── globals.css
│   ├── App.tsx
│   └── main.tsx
├── public/
│   └── favicon.svg
├── vercel.json             # Vercel configuration
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Deployment

### Prerequisites

1. [Vercel Account](https://vercel.com)
2. [Google Cloud Project](https://console.cloud.google.com) with:
   - Custom Search API enabled
   - Programmable Search Engine created
3. (Optional) Cloudflare Tunnel for Ollama

### Environment Variables

Set these in Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes | Google Cloud API key |
| `GOOGLE_SEARCH_CX` | Yes | Custom Search Engine ID |
| `CLOUDFLARE_TUNNEL_URL` | No | Ollama tunnel URL |
| `INTERNAL_AUTH_KEY` | No | API authentication key |
| `JWT_SECRET` | Yes | JWT signing secret |
| `ALLOWED_ORIGINS` | Yes | Comma-separated allowed origins |
| `ANTHROPIC_API_KEY` | No | Anthropic API key |
| `OPENAI_API_KEY` | No | OpenAI API key |
| `MISTRAL_API_KEY` | No | Mistral API key |
| `GROQ_API_KEY` | No | Groq API key |

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deploy
vercel --prod
```

Or use the Vercel Dashboard:
1. Import from GitHub
2. Framework: Vite
3. Build Command: `npm run build`
4. Output Directory: `dist`

### Environments

- **dev**: local development
- **preview**: Vercel preview deployments
- **prod**: main branch

## Local Development

### Frontend

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

### Backend (Edge Functions)

For local development, use Vercel CLI:

```bash
# Install Vercel CLI
pnpm add -g vercel

# Run locally with Vercel runtime
vercel dev
```

### Testy end-to-end (Playwright)

```bash
# Run Playwright tests
pnpm test:e2e
```

## API Reference

OpenAPI spec is available in `openapi.yaml` and can generate TypeScript types:

```bash
pnpm generate:api
```

### POST /api/execute

Execute a prompt with web grounding.

**Request:**
```json
{
  "prompt": "Explain quantum computing",
  "model": "auto"
}
```

**Headers:**
- `Content-Type: application/json`
- `x-api-key: <your-key>` (if configured)

**Response:**
```json
{
  "success": true,
  "response": "Quantum computing is...",
  "sources": [
    {
      "title": "Wikipedia",
      "link": "https://...",
      "snippet": "..."
    }
  ],
  "model_used": "gemini-2.0-flash",
  "grounding_performed": true
}
```

### GET /api/models

Returns the list of available models based on configured provider keys.

### GET /api/health

Returns provider status with token/cost counters.

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with Edge Functions + React on Vercel | Powered by multi-model AI
