# Quantum Experiment Studio

Build, run, and analyse quantum circuits in your browser.

## Prerequisites

- **Node.js** ≥ 20 and **npm** ≥ 10
- **PostgreSQL** ≥ 15 (for authentication and session storage)

## Getting Started

```bash
# 1. Clone the repository
git clone <repo-url> && cd quantum-experiment-studio

# 2. Install dependencies (uses npm workspaces)
npm install

# 3. Copy the environment template and edit as needed
cp .env.example .env

# 4. Start both client and server in development mode
npm run dev
```

| Service | URL |
|---------|-----|
| Client (Vite) | http://localhost:5173 |
| Server (API) | http://localhost:3001 |

The Vite dev server proxies `/api` requests to the backend automatically.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start client and server concurrently |
| `npm run dev:client` | Start only the Vite dev server |
| `npm run dev:server` | Start only the Express API (with hot-reload) |
| `npm run build` | Production build for both packages |
| `npm run lint` | Run ESLint across the project |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm test` | Run server tests |
| `npm run clean` | Remove build artifacts and caches |

## Project Structure

```
├── client/          React + TypeScript SPA (Vite)
│   └── src/
├── server/          Node.js + TypeScript API (Express)
│   └── src/
├── .env.example     Environment variable template
├── eslint.config.mjs Shared ESLint configuration
├── tsconfig.base.json  Shared TypeScript base config
└── package.json     Root workspace configuration
```

## Environment Variables

See [`.env.example`](.env.example) for all available variables and their defaults.
