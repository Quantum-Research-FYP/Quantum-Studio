import { Router } from 'express';
import type { Db } from 'mongodb';
import { createAuthHandlers } from './handlers.js';

export function createAuthRouter(pool: Db): Router {
  const router = Router();
  const handlers = createAuthHandlers(pool);

  router.post('/signup', handlers.signup);
  router.post('/login', handlers.login);
  router.post('/logout', handlers.logout);
  router.get('/me', handlers.me);

  return router;
}
