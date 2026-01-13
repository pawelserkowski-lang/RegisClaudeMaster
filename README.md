# Regis Claude Master

> AI-Powered Research Assistant with Rust Backend and React Frontend

[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://vercel.com)
[![Rust](https://img.shields.io/badge/Rust-Serverless-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?logo=typescript)](https://www.typescriptlang.org/)

## Overview

Regis Claude Master is a full-stack AI research assistant that combines:

- **Rust Serverless Backend** - High-performance API running on Vercel Edge
- **React Frontend** - Modern UI with Framer Motion animations
- **Web Grounding** - Google Custom Search for context-aware responses
- **Multi-Model Support** - Ollama (via Cloudflare Tunnel) and Gemini API

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel Platform                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   Static Site   │    │   Serverless Function       │ │
│  │   (React/Vite)  │    │   (Rust/handler.rs)         │ │
│  │                 │    │                             │ │
│  │  src/App.tsx    │───▶│  /api/execute               │ │
│  │  src/components │    │                             │ │
│  │  dist/          │    │  1. Grounding (Google CSE)  │ │
│  └─────────────────┘    │  2. Model Selection         │ │
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
| **Witcher Theme** | Dark mode UI with silver/amber accents |
| **Research Status** | Visual indicator during grounding phase |
| **Code Highlighting** | Syntax-aware code block rendering |
| **Source Attribution** | Links to search results used |

## Tech Stack

### Backend (`api/`)
- **Rust** - Serverless function
- **vercel_runtime** - Vercel Rust runtime
- **reqwest** - HTTP client
- **serde** - JSON serialization
- **tokio** - Async runtime

### Frontend (`src/`)
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Zustand** - State management
- **Lucide React** - Icons

## Project Structure

```
RegisClaudeMaster/
├── api/                    # Rust serverless function
│   ├── Cargo.toml          # Rust dependencies
│   └── handler.rs          # Main entry point
├── src/                    # React frontend
│   ├── components/
│   │   ├── ChatInterface.tsx
│   │   └── ResearchStatus.tsx
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── useChat.ts
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
| `VITE_API_KEY` | No | Frontend API key |

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

## Local Development

### Frontend

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

### Backend (mock)

For local development, the Rust function won't run directly. Use Vercel CLI:

```bash
# Install Vercel CLI
npm i -g vercel

# Run locally with Vercel runtime
vercel dev
```

## API Reference

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
  "model_used": "gemini-1.5-flash",
  "grounding_performed": true
}
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with Rust + React on Vercel | Powered by Claude AI
