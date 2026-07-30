/**
 * Environment configuration — single source of truth for all env vars.
 *
 * Validates every variable at module-load time using Zod.
 * On failure, all problems are logged at once and the process exits with code 1.
 * On success, exports a typed, frozen `env` object that replaces all
 * direct `process.env` reads throughout the codebase.
 */

import { z } from 'zod';

// ── Schema ────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // ── Server ─────────────────────────────────────────────────────────────────
  PORT: z
    .string()
    .default('3000')
    .transform((v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('PORT must be 1–65535');
      return n;
    }),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // ── Supabase (required) ────────────────────────────────────────────────────
  SUPABASE_URL: z
    .string()
    .url('SUPABASE_URL must be a valid URL'),

  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  // ── Auth (required) ────────────────────────────────────────────────────────
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for security'),

  // ── CORS ───────────────────────────────────────────────────────────────────
  // Comma-separated list of allowed origins for credentialed requests.
  // Wildcards ('*') are rejected at startup — credentialed CORS requires
  // explicit origins.  Example: "https://app.rentars.com,https://www.rentars.com"
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3001')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean))
    .refine(
      (origins) =>
        origins.length > 0 && origins.every((o) => o !== '*'),
      'CORS_ORIGIN must not be a wildcard — list explicit origins for credentialed requests',
    ),

  // ── Redis (optional) ───────────────────────────────────────────────────────
  REDIS_URL: z.string().url().optional(),

  // ── Stellar / Soroban ─────────────────────────────────────────────────────
  STELLAR_NETWORK: z
    .enum(['testnet', 'mainnet'])
    .default('testnet'),

  STELLAR_RPC_URL: z.string().url().optional(),

  PROPERTY_LISTING_CONTRACT_ID: z.string().optional(),
  BOOKING_CONTRACT_ID: z.string().optional(),

  // ── Trustless Work (escrow) ────────────────────────────────────────────────
  TRUSTLESS_WORK_API_URL: z.string().url().optional(),
  TRUSTLESS_WORK_API_KEY: z.string().optional(),

  // ── Geocoding ─────────────────────────────────────────────────────────────
  GEOCODING_API_KEY: z.string().optional(),
  // hCaptcha bot protection (set HCAPTCHA_ENABLED=false to bypass in dev)
  HCAPTCHA_SECRET_KEY: z.string().optional(),
  HCAPTCHA_ENABLED: z.string().optional(),

  // ── Body size limits ───────────────────────────────────────────────────────
  // Maximum size for JSON request bodies (Express body-parser format: "1mb", "512kb", etc.)
  // Upload routes (multipart/form-data) are governed by multer limits, not this value.
  JSON_BODY_LIMIT: z.string().default('1mb'),

  // ── Observability ─────────────────────────────────────────────────────────
  // Minimum log level: debug | info | warn | error  (default: info)
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),

  // Bearer token required to scrape /metrics.
  // When unset the endpoint is restricted to localhost only.
  METRICS_TOKEN: z.string().optional(),

  // ── Security headers ──────────────────────────────────────────────────────
  // Set to "true" to force-enable HSTS even outside NODE_ENV=production.
  // Useful when running behind a TLS-terminating proxy in staging.
  HSTS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

// ── Type export ───────────────────────────────────────────────────────────────

export type Environment = z.infer<typeof envSchema>;

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Parse and validate all environment variables.
 * Logs every problem aggregated together, then exits with code 1 so the
 * container/process doesn't start in a broken state.
 */
function validateEnv(): Environment {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const lines: string[] = ['', '❌  Environment validation failed — fix the issues below before starting the server:', ''];

    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      lines.push(`  • ${path}: ${issue.message}`);
    }

    lines.push('');
    console.error(lines.join('\n'));
    process.exit(1);
  }

  // Freeze so accidental mutation is caught at runtime
  return Object.freeze(result.data) as Environment;
}

export const env: Readonly<Environment> = validateEnv();
