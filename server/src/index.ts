import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config(); // Fallback if ran from root directly
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { type Db } from 'mongodb';
import { connectMongo, closeMongo } from './db/mongo.js';
import { ensureIndexes } from './db/collections.js';
import { createAuthRouter } from './auth/router.js';
import { createSimulationsRouter } from './simulations/router.js';
import { createExperimentsRouter } from './experiments/router.js';
import { createSharedRouter, createShareManagementRouter } from './sharing/router.js';
import { createJobRunner } from './simulations/runner.js';
import { createAuthMiddleware } from './middleware/authenticate.js';
import { createAiRouter } from './ai/router.js';
import { createIntegrationsRouter } from './integrations/router.js';
import { createExecutionRouter } from './execution/router.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

/** Create the Express app wired to the given MongoDB Db instance. */
export function createApp(database: Db, onJobCreated?: () => void) {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS — allow the Vite dev server origin in development
  if (process.env.NODE_ENV !== 'production') {
    app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
  }

  // Body parsing and cookies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Attach authenticated user to request (non-blocking)
  app.use(createAuthMiddleware(database));

  // Routes
  app.get('/api/health', async (_req, res) => {
    try {
      await database.command({ ping: 1 });
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', database: 'disconnected' });
    }
  });

  app.use('/api/auth', createAuthRouter(database));
  app.use(
    '/api/v1/simulations',
    createSimulationsRouter(database, onJobCreated),
  );
  app.use('/api/experiments', createExperimentsRouter(database));
  app.use('/api/experiments', createShareManagementRouter(database));
  app.use('/api/shared', createSharedRouter(database));
  app.use('/api/ai', createAiRouter());
  app.use('/api/integrations/ibm-quantum', createIntegrationsRouter(database));
  app.use('/api/execution', createExecutionRouter(database, onJobCreated));

  return app;
}

// Start server (skipped when imported as a module for testing)
const isMainModule =
  process.argv[1] && import.meta.url.startsWith('file:') && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule || process.env.START_SERVER === 'true') {
  connectMongo()
    .then(async (database) => {
      await ensureIndexes(database);
      const jobRunner = createJobRunner(database);
      const app = createApp(database, () => jobRunner.nudge());
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

// Default export for backwards compatibility
export default { createApp };
