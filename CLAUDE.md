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
npm test             # Client + server tests (vitest)
npm run test:client  # Client circuit domain tests only
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
- `server/src/simulations/` — Simulation job repository (data-access layer for job lifecycle and results)
- `server/src/middleware/` — Express middleware (auth session validation, route-level `requireAuth` guard)
- `server/src/types/` — TypeScript declaration files (Express augmentation)
- Tests use `embedded-postgres` for real PostgreSQL integration tests

## Client Structure

- `client/src/pages/` — Route-level page components
- `client/src/components/` — Shared UI components (AppShell, Header, ProtectedRoute)
- `client/src/components/circuit-builder/` — Circuit builder components (CircuitCanvas, GatePalette, WireList, UndoRedoControls, CodePanel, ValidationSummaryPanel, ExportControls)
- `client/src/hooks/` — React hooks (useAuth, useCircuitHistory)
- `client/src/api/` — API client modules
- `client/src/circuit/` — Pure TypeScript circuit domain layer (no React dependencies): types, model operations, serialization, validation, codegen
- Routes: `/create` (landing), `/builder` (circuit builder), `/run`, `/results`, `/experiments` (protected), `/templates`, `/login`, `/signup`

## Conventions

- Shared TypeScript base config at `tsconfig.base.json`, extended per package
- ESLint flat config (`eslint.config.mjs`) with TypeScript, React, and Prettier integration
- Prettier: single quotes, trailing commas, 100 char width, 2-space indent
- Environment variables in `.env` (not committed); template in `.env.example`
- Server entry: `server/src/index.ts`
- Client entry: `client/src/main.tsx`
