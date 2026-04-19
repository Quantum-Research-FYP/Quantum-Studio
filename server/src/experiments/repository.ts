import type pg from 'pg';

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
  /** Extracted from latest_result_json for display without loading the full payload. */
  lastRunStatus: string | null;
  lastRunAt: string | null;
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

/** Map a snake_case DB row to a camelCase Experiment. */
function rowToExperiment(row: Record<string, unknown>): Experiment {
  return {
    id: row.id as string,
    ownerUserId: row.owner_user_id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    tags: (row.tags as string[]) ?? null,
    schemaVersion: row.schema_version as number,
    circuitJson: row.circuit_json as Record<string, unknown>,
    runSettingsJson: (row.run_settings_json as Record<string, unknown>) ?? null,
    latestResultJson: (row.latest_result_json as Record<string, unknown>) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    deletedAt: row.deleted_at ? (row.deleted_at as Date).toISOString() : null,
    rowVersion: row.row_version as number,
  };
}

/** Map a snake_case DB row to a camelCase ExperimentListItem. */
function rowToListItem(row: Record<string, unknown>): ExperimentListItem {
  const latestResult = row.latest_result_json as Record<string, unknown> | null;
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    tags: (row.tags as string[]) ?? null,
    schemaVersion: row.schema_version as number,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    rowVersion: row.row_version as number,
    lastRunStatus: (latestResult?.status as string) ?? null,
    lastRunAt: (latestResult?.runAt as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Allowed sort columns (whitelist to prevent SQL injection)
// ---------------------------------------------------------------------------

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  updated_at: 'updated_at',
  created_at: 'created_at',
  name: 'name',
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createExperimentRepository(pool: pg.Pool) {
  return {
    /**
     * Create a new experiment owned by the given user.
     */
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
      } = input;

      const result = await pool.query(
        `INSERT INTO experiments
           (owner_user_id, name, description, tags, schema_version,
            circuit_json, run_settings_json, latest_result_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          userId,
          name,
          description ?? null,
          tags ? JSON.stringify(tags) : null,
          schemaVersion,
          JSON.stringify(circuitJson),
          runSettingsJson ? JSON.stringify(runSettingsJson) : null,
          latestResultJson ? JSON.stringify(latestResultJson) : null,
        ],
      );

      return rowToExperiment(result.rows[0]);
    },

    /**
     * Fetch an experiment by ID, scoped to the owning user.
     * Returns null if not found, soft-deleted, or owned by another user.
     */
    async getById(id: string, userId: string): Promise<Experiment | null> {
      const result = await pool.query(
        `SELECT * FROM experiments
         WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`,
        [id, userId],
      );
      return result.rows.length > 0 ? rowToExperiment(result.rows[0]) : null;
    },

    /**
     * List experiments for a user with pagination and sorting.
     * Uses a window function for total count to avoid a second query.
     */
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

      const column = ALLOWED_SORT_COLUMNS[sortBy] ?? 'updated_at';
      const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
      const offset = (page - 1) * pageSize;

      const result = await pool.query(
        `SELECT *, COUNT(*) OVER() AS total_count
         FROM experiments
         WHERE owner_user_id = $1 AND deleted_at IS NULL
         ORDER BY ${column} ${direction}, id ASC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset],
      );

      const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count as string, 10) : 0;

      return {
        items: result.rows.map(rowToListItem),
        total,
        page,
        pageSize,
      };
    },

    /**
     * Update an experiment with optimistic concurrency control.
     * The row_version in the WHERE clause ensures no silent overwrites.
     * Returns null if the experiment was not found, not owned, deleted,
     * or the row version has changed since the caller last read it.
     */
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
      } = input;

      const result = await pool.query(
        `UPDATE experiments
         SET name = $3,
             description = $4,
             tags = $5,
             schema_version = $6,
             circuit_json = $7,
             run_settings_json = $8,
             latest_result_json = $9,
             updated_at = now(),
             row_version = row_version + 1
         WHERE id = $1
           AND owner_user_id = $2
           AND deleted_at IS NULL
           AND row_version = $10
         RETURNING *`,
        [
          id,
          userId,
          name,
          description ?? null,
          tags ? JSON.stringify(tags) : null,
          schemaVersion,
          JSON.stringify(circuitJson),
          runSettingsJson ? JSON.stringify(runSettingsJson) : null,
          latestResultJson ? JSON.stringify(latestResultJson) : null,
          expectedRowVersion,
        ],
      );

      return result.rows.length > 0 ? rowToExperiment(result.rows[0]) : null;
    },

    /**
     * Rename an experiment (metadata-only update) with optimistic concurrency.
     * Returns null if not found, not owned, deleted, or version mismatch.
     */
    async rename(
      id: string,
      userId: string,
      newName: string,
      expectedRowVersion: number,
    ): Promise<Experiment | null> {
      const result = await pool.query(
        `UPDATE experiments
         SET name = $3,
             updated_at = now(),
             row_version = row_version + 1
         WHERE id = $1
           AND owner_user_id = $2
           AND deleted_at IS NULL
           AND row_version = $4
         RETURNING *`,
        [id, userId, newName, expectedRowVersion],
      );

      return result.rows.length > 0 ? rowToExperiment(result.rows[0]) : null;
    },

    /**
     * Soft-delete an experiment. Sets deleted_at so it no longer appears
     * in list or get queries. Returns true if the experiment was found and deleted.
     */
    async softDelete(id: string, userId: string): Promise<boolean> {
      const result = await pool.query(
        `UPDATE experiments
         SET deleted_at = now(),
             updated_at = now()
         WHERE id = $1
           AND owner_user_id = $2
           AND deleted_at IS NULL`,
        [id, userId],
      );

      return (result.rowCount ?? 0) > 0;
    },

    /**
     * Fetch the raw experiment row by ID for the owning user, including
     * soft-deleted records. Used for JSON export/recovery when a schema
     * version is unsupported.
     */
    async getRawById(id: string, userId: string): Promise<Experiment | null> {
      const result = await pool.query(
        `SELECT * FROM experiments
         WHERE id = $1 AND owner_user_id = $2`,
        [id, userId],
      );
      return result.rows.length > 0 ? rowToExperiment(result.rows[0]) : null;
    },

    /**
     * Check whether a non-deleted experiment exists for the given user.
     * Used to distinguish 404 (not found) from 409 (version conflict) in handlers.
     */
    async exists(id: string, userId: string): Promise<boolean> {
      const result = await pool.query(
        `SELECT 1 FROM experiments
         WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`,
        [id, userId],
      );
      return result.rows.length > 0;
    },
  };
}
