import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { createApp } from '../index.js';
import { runMigrations } from '../db/migrate.js';

let embeddedPg: EmbeddedPostgres;
let pool: pg.Pool;
let app: Express;

beforeAll(async () => {
  embeddedPg = new EmbeddedPostgres({
    databaseDir: './test-pg-results',
    port: 5598,
    user: 'postgres',
    password: 'password',
    persistent: false,
  });
  await embeddedPg.initialise();
  await embeddedPg.start();
  await embeddedPg.createDatabase('test_results');

  pool = new pg.Pool({
    connectionString: 'postgresql://postgres:password@localhost:5598/test_results',
  });

  await runMigrations(pool);
  app = createApp(pool);
}, 60_000);

afterAll(async () => {
  await pool.end();
  await embeddedPg.stop();
}, 30_000);

beforeEach(async () => {
  await pool.query('DELETE FROM simulation_job_results');
  await pool.query('DELETE FROM simulation_jobs');
  await pool.query('DELETE FROM sessions');
  await pool.query('DELETE FROM users');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sign up a user and return the session cookie string. */
async function createUserSession(
  email = 'tester@example.com',
  password = 'securePassword!1',
): Promise<{ cookie: string; userId: string }> {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password });

  const cookies = res.headers['set-cookie'] as string[];
  return { cookie: cookies[0], userId: res.body.user.id };
}

/** Insert a simulation job directly in the DB. */
async function insertJob(
  userId: string,
  overrides: Partial<{
    status: string;
    shots: number;
    errorCode: string;
    errorMessageSafe: string;
  }> = {},
): Promise<string> {
  const status = overrides.status ?? 'completed';
  const shots = overrides.shots ?? 100;
  const result = await pool.query(
    `INSERT INTO simulation_jobs
       (created_by_user_id, shots, qasm_input, backend, limits_snapshot, status,
        error_code, error_message_safe, completed_at)
     VALUES ($1, $2, 'OPENQASM 2.0;', 'aer_simulator', '{}', $3, $4, $5,
        CASE WHEN $3 = 'completed' THEN now() ELSE NULL END)
     RETURNING id`,
    [userId, shots, status, overrides.errorCode ?? null, overrides.errorMessageSafe ?? null],
  );
  return result.rows[0].id;
}

/** Insert results for a completed job. */
async function insertResult(
  jobId: string,
  counts: Record<string, number>,
): Promise<void> {
  await pool.query(
    `INSERT INTO simulation_job_results (job_id, counts_json, metadata_json)
     VALUES ($1, $2, '{"backend":"aer_simulator"}')`,
    [jobId, JSON.stringify(counts)],
  );
}

// ---------------------------------------------------------------------------
// GET /api/v1/simulations/jobs/:jobId/result — enhanced response
// ---------------------------------------------------------------------------

describe('GET /api/v1/simulations/jobs/:jobId/result', () => {
  it('returns shots and server-computed probabilities for completed jobs', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 100 });
    await insertResult(jobId, { '00': 70, '11': 30 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(jobId);
    expect(res.body.shots).toBe(100);
    expect(res.body.counts).toEqual({ '00': 70, '11': 30 });
    expect(res.body.probabilities).toEqual({ '00': 0.7, '11': 0.3 });
    expect(res.body.metadata).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
  });

  it('computes probabilities with 4 decimal precision', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 1024 });
    await insertResult(jobId, { '000': 513, '001': 256, '010': 128, '011': 127 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.probabilities['000']).toBe(0.501);
    expect(res.body.probabilities['001']).toBe(0.25);
    expect(res.body.probabilities['010']).toBe(0.125);
    expect(res.body.probabilities['011']).toBe(0.124);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/simulations/jobs/fake-id/result');
    expect(res.status).toBe(401);
  });

  it('returns 404 for another user\'s job', async () => {
    const { userId } = await createUserSession('owner@example.com');
    const { cookie: otherCookie } = await createUserSession('other@example.com');
    const jobId = await insertJob(userId, { shots: 100 });
    await insertResult(jobId, { '00': 100 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result`)
      .set('Cookie', otherCookie);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/simulations/jobs/:jobId/result/export — JSON
// ---------------------------------------------------------------------------

describe('GET /api/v1/simulations/jobs/:jobId/result/export (JSON)', () => {
  it('returns downloadable JSON with probabilities sorted by probability desc', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 100 });
    await insertResult(jobId, { '00': 70, '11': 30 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export?format=json`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain(`results-${jobId}.json`);
    expect(res.body.jobId).toBe(jobId);
    expect(res.body.shots).toBe(100);
    expect(res.body.counts).toEqual({ '00': 70, '11': 30 });
    expect(res.body.probabilities).toEqual({ '00': 0.7, '11': 0.3 });
    expect(res.body.exportedAt).toBeDefined();
    // exportedAt should be valid ISO-8601
    expect(new Date(res.body.exportedAt).toISOString()).toBe(res.body.exportedAt);
  });

  it('defaults to JSON when no format is specified', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 100 });
    await insertResult(jobId, { '00': 100 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.jobId).toBe(jobId);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/simulations/jobs/:jobId/result/export — CSV
// ---------------------------------------------------------------------------

describe('GET /api/v1/simulations/jobs/:jobId/result/export (CSV)', () => {
  it('returns downloadable CSV with metadata comments and sorted rows', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 1000 });
    await insertResult(jobId, { '00': 700, '11': 200, '01': 100 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export?format=csv`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`results-${jobId}.csv`);

    const lines = res.text.split('\n');
    // Metadata comment lines
    expect(lines[0]).toBe(`# jobId: ${jobId}`);
    expect(lines[1]).toBe('# shots: 1000');
    expect(lines[2]).toMatch(/^# exportedAt: \d{4}-\d{2}-\d{2}T/);
    // Header
    expect(lines[3]).toBe('outcome,counts,probability');
    // Data rows sorted by probability descending
    expect(lines[4]).toBe('00,700,0.7000');
    expect(lines[5]).toBe('11,200,0.2000');
    expect(lines[6]).toBe('01,100,0.1000');
    // Trailing newline produces an empty last element
    expect(lines[7]).toBe('');
  });

  it('uses LF line endings (not CRLF)', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 10 });
    await insertResult(jobId, { '0': 10 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export?format=csv`)
      .set('Cookie', cookie);

    expect(res.text).not.toContain('\r\n');
    expect(res.text).toContain('\n');
  });

  it('uses dot decimal separator for probabilities', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 3 });
    await insertResult(jobId, { '0': 1, '1': 2 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export?format=csv`)
      .set('Cookie', cookie);

    const dataLines = res.text.split('\n').filter((l: string) => !l.startsWith('#') && l.includes(','));
    for (const line of dataLines) {
      const parts = line.split(',');
      if (parts.length === 3 && parts[0] !== 'outcome') {
        // probability should contain dot, not comma
        expect(parts[2]).toMatch(/^\d+\.\d{4}$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Export — error cases
// ---------------------------------------------------------------------------

describe('GET /api/v1/simulations/jobs/:jobId/result/export — error cases', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/simulations/jobs/fake-id/result/export');
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent job', async () => {
    const { cookie } = await createUserSession();
    const res = await request(app)
      .get('/api/v1/simulations/jobs/00000000-0000-0000-0000-000000000000/result/export')
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('returns 404 for another user\'s job', async () => {
    const { userId } = await createUserSession('owner@example.com');
    const { cookie: otherCookie } = await createUserSession('other@example.com');
    const jobId = await insertJob(userId, { shots: 100 });
    await insertResult(jobId, { '00': 100 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export?format=json`)
      .set('Cookie', otherCookie);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a queued job', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { status: 'queued' });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('EXPORT_JOB_NOT_COMPLETED');
  });

  it('returns 400 for a running job', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { status: 'running' });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('EXPORT_JOB_NOT_COMPLETED');
  });

  it('returns 400 for a failed job', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, {
      status: 'failed',
      errorCode: 'EXECUTION_TIMEOUT',
      errorMessageSafe: 'Execution timed out.',
    });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('EXPORT_JOB_FAILED');
  });

  it('returns 400 for empty counts', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 100 });
    await insertResult(jobId, {});

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('EXPORT_EMPTY_RESULTS');
  });

  it('returns 400 for invalid format parameter', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 100 });
    await insertResult(jobId, { '00': 100 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export?format=xml`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('EXPORT_INVALID_FORMAT');
  });
});

// ---------------------------------------------------------------------------
// Sort determinism
// ---------------------------------------------------------------------------

describe('export sort determinism', () => {
  it('sorts by probability descending then bitstring ascending for ties', async () => {
    const { cookie, userId } = await createUserSession();
    const jobId = await insertJob(userId, { shots: 100 });
    // All equal probabilities — should fall back to bitstring ascending
    await insertResult(jobId, { '10': 25, '00': 25, '11': 25, '01': 25 });

    const res = await request(app)
      .get(`/api/v1/simulations/jobs/${jobId}/result/export?format=csv`)
      .set('Cookie', cookie);

    const dataLines = res.text
      .split('\n')
      .filter((l: string) => l && !l.startsWith('#') && l !== 'outcome,counts,probability');

    const bitstrings = dataLines.map((l: string) => l.split(',')[0]);
    expect(bitstrings).toEqual(['00', '01', '10', '11']);
  });
});
