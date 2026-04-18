# Quantum Experiment Studio

## Project Overview

Monorepo for a quantum circuit experimentation platform. Two npm workspaces:

- **client/** — React 18 + TypeScript SPA built with Vite (port 5173)
- **server/** — Express + TypeScript API (port 3001)

## Quick Reference

```bash
npm install          # Install all workspace dependencies
npm run dev          # Start both client and server
npm run lint         # ESLint (flat config) across client/src and server/src
npm run format       # Prettier formatting
npm test             # Server tests (vitest)
```

## Architecture

- **Monorepo**: npm workspaces (no Nx/Turbo)
- **Client**: React 18, Vite, TypeScript. Vite proxies `/api` to the server in dev.
- **Server**: Express, TypeScript, `tsx watch` for dev hot-reload.
- **Database**: PostgreSQL (connection via `DATABASE_URL` env var)
- **Auth**: Cookie-based sessions (HttpOnly + Secure + SameSite)

## Server Structure

- `server/src/db/` — PostgreSQL pool, migration runner, SQL migration files
- `server/src/auth/` — Auth handlers, router, password hashing (Argon2id), session management
- `server/src/middleware/` — Express middleware (auth session validation)
- `server/src/types/` — TypeScript declaration files (Express augmentation)
- Tests use `embedded-postgres` for real PostgreSQL integration tests

## Conventions

- Shared TypeScript base config at `tsconfig.base.json`, extended per package
- ESLint flat config (`eslint.config.mjs`) with TypeScript, React, and Prettier integration
- Prettier: single quotes, trailing commas, 100 char width, 2-space indent
- Environment variables in `.env` (not committed); template in `.env.example`
- Server entry: `server/src/index.ts`
- Client entry: `client/src/main.tsx`
