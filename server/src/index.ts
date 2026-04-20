import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import pool from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { createAuthRouter } from './auth/router.js';
import { createSimulationsRouter } from './simulations/router.js';
import { createExperimentsRouter } from './experiments/router.js';
import { createSharedRouter, createShareManagementRouter } from './sharing/router.js';
import { createJobRunner } from './simulations/runner.js';
import { createAuthMiddleware } from './middleware/authenticate.js';
import { createAiRouter } from './ai/router.js';
import { createIntegrationsRouter } from './integrations/router.js';
import { createExecutionRouter } from './execution/router.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Security headers
app.use(helmet());

// CORS — allow the Vite dev server origin in development
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}

// Body parsing and cookies
app.use(express.json());
app.use(cookieParser());

// Attach authenticated user to request (non-blocking)
app.use(createAuthMiddleware(pool));

// Job runner (started when the server boots)
const jobRunner = createJobRunner(pool);

// Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', createAuthRouter(pool));
app.use(
  '/api/v1/simulations',
  createSimulationsRouter(pool, () => jobRunner.nudge()),
);
app.use('/api/experiments', createExperimentsRouter(pool));
app.use('/api/experiments', createShareManagementRouter(pool));
app.use('/api/shared', createSharedRouter(pool));
app.use('/api/ai', createAiRouter());
app.use('/api/integrations/ibm-quantum', createIntegrationsRouter(pool));
app.use('/api/execution', createExecutionRouter(pool, () => jobRunner.nudge()));

/** Create the Express app (used by tests to get the app without starting the listener). */
export function createApp(testPool?: import('pg').Pool) {
  const p = testPool ?? pool;
  const testApp = express();

  testApp.use(helmet());
  testApp.use(express.json());
  testApp.use(cookieParser());
  testApp.use(createAuthMiddleware(p));

  testApp.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  testApp.use('/api/auth', createAuthRouter(p));
  testApp.use('/api/v1/simulations', createSimulationsRouter(p));
  testApp.use('/api/experiments', createExperimentsRouter(p));
  testApp.use('/api/experiments', createShareManagementRouter(p));
  testApp.use('/api/shared', createSharedRouter(p));
  testApp.use('/api/ai', createAiRouter());
  testApp.use('/api/integrations/ibm-quantum', createIntegrationsRouter(p));
  testApp.use('/api/execution', createExecutionRouter(p));

  return testApp;
}

// Start server (skipped when imported as a module for testing)
const isMainModule =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule || process.env.START_SERVER === 'true') {
  runMigrations(pool)
    .then(() => {
      jobRunner.start();
      app.listen(PORT, () => {
        console.log(`Server listening on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}

export default app;
