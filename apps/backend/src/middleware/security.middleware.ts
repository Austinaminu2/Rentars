/**
 * Security headers middleware.
 *
 * Uses Helmet to set a hardened set of HTTP response headers.
 * Configuration is environment-aware:
 *   - HSTS is only enabled in production (avoids breaking local HTTP dev)
 *   - CSP is tuned for a JSON API (+ Swagger UI assets on /docs)
 *   - All other headers use Helmet's secure defaults
 *
 * Mount this as the FIRST middleware in the Express chain so every
 * response — including error responses — carries the correct headers.
 */

import helmet from 'helmet';
import { env } from '../config/env.js';

const hstsEnabled = env.NODE_ENV === 'production' || env.HSTS_ENABLED === true;

/**
 * Content-Security-Policy directives for a JSON REST API.
 *
 * default-src 'none'   — deny everything not explicitly allowed
 * script-src  'self'   — Swagger UI bundles its own JS; allow only same-origin
 * style-src   'self' 'unsafe-inline'  — Swagger UI injects inline styles
 * img-src     'self' data:            — Swagger UI uses data-URI favicons
 * font-src    'self'                  — Swagger UI self-hosted fonts
 * connect-src 'self'                  — XHR/Fetch from Swagger "Try it out"
 * frame-ancestors 'none'             — no embedding in iframes
 * base-uri    'self'                  — prevent base-tag injection
 * form-action 'self'                  — prevent cross-origin form hijacking
 */
const CSP_DIRECTIVES = {
  defaultSrc: ["'none'"],
  scriptSrc:  ["'self'"],
  styleSrc:   ["'self'", "'unsafe-inline'"],
  imgSrc:     ["'self'", 'data:'],
  fontSrc:    ["'self'"],
  connectSrc: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri:    ["'self'"],
  formAction: ["'self'"],
};

export const securityMiddleware = helmet({
  // ── Content-Security-Policy ───────────────────────────────────────────────
  contentSecurityPolicy: {
    useDefaults: false,
    directives: CSP_DIRECTIVES,
  },

  // ── HTTP Strict-Transport-Security ────────────────────────────────────────
  // Only enabled in production (or when HSTS_ENABLED=true) — local development
  // runs over plain HTTP and a premature HSTS pin would break it permanently.
  hsts: hstsEnabled
    ? {
        maxAge: 31_536_000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      }
    : false,

  // ── X-Content-Type-Options ────────────────────────────────────────────────
  // "nosniff" — prevents browsers from MIME-sniffing away from the declared type.
  // Helmet enables this by default; listed here for explicitness.
  noSniff: true,

  // ── Referrer-Policy ───────────────────────────────────────────────────────
  // "strict-origin-when-cross-origin" — sends origin for same-origin,
  // only origin for cross-origin HTTPS→HTTPS, nothing for cross-origin HTTPS→HTTP.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // ── X-Frame-Options ───────────────────────────────────────────────────────
  // Belt-and-suspenders alongside frame-ancestors CSP directive.
  frameguard: { action: 'deny' },

  // ── X-XSS-Protection ─────────────────────────────────────────────────────
  // The header is largely obsolete in modern browsers but harmless.
  // Set to "0" per OWASP guidance — the built-in XSS auditor can introduce
  // its own vulnerabilities.
  xssFilter: false, // Helmet default disables the legacy header (sets "0")

  // ── X-Permitted-Cross-Domain-Policies ────────────────────────────────────
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },

  // ── Cross-Origin-Embedder/Opener/Resource policies ───────────────────────
  // Not required for a pure JSON API, but left at Helmet defaults.
  crossOriginEmbedderPolicy: false, // would break Swagger UI CDN assets if ever added
});
