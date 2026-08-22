import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import { createSpinqRepository } from './spinq-repository.js';

export function createSpinqHandlers(pool: Db) {
  const repo = createSpinqRepository(pool);

  return {
    async getSettings(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;
      try {
        const settings = await repo.getSettings(userId);
        res.status(200).json({ settings });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to retrieve SpinQ settings.', message: err.message });
      }
    },

    async saveSettings(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;
      const { ip, port, username, password } = req.body;

      if (!ip || !port || !username) {
        res.status(400).json({ error: 'Missing required SpinQ config fields (ip, port, username).' });
        return;
      }

      try {
        const payload = {
          ip,
          port: Number(port),
          username,
          password
        };
        const settings = await repo.upsertSettings(userId, payload);
        res.status(200).json({ settings });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to save SpinQ settings.', message: err.message });
      }
    }
  };
}
