/**
 * Security-headers integration test.
 *
 * Verifies that the Helmet middleware correctly sets the expected HTTP security
 * headers on every response, including error responses.
 *
 * Covers:
 *   1. X-Content-Type-Options: nosniff
 *   2. X-Frame-Options: DENY
 *   3. Content-Security-Policy includes required directives
 *   4. Referrer-Policy: strict-origin-when-cross-origin
 *   5. X-Permitted-Cross-Domain-Policies: none
 *   6. X-Request-Id is echoed on every response
 *   7. HSTS is NOT present in non-production environment
 *   8. Headers are present on 4xx and 5xx responses, not just 200s
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { securityMiddleware } from '../middleware/security.middleware.js';
import { requestIdMiddleware } from '../middleware/logging.middleware.js';
import { errorMiddleware } from '../middleware/error.middleware.js';

// ── Test app factory ──────────────────────────────────────────────────────────

function makeApp() {
  const app = express();

  // Mirror the production middleware order from index.ts
  app.use(securityMiddleware);
  app.use(requestIdMiddleware);
  app.use(express.json());

  // Happy-path route
  app.get('/ok', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  // Route that deliberately throws to trigger error middleware
  app.get('/fail', (_req: Request, _res: Response, next: NextFunction) => {
    next(new Error('Deliberate test error'));
  });

  // Route that returns a 404 explicitly
  app.get('/not-found', (_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  app.use(errorMiddleware);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Security headers — 200 response', () => {
  const app = makeApp();

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('sets X-Permitted-Cross-Domain-Policies: none', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
  });

  it('sets a Content-Security-Policy header', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('CSP includes default-src \'none\'', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('CSP includes frame-ancestors \'none\'', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('CSP includes base-uri \'self\'', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['content-security-policy']).toContain("base-uri 'self'");
  });

  it('CSP includes form-action \'self\'', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['content-security-policy']).toContain("form-action 'self'");
  });
});

describe('Security headers — HSTS behaviour', () => {
  const app = makeApp();

  it('does NOT set Strict-Transport-Security in non-production environment', async () => {
    // NODE_ENV is "test" in this context — HSTS must be absent to avoid
    // breaking local HTTP development if the flag leaks into test runs.
    const res = await request(app).get('/ok');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('Request-ID correlation header', () => {
  const app = makeApp();

  it('echoes X-Request-Id on every 200 response', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('uses the client-supplied X-Request-Id when provided', async () => {
    const clientId = 'test-correlation-id-abc123';
    const res = await request(app)
      .get('/ok')
      .set('X-Request-Id', clientId);
    expect(res.headers['x-request-id']).toBe(clientId);
  });

  it('generates a fresh UUID when no X-Request-Id is supplied', async () => {
    const res = await request(app).get('/ok');
    // UUID v4 pattern
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe('Security headers — error responses', () => {
  const app = makeApp();

  it('sets security headers on 404 responses', async () => {
    const res = await request(app).get('/not-found');
    expect(res.status).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('sets security headers on 500 responses', async () => {
    const res = await request(app).get('/fail');
    expect(res.status).toBe(500);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('includes X-Request-Id on 500 responses', async () => {
    const res = await request(app).get('/fail');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('500 error body includes the requestId for correlation', async () => {
    const res = await request(app).get('/fail');
    expect(res.status).toBe(500);
    const requestIdHeader = res.headers['x-request-id'];
    expect(res.body?.error?.requestId).toBe(requestIdHeader);
  });
});

describe('Security headers — no information leakage', () => {
  const app = makeApp();

  it('does not expose X-Powered-By header', async () => {
    const res = await request(app).get('/ok');
    // Helmet removes X-Powered-By (Express default)
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('500 response does not expose stack trace in body', async () => {
    const res = await request(app).get('/fail');
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('at ');         // no stack frames
    expect(bodyStr).not.toContain('node_modules');
    expect(bodyStr).not.toContain('Deliberate test error'); // message is hidden
  });
});
