import type { Db, UpdateFilter } from 'mongodb';
import { v4 as uuid } from 'uuid';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Experiment {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  schemaVersion: number;
  circuitJson: Record<string, unknown>;
  runSettingsJson: Record<string, unknown> | null;
  latestResultJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  rowVersion: number;
  aiAssisted: boolean;
  aiProvider: string | null;
  aiModel: string | null;
  aiGeneratedAt: string | null;
  aiCodeHash: string | null;
  aiPrompt: string | null;
  aiExplanation: string | null;
  aiGeneratedCode: string | null;
  aiShareProvenance: boolean;
}

/** Lightweight projection for list queries. */
export interface ExperimentListItem {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
  lastRunStatus: string | null;
  lastRunAt: string | null;
}

export interface AiProvenanceInput {
  aiAssisted: boolean;
  aiProvider?: string;
  aiModel?: string;
  aiGeneratedAt?: string;
  aiCodeHash?: string;
  aiPrompt?: string;
  aiExplanation?: string;
  aiGeneratedCode?: string;
}

export interface CreateExperimentInput {
  userId: string;
  name: string;
  circuitJson: Record<string, unknown>;
  description?: string;
  tags?: string[];
  schemaVersion?: number;
  runSettingsJson?: Record<string, unknown>;
  latestResultJson?: Record<string, unknown>;
  aiProvenance?: AiProvenanceInput;
}

export interface UpdateExperimentInput {
  id: string;
  userId: string;
  name: string;
  circuitJson: Record<string, unknown>;
  expectedRowVersion: number;
  description?: string | null;
  tags?: string[] | null;
  schemaVersion?: number;
  runSettingsJson?: Record<string, unknown> | null;
  latestResultJson?: Record<string, unknown> | null;
  aiProvenance?: AiProvenanceInput;
}

export interface ExperimentListOptions {
  page?: number;
  pageSize?: number;
  sortBy?: 'updated_at' | 'created_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a MongoDB document to a camelCase Experiment. */
function docToExperiment(doc: Record<string, unknown>): Experiment {
  return {
    id: doc._id as string,
    ownerUserId: doc.ownerId as string,
    name: doc.name as string,
    description: (doc.description as string) ?? null,
    tags: (doc.tags as string[]) ?? null,
    schemaVersion: doc.schemaVersion as number,
    circuitJson: doc.circuitJson as Record<string, unknown>,
    runSettingsJson: (doc.runSettingsJson as Record<string, unknown>) ?? null,
    latestResultJson: (doc.latestResultJson as Record<string, unknown>) ?? null,
    createdAt: (doc.createdAt as Date).toISOString(),
    updatedAt: (doc.updatedAt as Date).toISOString(),
    deletedAt: doc.deletedAt ? (doc.deletedAt as Date).toISOString() : null,
    rowVersion: doc.rowVersion as number,
    aiAssisted: (doc.aiAssisted as boolean) ?? false,
    aiProvider: (doc.aiProvider as string) ?? null,
    aiModel: (doc.aiModel as string) ?? null,
    aiGeneratedAt: doc.aiGeneratedAt ? (doc.aiGeneratedAt as Date).toISOString() : null,
    aiCodeHash: (doc.aiCodeHash as string) ?? null,
    aiPrompt: (doc.aiPrompt as string) ?? null,
    aiExplanation: (doc.aiExplanation as string) ?? null,
    aiGeneratedCode: (doc.aiGeneratedCode as string) ?? null,
    aiShareProvenance: (doc.aiShareProvenance as boolean) ?? false,
  };
}

/** Map a MongoDB document to a camelCase ExperimentListItem. */
function docToListItem(doc: Record<string, unknown>): ExperimentListItem {
  const latestResult = doc.latestResultJson as Record<string, unknown> | null;
  return {
    id: doc._id as string,
    name: doc.name as string,
    description: (doc.description as string) ?? null,
    tags: (doc.tags as string[]) ?? null,
    schemaVersion: doc.schemaVersion as number,
    createdAt: (doc.createdAt as Date).toISOString(),
    updatedAt: (doc.updatedAt as Date).toISOString(),
    rowVersion: doc.rowVersion as number,
    lastRunStatus: (latestResult?.status as string) ?? null,
    lastRunAt: (latestResult?.runAt as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Sort field mapping
// ---------------------------------------------------------------------------

const SORT_FIELD_MAP: Record<string, string> = {
  updated_at: 'updatedAt',
  created_at: 'createdAt',
  name: 'name',
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createExperimentRepository(pool: Db) {
  const experiments = pool.collection<AppDocument>(COLLECTIONS.EXPERIMENTS);

  return {
    async create(input: CreateExperimentInput): Promise<Experiment> {
      const {
        userId,
        name,
        circuitJson,
        description,
        tags,
        schemaVersion = 1,
        runSettingsJson,
        latestResultJson,
        aiProvenance,
      } = input;

      const retainPrompts = process.env.AI_RETAIN_PROMPTS === 'true';
      const ai = aiProvenance;
      const now = new Date();

      const doc = {
        _id: uuid(),
        ownerId: userId,
        name,
        description: description ?? null,
        tags: tags ?? null,
        schemaVersion,
        circuitJson,
        runSettingsJson: runSettingsJson ?? null,
        latestResultJson: latestResultJson ?? null,
        visibility: 'private',
        deletedAt: null,
        rowVersion: 1,
        aiAssisted: ai?.aiAssisted ?? false,
        aiProvider: ai?.aiProvider ?? null,
        aiModel: ai?.aiModel ?? null,
        aiGeneratedAt: ai?.aiGeneratedAt ? new Date(ai.aiGeneratedAt) : null,
        aiCodeHash: ai?.aiCodeHash ?? null,
        aiPrompt: retainPrompts ? (ai?.aiPrompt ?? null) : null,
        aiExplanation: retainPrompts ? (ai?.aiExplanation ?? null) : null,
        aiGeneratedCode: retainPrompts ? (ai?.aiGeneratedCode ?? null) : null,
        aiShareProvenance: false,
        createdAt: now,
        updatedAt: now,
      };

      await experiments.insertOne(doc);
      return docToExperiment(doc as unknown as Record<string, unknown>);
    },

    async getById(id: string, userId: string): Promise<Experiment | null> {
      const doc = await experiments.findOne({
        _id: id,
        ownerId: userId,
        deletedAt: null,
      });
      return doc ? docToExperiment(doc as unknown as Record<string, unknown>) : null;
    },

    async listByUser(
      userId: string,
      options: ExperimentListOptions = {},
    ): Promise<PaginatedResult<ExperimentListItem>> {
      const {
        page = 1,
        pageSize = 20,
        sortBy = 'updated_at',
        sortOrder = 'desc',
      } = options;

      const field = SORT_FIELD_MAP[sortBy] ?? 'updatedAt';
      const direction = sortOrder === 'asc' ? 1 : -1;
      const offset = (page - 1) * pageSize;

      const filter = { ownerId: userId, deletedAt: null };

      const [items, total] = await Promise.all([
        experiments
          .find(filter)
          .sort({ [field]: direction, _id: 1 })
          .skip(offset)
          .limit(pageSize)
          .toArray(),
        experiments.countDocuments(filter),
      ]);

      return {
        items: items.map((d) => docToListItem(d as unknown as Record<string, unknown>)),
        total,
        page,
        pageSize,
      };
    },

    async update(input: UpdateExperimentInput): Promise<Experiment | null> {
      const {
        id,
        userId,
        name,
        circuitJson,
        expectedRowVersion,
        description,
        tags,
        schemaVersion = 1,
        runSettingsJson,
        latestResultJson,
        aiProvenance,
      } = input;

      const retainPrompts = process.env.AI_RETAIN_PROMPTS === 'true';
      const ai = aiProvenance;
      const now = new Date();

      const result = await experiments.findOneAndUpdate(
        {
          _id: id,
          ownerId: userId,
          deletedAt: null,
          rowVersion: expectedRowVersion,
        },
        {
          $set: {
            name,
            description: description ?? null,
            tags: tags ?? null,
            schemaVersion,
            circuitJson,
            runSettingsJson: runSettingsJson ?? null,
            latestResultJson: latestResultJson ?? null,
            aiAssisted: ai?.aiAssisted ?? false,
            aiProvider: ai?.aiProvider ?? null,
            aiModel: ai?.aiModel ?? null,
            aiGeneratedAt: ai?.aiGeneratedAt ? new Date(ai.aiGeneratedAt) : null,
            aiCodeHash: ai?.aiCodeHash ?? null,
            aiPrompt: retainPrompts ? (ai?.aiPrompt ?? null) : null,
            aiExplanation: retainPrompts ? (ai?.aiExplanation ?? null) : null,
            aiGeneratedCode: retainPrompts ? (ai?.aiGeneratedCode ?? null) : null,
            updatedAt: now,
          },
          $inc: { rowVersion: 1 },
        } as unknown as UpdateFilter<AppDocument>,
        { returnDocument: 'after' },
      );

      return result ? docToExperiment(result as unknown as Record<string, unknown>) : null;
    },

    async rename(
      id: string,
      userId: string,
      newName: string,
      expectedRowVersion: number,
    ): Promise<Experiment | null> {
      const result = await experiments.findOneAndUpdate(
        {
          _id: id,
          ownerId: userId,
          deletedAt: null,
          rowVersion: expectedRowVersion,
        },
        {
          $set: { name: newName, updatedAt: new Date() },
          $inc: { rowVersion: 1 },
        } as unknown as UpdateFilter<AppDocument>,
        { returnDocument: 'after' },
      );

      return result ? docToExperiment(result as unknown as Record<string, unknown>) : null;
    },

    async softDelete(id: string, userId: string): Promise<boolean> {
      const now = new Date();
      const result = await experiments.updateOne(
        { _id: id, ownerId: userId, deletedAt: null },
        { $set: { deletedAt: now, updatedAt: now } },
      );
      return result.modifiedCount > 0;
    },

    async getRawById(id: string, userId: string): Promise<Experiment | null> {
      const doc = await experiments.findOne({ _id: id, ownerId: userId });
      return doc ? docToExperiment(doc as unknown as Record<string, unknown>) : null;
    },

    async exists(id: string, userId: string): Promise<boolean> {
      const count = await experiments.countDocuments(
        { _id: id, ownerId: userId, deletedAt: null },
        { limit: 1 },
      );
      return count > 0;
    },
  };
}
