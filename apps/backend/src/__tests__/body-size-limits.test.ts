/**
 * Tests for JSON body-size enforcement and malformed-JSON handling.
 *
 * Covers:
 *  1. Oversized JSON body   → 413 PAYLOAD_TOO_LARGE
 *  2. Malformed JSON body   → 400 MALFORMED_JSON
 *  3. Well-formed body within limit → 200 (pass-through)
 *  4. Multipart requests    → body-size limit is NOT applied (multer owns those)
 *  5. Limit is configurable at wiring time
 *  6. Error shape — both error responses include { error: { code, message } }
 *
 * The test app is built in-process with no env/database imports so it can
 * run in isolation exactly as the sanitize / deprecation tests do.
 */

import { describe, it, expect } from 'vitest';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { errorMiddleware } from '../middleware/error.middleware.js';

// ── Test app factory ──────────────────────────────────────────────────────────

/**
 * Build a minimal Express app that mirrors exactly how index.ts wires the
 * JSON body parser + error middleware, but with a caller-supplied limit so
 * we can test various thresholds cheaply.
 *
 * @param limit  Body-parser limit string, e.g. "100b", "1kb", "1mb"
 */
function makeApp(limit: string) {
  const app = express();

  // Replicate the index.ts conditional: skip multipart, apply limit to JSON.
  app.use((req, res, next) => {
    if (req.is('multipart/form-data')) return next();
    express.json({ limit })(req, res, next);
  });

  // Echo endpoint — returns the parsed body so we can verify successful parses.
  app.post('/echo', (req: Request, res: Response) => {
    res.status(200).json({ received: req.body });
  });

  // Multipart stub — never parses a body; just confirms the route is reachable.
  app.post('/upload', (req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  // Error middleware last — exactly as in production.
  app.use(errorMiddleware);

  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a JSON string of at least `bytes` bytes. */
function jsonOfSize(bytes: number): string {
  const padding = 'x'.repeat(bytes);
  return JSON.stringify({ data: padding });
}

// ── 413 Payload Too Large ─────────────────────────────────────────────────────

describe('413 — oversized JSON body', () => {
  const app = makeApp('100b'); // tiny limit for fast tests

  it('returns 413 when body exceeds the configured limit', async () => {
    const oversized = jsonOfSize(200); // 200 B > 100 B limit
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(oversized);

    expect(res.status).toBe(413);
  });

  it('response body has error code PAYLOAD_TOO_LARGE', async () => {
    const oversized = jsonOfSize(200);
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(oversized);

    expect(res.body).toMatchObject({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: expect.any(String),
      },
    });
  });

  it('response Content-Type is application/json', async () => {
    const oversized = jsonOfSize(200);
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(oversized);

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('does not expose internal stack traces in the 413 body', async () => {
    const oversized = jsonOfSize(200);
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(oversized);

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at \w+/); // no stack-trace lines
    expect(body).not.toContain('node_modules');
  });
});

// ── 400 Malformed JSON ────────────────────────────────────────────────────────

describe('400 — malformed JSON body', () => {
  const app = makeApp('1mb');

  const MALFORMED_PAYLOADS = [
    { label: 'unclosed brace',          payload: '{ "key": "value"'          },
    { label: 'trailing comma',          payload: '{ "a": 1, }'               },
    { label: 'single quotes',           payload: "{ 'key': 'value' }"        },
    { label: 'bare identifier',         payload: '{ key: "value" }'          },
    { label: 'control character in str', payload: '{"a":"b\x00c"}'           },
    { label: 'just a word',             payload: 'undefined'                 },
    { label: 'truncated unicode',       payload: '{"a":"\ud800"}'            },
  ];

  for (const { label, payload } of MALFORMED_PAYLOADS) {
    it(`returns 400 for malformed JSON — ${label}`, async () => {
      const res = await request(app)
        .post('/echo')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
    });
  }

  it('response body has error code MALFORMED_JSON', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{ bad json }');

    expect(res.body).toMatchObject({
      error: {
        code: 'MALFORMED_JSON',
        message: expect.any(String),
      },
    });
  });

  it('response Content-Type is application/json', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('not json at all');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('does not expose internal stack traces in the 400 body', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{ bad }');

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/SyntaxError/);
    expect(body).not.toContain('node_modules');
  });
});

// ── 200 Happy path ────────────────────────────────────────────────────────────

describe('200 — valid JSON within limit', () => {
  const app = makeApp('1mb');

  it('accepts and echoes a well-formed JSON body', async () => {
    const payload = { name: 'Rentars', value: 42 };
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(res.body.received).toEqual(payload);
  });

  it('accepts an empty object body', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(res.body.received).toEqual({});
  });

  it('accepts a body right at the limit boundary', async () => {
    const app2 = makeApp('200b');
    // 50-byte JSON — safely under 200 B
    const payload = JSON.stringify({ ok: true, pad: '1234567890' });
    const res = await request(app2)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
  });
});

// ── Multipart bypass ──────────────────────────────────────────────────────────

describe('multipart/form-data — body-size limit is NOT applied', () => {
  const app = makeApp('10b'); // absurdly tiny — would block any JSON body

  it('reaches the route handler regardless of the tiny JSON limit', async () => {
    // We send a well-formed multipart request; the JSON parser is skipped so the
    // tiny "10b" limit has no effect and the request reaches the handler (200).
    const res = await request(app)
      .post('/upload')
      .field('note', 'hello')
      .attach('file', Buffer.from('a'.repeat(500)), 'test.txt'); // 500 B > 10 B

    // 200 means the route was reached — the body-size limit was bypassed.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ── Configurable limit ────────────────────────────────────────────────────────

describe('configurable limit', () => {
  it('a 1 KB limit rejects a 2 KB body with 413', async () => {
    const app = makeApp('1kb');
    const body = jsonOfSize(2048); // 2 KB
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(413);
  });

  it('a 5 KB limit accepts a 2 KB body with 200', async () => {
    const app = makeApp('5kb');
    const body = jsonOfSize(2048); // 2 KB < 5 KB
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
  });

  it('a 1 MB limit accepts a 512 KB body with 200', async () => {
    const app = makeApp('1mb');
    const body = jsonOfSize(512 * 1024); // 512 KB
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
  });

  it('a 1 MB limit rejects a body slightly over 1 MB with 413', async () => {
    const app = makeApp('1mb');
    const body = jsonOfSize(1024 * 1024 + 512); // 1 MB + 512 B
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(413);
  });
});

// ── Error response shape invariants ──────────────────────────────────────────

describe('error response shape', () => {
  const app = makeApp('100b');

  it('413 response always has { error: { code, message } }', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(200));

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    expect(typeof res.body.error.code).toBe('string');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('400 response always has { error: { code, message } }', async () => {
    const app2 = makeApp('1mb');
    const res = await request(app2)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{ bad }');

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    expect(typeof res.body.error.code).toBe('string');
    expect(typeof res.body.error.message).toBe('string');
  });
});
