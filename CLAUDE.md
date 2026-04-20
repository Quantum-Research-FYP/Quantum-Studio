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
- **Database**: MongoDB (connection via `MONGODB_URI` env var, database name via `MONGODB_DB_NAME`)
- **Auth**: Cookie-based sessions (HttpOnly + Secure + SameSite)

## Server Structure

- `server/src/db/` — MongoDB client module (`mongo.ts`), SQL migration files (legacy, being removed)
  - `mongo.ts`: `connectMongo()`, `getDb()`, `getClient()`, `closeMongo()` helpers
  - Credentials masked in logs; fail-fast on missing/invalid connection
- `server/src/auth/` — Auth handlers, router, password hashing (Argon2id), session management
- `server/src/simulations/` — Simulation job API: repository, handlers, router, validation, runner, and Python execution script
  - Job runner polls queue with concurrency limit, spawns Python subprocess per job
  - `simulate.py` executes OpenQASM via Qiskit AerSimulator (Python venv at `server/.venv`)
  - Resource limits configurable via `SIM_MAX_*` env vars (shots, qubits, depth, execution time, concurrent jobs)
  - Results endpoint returns server-computed probabilities (counts/shots, 4dp); export endpoint supports JSON and CSV download with stable sort order
- `server/src/experiments/` — Experiment persistence: repository with ownership-scoped CRUD, soft-delete, optimistic concurrency (rowVersion), paginated listing, raw export, and schema versioning with in-memory migration on load (defer-save)
  - AI provenance: `ai_assisted`, `ai_provider`, `ai_model`, `ai_generated_at`, `ai_code_hash` (always stored), `ai_prompt`/`ai_explanation`/`ai_generated_code` (stored only when `AI_RETAIN_PROMPTS=true`), `ai_share_provenance` (owner opt-in for sharing details)
  - Sharing: `visibility` field (private/unlisted/public, default private), share tokens (hashed, at most one active per experiment), audit events for tracking visibility and token lifecycle changes
- `server/src/sharing/` — Experiment sharing APIs: repository (token CRUD, visibility updates, audit events), handlers, and router
  - Public endpoint: `GET /api/shared/experiments/:id?token=...` (no auth, non-disclosure 404s)
  - Owner endpoints: `PATCH /:id/visibility`, `GET /:id/share-link`, `POST /:id/share-token/rotate`, `DELETE /:id/share-token`
  - Tokens: 192-bit base64url, stored as SHA-256 hash only; public sharing gated by `ENABLE_PUBLIC_SHARING` env var
- `server/src/ai/` — AI draft generation: provider abstraction, handlers, router, rate limiter
  - `POST /api/ai/draft` — accepts `{ prompt }`, returns structured circuit JSON + explanation + code + provider metadata + requestId
  - `POST /api/ai/validate` — accepts `{ circuitJson }`, returns Valid/Partially valid/Invalid with importable circuit and omitted operations
  - Provider abstraction: config-driven (`AI_PROVIDER` env var) with mock and anthropic implementations
  - Deterministic validation: gate allowlist (H,X,Y,Z,S,T,CX,MEASURE), resource limits, per-operation checks
  - Per-user sliding-window rate limiter (`AI_RATE_LIMIT_MAX_REQUESTS` / `AI_RATE_LIMIT_WINDOW_MS`)
  - Feature flag: `ENABLE_AI_DRAFTS` (disabled by default); timeout via `AI_TIMEOUT_MS` (default 30s)
  - All responses include `requestId` for correlation; logs structured as `[ai] action=... userId=... requestId=...`
- `server/src/execution/` — Multi-provider execution domain (IBM Quantum + simulator)
  - `types.ts`: `ExecutionProvider` (`simulator`|`ibm_quantum`), `ExecutionJobStatus` (submitted/queued/running/completed/failed/cancelled), IBM status mapping, valid transitions, audit types
  - `audit.ts`: Append-only audit log repository with metadata sanitization (strips secret keys); supports queries by entity or actor
  - `encryption.ts`: AES-256-GCM encrypt/decrypt using `IBM_QUANTUM_ENCRYPTION_KEY` (64-char hex env var)
  - `ibm-client.ts`: IBM Quantum Runtime API client with mock mode for development; list backends, submit/status/cancel jobs
  - `poll-rate-limiter.ts`: Per-user sliding window rate limiter for job polling (configurable `EXECUTION_POLL_RATE_LIMIT`/`EXECUTION_POLL_RATE_WINDOW_MS`)
  - `handlers.ts` + `router.ts`: Execution API at `/api/execution` — `GET /providers`, `GET /ibm/backends`, `POST /jobs`, `GET /jobs/:jobId`, `POST /jobs/:jobId/cancel`
  - Status refresh with caching/backoff (5s running, 30s queued); results stored on completion
  - Feature flag: `ENABLE_IBM_QUANTUM` (disabled by default); encryption key via `IBM_QUANTUM_ENCRYPTION_KEY`
- `server/src/integrations/` — Per-user IBM Quantum credential management
  - `POST /api/integrations/ibm-quantum/settings` — save token (encrypted at rest), validate against IBM, audit
  - `GET /api/integrations/ibm-quantum/settings` — masked response (never returns raw token)
  - `DELETE /api/integrations/ibm-quantum/settings` — remove credentials, audit
  - Token validation: dev mock (prefix `valid-`) or real IBM API call with timeout
  - Stable error codes: `IBM_QUANTUM_DISABLED`, `INVALID_TOKEN`, `NETWORK_ERROR`, `PROVIDER_UNAVAILABLE`, `PROVIDER_RATE_LIMITED`
- `server/src/middleware/` — Express middleware (auth session validation, route-level `requireAuth` guard)
- `server/src/types/` — TypeScript declaration files (Express augmentation)

## Client Structure

- `client/src/pages/` — Route-level page components
- `client/src/components/` — Shared UI components (AppShell, Header, ProtectedRoute, RenameDialog, DeleteConfirmDialog, ShareSettingsDialog)
- `client/src/components/circuit-builder/` — Circuit builder components (CircuitCanvas, GatePalette, WireList, UndoRedoControls, CodePanel, ValidationSummaryPanel, ExportControls, AiDraftPanel)
- `client/src/hooks/` — React hooks (useAuth, useCircuitHistory, useSimulation, useExperiment, useExecution)
- `client/src/api/` — API client modules (auth, simulations, experiments, sharing, ai, execution, integrations)
- `client/src/circuit/` — Pure TypeScript circuit domain layer (no React dependencies): types, model operations, serialization, validation, codegen, qasm-codegen
- `client/src/templates/` — Static starter template definitions (Bell state, Grover-2q) with `loadTemplateCircuit()` to produce editor-compatible CircuitModel instances
- Routes: `/create` (landing), `/builder` (circuit builder), `/run` (provider selection + submission), `/results`, `/experiments` (protected), `/shared/:experimentId` (public read-only viewer), `/templates` (protected), `/settings` (protected, IBM Quantum credentials), `/login`, `/signup`

## Conventions

- Shared TypeScript base config at `tsconfig.base.json`, extended per package
- ESLint flat config (`eslint.config.mjs`) with TypeScript, React, and Prettier integration
- Prettier: single quotes, trailing commas, 100 char width, 2-space indent
- Environment variables in `.env` (not committed); template in `.env.example`
- Server entry: `server/src/index.ts`
- Client entry: `client/src/main.tsx`
