import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { type Db } from 'mongodb';
import { connectMongo, getDb, closeMongo } from './db/mongo.js';
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
app.use(createAuthMiddleware(getDb()));

// Job runner (started when the server boots)
const jobRunner = createJobRunner(getDb());

// Routes
app.get('/api/health', async (_req, res) => {
  try {
    await getDb().command({ ping: 1 });
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api/auth', createAuthRouter(getDb()));
app.use(
  '/api/v1/simulations',
  createSimulationsRouter(getDb(), () => jobRunner.nudge()),
);
app.use('/api/experiments', createExperimentsRouter(getDb()));
app.use('/api/experiments', createShareManagementRouter(getDb()));
app.use('/api/shared', createSharedRouter(getDb()));
app.use('/api/ai', createAiRouter());
app.use('/api/integrations/ibm-quantum', createIntegrationsRouter(getDb()));
app.use('/api/execution', createExecutionRouter(getDb(), () => jobRunner.nudge()));

/** Create the Express app (used by tests to get the app without starting the listener). */
export function createApp(testDb?: Db) {
  const database = testDb ?? getDb();
  const testApp = express();

  testApp.use(helmet());
  testApp.use(express.json());
  testApp.use(cookieParser());
  testApp.use(createAuthMiddleware(database));

  testApp.get('/api/health', async (_req, res) => {
    try {
      await database.command({ ping: 1 });
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', database: 'disconnected' });
    }
  });
  testApp.use('/api/auth', createAuthRouter(database));
  testApp.use('/api/v1/simulations', createSimulationsRouter(database));
  testApp.use('/api/experiments', createExperimentsRouter(database));
  testApp.use('/api/experiments', createShareManagementRouter(database));
  testApp.use('/api/shared', createSharedRouter(database));
  testApp.use('/api/ai', createAiRouter());
  testApp.use('/api/integrations/ibm-quantum', createIntegrationsRouter(database));
  testApp.use('/api/execution', createExecutionRouter(database));

  return testApp;
}

// Start server (skipped when imported as a module for testing)
const isMainModule =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule || process.env.START_SERVER === 'true') {
  connectMongo()
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

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[server] SIGTERM received, shutting down...');
    await closeMongo();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    console.log('[server] SIGINT received, shutting down...');
    await closeMongo();
    process.exit(0);
  });
}

export default app;
