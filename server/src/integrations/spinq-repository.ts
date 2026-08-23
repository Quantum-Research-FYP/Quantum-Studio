import type { Db } from 'mongodb';
import { v4 as uuid } from 'uuid';
import { encrypt, decrypt, type EncryptedPayload } from '../execution/encryption.js';
import { COLLECTIONS } from '../db/collections.js';

interface SpinqSettingsDocument {
  _id: string;
  userId: string;
  provider: string;
  createdAt: Date;
  updatedAt: Date;
  spinq?: {
    ip: string;
    port: number;
    username: string;
    encryptedPassword?: string;
    iv?: string;
    authTag?: string;
  };
}

export interface SpinqSettingsPayload {
  ip: string;
  port: number;
  username: string;
  password?: string; // Clear text in requests, encrypted in DB
}

export interface SpinqSettingsMasked {
  id: string;
  userId: string;
  ip: string;
  port: number;
  username: string;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createSpinqRepository(pool: Db) {
  const settings = pool.collection<SpinqSettingsDocument>(COLLECTIONS.USER_INTEGRATION_SETTINGS);
  const provider = 'spinq';

  return {
    async upsertSettings(
      userId: string,
      payload: SpinqSettingsPayload,
    ): Promise<SpinqSettingsMasked> {
      let encryptedPayload: EncryptedPayload | undefined;

      if (payload.password) {
        encryptedPayload = encrypt(payload.password);
      }

      const now = new Date();

      const updateData: Record<string, unknown> = {
        updatedAt: now,
        'spinq.ip': payload.ip,
        'spinq.port': payload.port,
        'spinq.username': payload.username,
      };

      if (encryptedPayload) {
        updateData['spinq.encryptedPassword'] = encryptedPayload.ciphertext;
        updateData['spinq.iv'] = encryptedPayload.iv;
        updateData['spinq.authTag'] = encryptedPayload.authTag;
      }

      const result = await settings.findOneAndUpdate(
        { userId, provider },
        {
          $set: updateData,
          $setOnInsert: {
            _id: uuid(),
            createdAt: now,
            userId,
            provider,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );

      const doc = result!;

      return {
        id: doc._id as string,
        userId: doc.userId as string,
        ip: doc.spinq?.ip as string,
        port: doc.spinq?.port as number,
        username: doc.spinq?.username as string,
        hasPassword: Boolean(doc.spinq?.encryptedPassword),
        createdAt: (doc.createdAt as Date).toISOString(),
        updatedAt: (doc.updatedAt as Date).toISOString(),
      };
    },

    async getSettings(userId: string): Promise<SpinqSettingsMasked | null> {
      const doc = await settings.findOne({ userId, provider });
      if (!doc) return null;

      return {
        id: doc._id as string,
        userId: doc.userId as string,
        ip: doc.spinq?.ip as string,
        port: doc.spinq?.port as number,
        username: doc.spinq?.username as string,
        hasPassword: Boolean(doc.spinq?.encryptedPassword),
        createdAt: (doc.createdAt as Date).toISOString(),
        updatedAt: (doc.updatedAt as Date).toISOString(),
      };
    },

    async getFullSettings(userId: string): Promise<SpinqSettingsPayload | null> {
      const doc = await settings.findOne({ userId, provider });
      if (!doc) return null;

      const payload: SpinqSettingsPayload = {
        ip: doc.spinq?.ip as string,
        port: doc.spinq?.port as number,
        username: doc.spinq?.username as string,
      };

      if (doc.spinq?.encryptedPassword) {
        try {
          payload.password = decrypt({
            ciphertext: doc.spinq.encryptedPassword as string,
            iv: doc.spinq.iv as string,
            authTag: doc.spinq.authTag as string,
          });
        } catch {
          // ignore
        }
      }

      return payload;
    },
  };
}
