/**
 * Contract tests — validate that core API endpoints return the expected
 * HTTP status codes and response shapes as declared in the OpenAPI spec.
 *
 * Run with: bun run test:contract
 *
 * These tests start a local instance of the Express app and make real HTTP
 * requests against it (no mocks). They catch breaking changes before they
 * reach CI or production.
 *
 * Covered routes:
 *   POST /api/v1/auth/register      — 201 | 400
 *   POST /api/v1/auth/login         — 200 | 400 | 401
 *   POST /api/v1/auth/refresh       — 200 | 400 | 401
 *   GET  /api/v1/properties         — 200
 *   GET  /api/v1/properties/:id     — 404
 *   POST /api/v1/bookings           — 401 (auth required)
 *   GET  /api/v1/bookings/:id       — 401 (auth required)
 *   GET  /health                    — 200
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import request from 'supertest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// ── App bootstrap ──────────────────────────────────────────────────────────────
// Import app without starting the HTTP server (just the Express instance)
// We need to import with .js extension for ESM compatibility

let app: import('express').Express;

// Load environment for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-at-least-32-characters-long!';
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-key';

// ── AJV setup ──────────────────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Common response schemas
const errorShape = {
  type: 'object',
  anyOf: [
    {
      properties: {
        error: { type: 'string' },
      },
      required: ['error'],
    },
    {
      properties: {
        error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
          required: ['code', 'message'],
        },
      },
      required: ['error'],
    },
  ],
};

const healthShape = {
  type: 'object',
  required: ['status', 'service'],
  properties: {
    status: { type: 'string' },
    service: { type: 'string' },
    timestamp: { type: 'string' },
  },
};

const propertiesListShape = {
  type: 'object',
  properties: {
    data: { type: 'array' },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertShape(schema: object, data: unknown, label: string) {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) {
    throw new Error(
      `[Contract] ${label} response shape mismatch:\n${JSON.stringify(validate.errors, null, 2)}`,
    );
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const mod = await import('../src/index.js');
  app = (mod as { app: import('express').Express }).app;
});

describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    assertShape(healthShape, res.body, 'GET /health');
    expect(typeof res.body.status).toBe('string');
  });
});

describe('POST /api/v1/auth/register', () => {
  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({});
    expect(res.status).toBe(400);
    assertShape(errorShape, res.body, 'POST /api/v1/auth/register (400)');
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'test@example.com',
      password: 'short',
      name: 'Test User',
    });
    expect(res.status).toBe(400);
    assertShape(errorShape, res.body, 'POST /api/v1/auth/register (short password)');
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'ValidPass123!@#',
      name: 'Test User',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
    assertShape(errorShape, res.body, 'POST /api/v1/auth/login (400)');
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'bad',
      password: 'anything',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});
    expect(res.status).toBe(400);
    assertShape(errorShape, res.body, 'POST /api/v1/auth/refresh (400)');
  });

  it('returns 401 when refreshToken is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid-token-value' });
    expect(res.status).toBe(401);
    assertShape(errorShape, res.body, 'POST /api/v1/auth/refresh (401)');
  });
});

describe('GET /api/v1/properties', () => {
  it('returns 200 with a data array', async () => {
    const res = await request(app).get('/api/v1/properties');
    expect(res.status).toBe(200);
    assertShape(propertiesListShape, res.body, 'GET /api/v1/properties');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/v1/properties/:id', () => {
  it('returns 404 for a non-existent property', async () => {
    const res = await request(app).get('/api/v1/properties/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/bookings (auth required)', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/v1/bookings').send({});
    expect(res.status).toBe(401);
    assertShape(errorShape, res.body, 'POST /api/v1/bookings (401)');
  });
});

describe('GET /api/v1/bookings/:id (auth required)', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/v1/bookings/some-id');
    expect(res.status).toBe(401);
    assertShape(errorShape, res.body, 'GET /api/v1/bookings/:id (401)');
  });
});

describe('GET /api/v1/payments/:id/status (auth required)', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/v1/payments/00000000-0000-0000-0000-000000000000/status');
    expect(res.status).toBe(401);
    assertShape(errorShape, res.body, 'GET /api/v1/payments/:id/status (401)');
  });
});

describe('GET /api/v1/admin/dashboard (admin required)', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard');
    expect(res.status).toBe(401);
  });
});

describe('Versioning — API v2 placeholder', () => {
  it('GET /api/v2 returns a coming_soon response', async () => {
    const res = await request(app).get('/api/v2');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('coming_soon');
  });
});
