import type { Request, Response } from 'express';
import type pg from 'pg';
import { createExperimentRepository } from './repository.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Maximum experiment name length. */
const MAX_NAME_LENGTH = 120;

/** Check whether a string contains control characters (excluding normal whitespace). */
function containsControlChars(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Allow tab (9), newline (10), carriage return (13), and space (32)+
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true;
    if (code === 127) return true;
  }
  return false;
}

/**
 * Validate an experiment name. Returns an error message if invalid, null if valid.
 */
function validateName(name: unknown): string | null {
  if (typeof name !== 'string') {
    return 'Name must be a string.';
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'Name must be between 1 and 120 characters.';
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return 'Name must be between 1 and 120 characters.';
  }
  if (containsControlChars(trimmed)) {
    return 'Name must not contain control characters.';
  }
  return null;
}

/**
 * Parse the If-Match header into a numeric rowVersion.
 * Returns null if the header is missing or malformed.
 */
function parseIfMatch(req: Request): number | null {
  const raw = req.headers['if-match'];
  if (!raw) return null;
  const header = Array.isArray(raw) ? raw[0] : raw;
  // Strip surrounding quotes: "3" → 3
  const stripped = header.replace(/^"(.*)"$/, '$1');
  const value = parseInt(stripped, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Set the ETag response header from a rowVersion. */
function setETag(res: Response, rowVersion: number): void {
  res.setHeader('ETag', `"${rowVersion}"`);
}

/** Format an Experiment for the API response (omit internal fields). */
function formatExperiment(exp: {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  schemaVersion: number;
  circuitJson: Record<string, unknown>;
  runSettingsJson: Record<string, unknown> | null;
  latestResultJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}) {
  return {
    id: exp.id,
    name: exp.name,
    description: exp.description,
    tags: exp.tags,
    schemaVersion: exp.schemaVersion,
    circuitJson: exp.circuitJson,
    runSettingsJson: exp.runSettingsJson,
    latestResultJson: exp.latestResultJson,
    createdAt: exp.createdAt,
    updatedAt: exp.updatedAt,
    rowVersion: exp.rowVersion,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function createExperimentHandlers(pool: pg.Pool) {
  const repo = createExperimentRepository(pool);

  return {
    /** POST /api/experiments — Create a new experiment. */
    async createExperiment(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const { name, circuitJson, description, tags, runSettingsJson, latestResultJson } =
          req.body ?? {};

        const nameError = validateName(name);
        if (nameError) {
          res.status(400).json({ error: nameError, errorCode: 'VALIDATION_NAME' });
          return;
        }

        if (!circuitJson || typeof circuitJson !== 'object' || Array.isArray(circuitJson)) {
          res.status(400).json({
            error: 'circuitJson must be a non-null object.',
            errorCode: 'VALIDATION_CIRCUIT_JSON',
          });
          return;
        }

        if (tags !== undefined && !Array.isArray(tags)) {
          res.status(400).json({
            error: 'Tags must be an array of strings.',
            errorCode: 'VALIDATION_TAGS',
          });
          return;
        }

        const experiment = await repo.create({
          userId,
          name: (name as string).trim(),
          circuitJson,
          description: typeof description === 'string' ? description.trim() : undefined,
          tags,
          runSettingsJson:
            runSettingsJson && typeof runSettingsJson === 'object' ? runSettingsJson : undefined,
          latestResultJson:
            latestResultJson && typeof latestResultJson === 'object' ? latestResultJson : undefined,
        });

        console.log(
          `[experiment] action=create userId=${userId} experimentId=${experiment.id}`,
        );

        setETag(res, experiment.rowVersion);
        res.status(201).json(formatExperiment(experiment));
      } catch (err) {
        console.error('Create experiment error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** GET /api/experiments/:id — Load a single experiment. */
    async getExperiment(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const experimentId = req.params.id as string;

        const experiment = await repo.getById(experimentId, userId);
        if (!experiment) {
          res.status(404).json({ error: 'Experiment not found.' });
          return;
        }

        console.log(
          `[experiment] action=load userId=${userId} experimentId=${experimentId}`,
        );

        setETag(res, experiment.rowVersion);
        res.status(200).json(formatExperiment(experiment));
      } catch (err) {
        console.error('Get experiment error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** GET /api/experiments — List experiments for the current user. */
    async listExperiments(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;

        const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
        const sortBy = (['updated_at', 'created_at', 'name'] as const).includes(
          req.query.sortBy as 'updated_at' | 'created_at' | 'name',
        )
          ? (req.query.sortBy as 'updated_at' | 'created_at' | 'name')
          : 'updated_at';
        const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

        const result = await repo.listByUser(userId, { page, pageSize, sortBy, sortOrder });

        res.status(200).json(result);
      } catch (err) {
        console.error('List experiments error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** PUT /api/experiments/:id — Full update with optimistic concurrency. */
    async updateExperiment(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const experimentId = req.params.id as string;

        const expectedRowVersion = parseIfMatch(req);
        if (expectedRowVersion === null) {
          res.status(428).json({
            error: 'If-Match header with a valid rowVersion is required for updates.',
            errorCode: 'PRECONDITION_REQUIRED',
          });
          return;
        }

        const {
          name,
          circuitJson,
          description,
          tags,
          schemaVersion,
          runSettingsJson,
          latestResultJson,
        } = req.body ?? {};

        const nameError = validateName(name);
        if (nameError) {
          res.status(400).json({ error: nameError, errorCode: 'VALIDATION_NAME' });
          return;
        }

        if (!circuitJson || typeof circuitJson !== 'object' || Array.isArray(circuitJson)) {
          res.status(400).json({
            error: 'circuitJson must be a non-null object.',
            errorCode: 'VALIDATION_CIRCUIT_JSON',
          });
          return;
        }

        if (tags !== undefined && tags !== null && !Array.isArray(tags)) {
          res.status(400).json({
            error: 'Tags must be an array of strings.',
            errorCode: 'VALIDATION_TAGS',
          });
          return;
        }

        const updated = await repo.update({
          id: experimentId,
          userId,
          name: (name as string).trim(),
          circuitJson,
          expectedRowVersion,
          description: description !== undefined ? (typeof description === 'string' ? description.trim() : null) : undefined,
          tags: tags !== undefined ? tags : undefined,
          schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : undefined,
          runSettingsJson: runSettingsJson !== undefined ? runSettingsJson : undefined,
          latestResultJson: latestResultJson !== undefined ? latestResultJson : undefined,
        });

        if (!updated) {
          // Distinguish 404 from 409: does the experiment exist for this user?
          const exists = await repo.exists(experimentId, userId);
          if (exists) {
            res.status(409).json({
              error:
                'The experiment has been modified since you last loaded it. Please reload and try again.',
              errorCode: 'EXPERIMENT_VERSION_CONFLICT',
            });
          } else {
            res.status(404).json({ error: 'Experiment not found.' });
          }
          return;
        }

        console.log(
          `[experiment] action=update userId=${userId} experimentId=${experimentId}`,
        );

        setETag(res, updated.rowVersion);
        res.status(200).json(formatExperiment(updated));
      } catch (err) {
        console.error('Update experiment error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** PATCH /api/experiments/:id — Rename (metadata-only update). */
    async renameExperiment(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const experimentId = req.params.id as string;

        const expectedRowVersion = parseIfMatch(req);
        if (expectedRowVersion === null) {
          res.status(428).json({
            error: 'If-Match header with a valid rowVersion is required for renames.',
            errorCode: 'PRECONDITION_REQUIRED',
          });
          return;
        }

        const { name } = req.body ?? {};

        const nameError = validateName(name);
        if (nameError) {
          res.status(400).json({ error: nameError, errorCode: 'VALIDATION_NAME' });
          return;
        }

        const renamed = await repo.rename(experimentId, userId, (name as string).trim(), expectedRowVersion);

        if (!renamed) {
          const exists = await repo.exists(experimentId, userId);
          if (exists) {
            res.status(409).json({
              error:
                'The experiment has been modified since you last loaded it. Please reload and try again.',
              errorCode: 'EXPERIMENT_VERSION_CONFLICT',
            });
          } else {
            res.status(404).json({ error: 'Experiment not found.' });
          }
          return;
        }

        console.log(
          `[experiment] action=rename userId=${userId} experimentId=${experimentId}`,
        );

        setETag(res, renamed.rowVersion);
        res.status(200).json(formatExperiment(renamed));
      } catch (err) {
        console.error('Rename experiment error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** DELETE /api/experiments/:id — Soft delete. */
    async deleteExperiment(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const experimentId = req.params.id as string;

        const deleted = await repo.softDelete(experimentId, userId);
        if (!deleted) {
          res.status(404).json({ error: 'Experiment not found.' });
          return;
        }

        console.log(
          `[experiment] action=delete userId=${userId} experimentId=${experimentId}`,
        );

        res.status(204).send();
      } catch (err) {
        console.error('Delete experiment error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** GET /api/experiments/:id/raw — Export raw experiment JSON (including soft-deleted). */
    async exportExperimentRaw(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const experimentId = req.params.id as string;

        const experiment = await repo.getRawById(experimentId, userId);
        if (!experiment) {
          res.status(404).json({ error: 'Experiment not found.' });
          return;
        }

        console.log(
          `[experiment] action=export-raw userId=${userId} experimentId=${experimentId}`,
        );

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="experiment-${experiment.id}.json"`,
        );
        res.status(200).json({
          id: experiment.id,
          name: experiment.name,
          description: experiment.description,
          tags: experiment.tags,
          schemaVersion: experiment.schemaVersion,
          circuitJson: experiment.circuitJson,
          runSettingsJson: experiment.runSettingsJson,
          latestResultJson: experiment.latestResultJson,
          createdAt: experiment.createdAt,
          updatedAt: experiment.updatedAt,
          rowVersion: experiment.rowVersion,
        });
      } catch (err) {
        console.error('Export experiment error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },
  };
}
