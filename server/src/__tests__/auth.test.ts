import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { createApp } from '../index.js';
import { ensureIndexes, COLLECTIONS } from '../db/collections.js';
import { validatePassword, hashPassword, verifyPassword } from '../auth/password.js';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let app: Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('test_quantum');
  await ensureIndexes(db);
  app = createApp(db);
}, 60_000);

afterAll(async () => {
  await client.close();
  await mongod.stop();
}, 30_000);

beforeEach(async () => {
  await db.collection(COLLECTIONS.SESSIONS).deleteMany({});
  await db.collection(COLLECTIONS.USERS).deleteMany({});
});

// ---------------------------------------------------------------------------
// Password policy unit tests
// ---------------------------------------------------------------------------
describe('password policy', () => {
  it('rejects passwords shorter than 12 characters', () => {
    expect(validatePassword('short')).toEqual({
      valid: false,
      message: 'Password must be at least 12 characters.',
    });
  });

  it('rejects common/breached passwords', () => {
    const result = validatePassword('password1234');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('too common');
  });

  it('accepts a valid password', () => {
    expect(validatePassword('myStr0ng!Passphrase99')).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// Password hashing unit tests
// ---------------------------------------------------------------------------
describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('securePassword!1');
    expect(hash).not.toBe('securePassword!1');
    expect(await verifyPassword(hash, 'securePassword!1')).toBe(true);
    expect(await verifyPassword(hash, 'wrongPassword!1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Auth endpoint integration tests
// ---------------------------------------------------------------------------
describe('POST /api/auth/signup', () => {
  it('creates a new user and returns a session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@example.com', password: 'securePassword!1' });

    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.email).toBe('alice@example.com');

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('sid=');
    expect(cookies[0]).toContain('HttpOnly');
  });

  it('normalizes email to lowercase', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: '  Alice@Example.COM  ', password: 'securePassword!1' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects duplicate email with 409', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@example.com', password: 'securePassword!1' });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@example.com', password: 'anotherPassword!1' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
    expect(res.body.action).toBe('login');
  });

  it('rejects a weak password', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'bob@example.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('12 characters');
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: 'securePassword!1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid email');
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/signup').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@example.com', password: 'securePassword!1' });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'securePassword!1' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alice@example.com');

    const cookies = res.headers['set-cookie'];
    expect(cookies[0]).toContain('sid=');
  });

  it('returns generic error for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrongPassword!1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('returns generic error for non-existent email (no leak)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'securePassword!1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie and revokes the session', async () => {
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@example.com', password: 'securePassword!1' });

    const cookies = signupRes.headers['set-cookie'];

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookies);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe('Logged out.');

    // Session should be revoked — /me should return 401
    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);

    expect(meRes.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user when authenticated', async () => {
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@example.com', password: 'securePassword!1' });

    const cookies = signupRes.headers['set-cookie'];

    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('alice@example.com');
  });
});

describe('GET /api/health', () => {
  it('returns ok with database status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
  });
});
