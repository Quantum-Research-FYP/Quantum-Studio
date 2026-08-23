/**
 * Experiment schema versioning and migration.
 *
 * MVP approach: **defer-save**. On load, payloads are migrated in-memory to
 * the current schema version and returned to the client. The migrated data is
 * NOT automatically written back to the database — it is persisted on the next
 * user-initiated save (PUT). This avoids unexpected writes and keeps the load
 * path side-effect-free.
 *
 * Version support policy: current (N) and previous (N-1).
 * Migrations are applied sequentially: v0→v1→v2→…→N.
 */

import type { Experiment } from './repository.js';

// ---------------------------------------------------------------------------
// Version constants
// ---------------------------------------------------------------------------

/** Current experiment schema version. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Minimum schema version that can be migrated to current. */
export const MIN_SUPPORTED_VERSION = 1;

// ---------------------------------------------------------------------------
// Version checks
// ---------------------------------------------------------------------------

/** True if the version can be loaded (current or migratable). */
export function isSupportedVersion(version: number): boolean {
  return (
    Number.isInteger(version) &&
    version >= MIN_SUPPORTED_VERSION &&
    version <= CURRENT_SCHEMA_VERSION
  );
}

/** True if the version is newer than what this server understands. */
export function isNewerVersion(version: number): boolean {
  return Number.isInteger(version) && version > CURRENT_SCHEMA_VERSION;
}

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

/**
 * Each migration function transforms the three JSON payloads from version N
 * to N+1. Migrations must be pure and deterministic — no side effects, no
 * randomness, no Date.now().
 */
interface MigrationPayload {
  circuitJson: Record<string, unknown>;
  runSettingsJson: Record<string, unknown> | null;
  latestResultJson: Record<string, unknown> | null;
}

type MigrationFn = (payload: MigrationPayload) => MigrationPayload;

/**
 * Registry mapping source version → migration function to the next version.
 * When CURRENT_SCHEMA_VERSION is bumped to 2, add: { 1: migrateV1ToV2 }.
 */
const MIGRATIONS: Record<number, MigrationFn> = {
  // Example for future use:
  // 1: migrateV1ToV2,
};

// ---------------------------------------------------------------------------
// Migration entry point
// ---------------------------------------------------------------------------

/**
 * Migrate an experiment's payloads to the current schema version in-memory.
 *
 * Returns a shallow copy of the experiment with migrated payloads and the
 * schemaVersion set to CURRENT_SCHEMA_VERSION. If the experiment is already
 * at the current version, it is returned unchanged (same reference).
 *
 * Throws if the version is unsupported or newer — callers should check with
 * isSupportedVersion / isNewerVersion before calling.
 */
export function migrateExperimentPayload(experiment: Experiment): Experiment {
  if (experiment.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return experiment;
  }

  if (!isSupportedVersion(experiment.schemaVersion)) {
    throw new Error(
      `Cannot migrate experiment from schema version ${experiment.schemaVersion}` +
        ` (supported: ${MIN_SUPPORTED_VERSION}–${CURRENT_SCHEMA_VERSION}).`,
    );
  }

  let payload: MigrationPayload = {
    circuitJson: experiment.circuitJson,
    runSettingsJson: experiment.runSettingsJson,
    latestResultJson: experiment.latestResultJson,
  };

  for (let v = experiment.schemaVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) {
      throw new Error(`Missing migration from schema version ${v} to ${v + 1}.`);
    }
    payload = migrate(payload);
  }

  return {
    ...experiment,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    circuitJson: payload.circuitJson,
    runSettingsJson: payload.runSettingsJson,
    latestResultJson: payload.latestResultJson,
  };
}
