import type { AuthenticatedUser } from '../middleware/authenticate.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
