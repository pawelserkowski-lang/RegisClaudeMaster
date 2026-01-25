# Regis Claude Master

> **"Precision, Elegance, Intelligence."**

![Version](https://img.shields.io/badge/version-1.0.0-emerald)
![Stack](https://img.shields.io/badge/stack-React_19_+_Node_25_+_Edge-blue)
![License](https://img.shields.io/badge/license-MIT-green)

**Regis Claude Master** is the pinnacle of AI Research Assistants. Orchestrated by the "Regis" architecture, it combines the low-latency of Edge Functions with the raw power of Node.js 25 for development.

## 🌟 Key Features

- **Hybrid Runtime:**
  - **Dev:** Custom Node.js 25 Server (Bypassing Vercel CLI constraints).
  - **Prod:** Vercel Edge Functions (Global low-latency).
- **Multi-Model Orchestration:** Anthropic, OpenAI, Google, Mistral, Groq, and Ollama (Local).
- **Secure by Default:** AES-256-GCM encrypted local storage for chat history with non-extractable keys.
- **Web Grounding:** Real-time Google Search integration for factual accuracy.
- **Matrix Glass UI:** A stunning, responsive interface built with React 19 and TailwindCSS.
- **Offline Support:** Service Worker caching + IndexedDB backups with auto-pruning.
- **Metrics Dashboard:** Real-time health monitoring, cost tracking, and latency percentiles.

## 🛠️ Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a deep dive.

## 📚 Documentation Quick Reference

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, project structure, security model |
| [CLAUDE.md](CLAUDE.md) | AI assistant persona and development workflow |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines and code standards |

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ (Node 25 recommended for Dev)
- pnpm

### Installation

```bash
git clone https://github.com/your-repo/RegisClaudeMaster.git
cd RegisClaudeMaster
pnpm install
```

### Configuration
Copy `.env.example` to `.env` and fill in your API keys.

### Running (The Regis Way)

We recommend using the custom Node.js 25 server for the best development experience:

```bash
pnpm dev:node25
```
Or use the provided batch script: `start-regis-node25.bat`

## 🧪 Testing

```bash
pnpm test          # Unit Tests (Vitest)
pnpm test:e2e      # End-to-End (Playwright)
```

## 🤝 Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) to understand the standards of the "Regis" code.

---
*Maintained by the ClaudeCLI Team.*
