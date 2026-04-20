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
- `server/src/simulations/` — Simulation job API: repository, handlers, router, validation, runner, and Python execution script
  - Job runner polls queue with concurrency limit, spawns Python subprocess per job
  - `simulate.py` executes OpenQASM via Qiskit AerSimulator (Python venv at `server/.venv`)
  - Resource limits configurable via `SIM_MAX_*` env vars (shots, qubits, depth, execution time, concurrent jobs)
  - Results endpoint returns server-computed probabilities (counts/shots, 4dp); export endpoint supports JSON and CSV download with stable sort order
- `server/src/experiments/` — Experiment persistence: repository with ownership-scoped CRUD, soft-delete, optimistic concurrency (rowVersion), paginated listing, raw export, and schema versioning with in-memory migration on load (defer-save)
  - Sharing: `visibility` column (private/unlisted/public, default private), `experiment_share_tokens` table (hashed tokens, at most one active per experiment via partial unique index), `share_audit_events` table for tracking visibility and token lifecycle changes
- `server/src/sharing/` — Experiment sharing APIs: repository (token CRUD, visibility updates, audit events), handlers, and router
  - Public endpoint: `GET /api/shared/experiments/:id?token=...` (no auth, non-disclosure 404s)
  - Owner endpoints: `PATCH /:id/visibility`, `GET /:id/share-link`, `POST /:id/share-token/rotate`, `DELETE /:id/share-token`
  - Tokens: 192-bit base64url, stored as SHA-256 hash only; public sharing gated by `ENABLE_PUBLIC_SHARING` env var
- `server/src/middleware/` — Express middleware (auth session validation, route-level `requireAuth` guard)
- `server/src/types/` — TypeScript declaration files (Express augmentation)
- Tests use `embedded-postgres` for real PostgreSQL integration tests

## Client Structure

- `client/src/pages/` — Route-level page components
- `client/src/components/` — Shared UI components (AppShell, Header, ProtectedRoute, RenameDialog, DeleteConfirmDialog)
- `client/src/components/circuit-builder/` — Circuit builder components (CircuitCanvas, GatePalette, WireList, UndoRedoControls, CodePanel, ValidationSummaryPanel, ExportControls)
- `client/src/hooks/` — React hooks (useAuth, useCircuitHistory, useSimulation, useExperiment)
- `client/src/api/` — API client modules (auth, simulations, experiments)
- `client/src/circuit/` — Pure TypeScript circuit domain layer (no React dependencies): types, model operations, serialization, validation, codegen, qasm-codegen
- Routes: `/create` (landing), `/builder` (circuit builder), `/run`, `/results`, `/experiments` (protected), `/templates`, `/login`, `/signup`

## Conventions

- Shared TypeScript base config at `tsconfig.base.json`, extended per package
- ESLint flat config (`eslint.config.mjs`) with TypeScript, React, and Prettier integration
- Prettier: single quotes, trailing commas, 100 char width, 2-space indent
- Environment variables in `.env` (not committed); template in `.env.example`
- Server entry: `server/src/index.ts`
- Client entry: `client/src/main.tsx`
