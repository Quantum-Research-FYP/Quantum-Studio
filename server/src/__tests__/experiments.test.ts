import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { createApp } from '../index.js';
import { ensureIndexes, COLLECTIONS } from '../db/collections.js';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let app: Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('test_experiments');
  await ensureIndexes(db);
  app = createApp(db);
}, 60_000);

afterAll(async () => {
  await client.close();
  await mongod.stop();
}, 30_000);

beforeEach(async () => {
  await db.collection(COLLECTIONS.EXPERIMENTS).deleteMany({});
  await db.collection(COLLECTIONS.SESSIONS).deleteMany({});
  await db.collection(COLLECTIONS.USERS).deleteMany({});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUserSession(
  email = 'tester@example.com',
  password = 'securePassword!1',
): Promise<{ cookie: string; userId: string }> {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password });

  const cookies = res.headers['set-cookie'] as unknown as string[];
  return { cookie: cookies[0], userId: res.body.user.id };
}

const validCircuit = { qubits: 2, operations: [{ gate: 'H', target: 0 }] };

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

describe('POST /api/experiments', () => {
  it('creates a new experiment', async () => {
    const { cookie } = await createUserSession();

    const res = await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'Bell State', circuitJson: validCircuit });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Bell State');
    expect(res.body.circuitJson).toEqual(validCircuit);
    expect(res.body.rowVersion).toBe(1);
    expect(res.headers['etag']).toBe('"1"');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/experiments')
      .send({ name: 'Test', circuitJson: validCircuit });
    expect(res.status).toBe(401);
  });

  it('rejects missing name', async () => {
    const { cookie } = await createUserSession();

    const res = await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ circuitJson: validCircuit });

    expect(res.status).toBe(400);
  });

  it('rejects missing circuitJson', async () => {
    const { cookie } = await createUserSession();

    const res = await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'Test' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/experiments/:id', () => {
  it('loads an experiment by id', async () => {
    const { cookie } = await createUserSession();

    const createRes = await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'My Experiment', circuitJson: validCircuit });

    const res = await request(app)
      .get(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('My Experiment');
    expect(res.body.circuitJson).toEqual(validCircuit);
  });

  it('returns 404 for non-existent experiment', async () => {
    const { cookie } = await createUserSession();

    const res = await request(app)
      .get('/api/experiments/00000000-0000-0000-0000-000000000000')
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/experiments (list)', () => {
  it('returns paginated experiments for the current user', async () => {
    const { cookie } = await createUserSession();

    await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'Exp 1', circuitJson: validCircuit });

    await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'Exp 2', circuitJson: validCircuit });

    const res = await request(app)
      .get('/api/experiments')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
  });
});

describe('PUT /api/experiments/:id (update with optimistic concurrency)', () => {
  it('updates with correct If-Match header', async () => {
    const { cookie } = await createUserSession();

    const createRes = await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'Original', circuitJson: validCircuit });

    const res = await request(app)
      .put(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', cookie)
      .set('If-Match', '"1"')
      .send({ name: 'Updated', circuitJson: validCircuit });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated');
    expect(res.body.rowVersion).toBe(2);
    expect(res.headers['etag']).toBe('"2"');
  });

  it('returns 409 on version conflict', async () => {
    const { cookie } = await createUserSession();

    const createRes = await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'Original', circuitJson: validCircuit });

    // First update (version 1 → 2)
    await request(app)
      .put(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', cookie)
      .set('If-Match', '"1"')
      .send({ name: 'Updated Once', circuitJson: validCircuit });

    // Second update with stale version (still expecting 1)
    const res = await request(app)
      .put(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', cookie)
      .set('If-Match', '"1"')
      .send({ name: 'Conflict!', circuitJson: validCircuit });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('EXPERIMENT_VERSION_CONFLICT');
  });

  it('returns 428 without If-Match header', async () => {
    const { cookie } = await createUserSession();

    const createRes = await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'Test', circuitJson: validCircuit });

    const res = await request(app)
      .put(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', cookie)
      .send({ name: 'No ETag', circuitJson: validCircuit });

    expect(res.status).toBe(428);
  });
});

describe('DELETE /api/experiments/:id (soft delete)', () => {
  it('soft-deletes an experiment', async () => {
    const { cookie } = await createUserSession();

    const createRes = await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'To Delete', circuitJson: validCircuit });

    const deleteRes = await request(app)
      .delete(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', cookie);

    expect(deleteRes.status).toBe(204);

    // Should no longer be visible
    const getRes = await request(app)
      .get(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', cookie);

    expect(getRes.status).toBe(404);
  });

  it('does not appear in list after soft-delete', async () => {
    const { cookie } = await createUserSession();

    const createRes = await request(app)
      .post('/api/experiments')
      .set('Cookie', cookie)
      .send({ name: 'Deletable', circuitJson: validCircuit });

    await request(app)
      .delete(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', cookie);

    const listRes = await request(app)
      .get('/api/experiments')
      .set('Cookie', cookie);

    expect(listRes.body.items).toHaveLength(0);
    expect(listRes.body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Access control — user isolation
// ---------------------------------------------------------------------------

describe('access control (user isolation)', () => {
  it('cannot read another user\'s experiment', async () => {
    const { cookie: ownerCookie } = await createUserSession('owner@example.com');
    const { cookie: otherCookie } = await createUserSession('other@example.com');

    const createRes = await request(app)
      .post('/api/experiments')
      .set('Cookie', ownerCookie)
      .send({ name: 'Private', circuitJson: validCircuit });

    const res = await request(app)
      .get(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', otherCookie);

    expect(res.status).toBe(404);
  });

  it('cannot update another user\'s experiment', async () => {
    const { cookie: ownerCookie } = await createUserSession('owner@example.com');
    const { cookie: otherCookie } = await createUserSession('other@example.com');

    const createRes = await request(app)
      .post('/api/experiments')
      .set('Cookie', ownerCookie)
      .send({ name: 'Private', circuitJson: validCircuit });

    const res = await request(app)
      .put(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', otherCookie)
      .set('If-Match', '"1"')
      .send({ name: 'Hacked', circuitJson: validCircuit });

    expect(res.status).toBe(404);
  });

  it('cannot delete another user\'s experiment', async () => {
    const { cookie: ownerCookie } = await createUserSession('owner@example.com');
    const { cookie: otherCookie } = await createUserSession('other@example.com');

    const createRes = await request(app)
      .post('/api/experiments')
      .set('Cookie', ownerCookie)
      .send({ name: 'Private', circuitJson: validCircuit });

    const res = await request(app)
      .delete(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', otherCookie);

    expect(res.status).toBe(404);

    // Verify it still exists for the owner
    const ownerGet = await request(app)
      .get(`/api/experiments/${createRes.body.id}`)
      .set('Cookie', ownerCookie);

    expect(ownerGet.status).toBe(200);
  });

  it('list only shows own experiments', async () => {
    const { cookie: aliceCookie } = await createUserSession('alice@example.com');
    const { cookie: bobCookie } = await createUserSession('bob@example.com');

    await request(app)
      .post('/api/experiments')
      .set('Cookie', aliceCookie)
      .send({ name: 'Alice Exp', circuitJson: validCircuit });

    await request(app)
      .post('/api/experiments')
      .set('Cookie', bobCookie)
      .send({ name: 'Bob Exp', circuitJson: validCircuit });

    const aliceList = await request(app)
      .get('/api/experiments')
      .set('Cookie', aliceCookie);

    expect(aliceList.body.items).toHaveLength(1);
    expect(aliceList.body.items[0].name).toBe('Alice Exp');

    const bobList = await request(app)
      .get('/api/experiments')
      .set('Cookie', bobCookie);

    expect(bobList.body.items).toHaveLength(1);
    expect(bobList.body.items[0].name).toBe('Bob Exp');
  });
});
