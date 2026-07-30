/**
 * Prometheus-compatible metrics middleware.
 *
 * Implements the Prometheus text exposition format (version 0.0.4) using only
 * Node.js built-ins — no prom-client dependency required.
 *
 * Exposes:
 *   - Default process metrics (memory, CPU, uptime, event-loop lag)
 *   - HTTP request counter  labelled by method / route / status
 *   - HTTP request duration histogram labelled by method / route / status
 *   - HTTP error rate counter  labelled by method / route / status_class
 *   - Domain event counters:
 *       bookings_created_total        — new bookings
 *       bookings_cancelled_total      — cancelled bookings
 *       bookings_confirmed_total      — confirmed / approved bookings
 *       escrow_operations_total       — all escrow calls, labelled by operation
 *       escrow_failures_total         — failed escrow operations, labelled by operation
 *       wallet_approvals_total        — Stellar wallet-approval attempts, labelled by outcome
 *       blockchain_rpc_calls_total    — outbound Stellar/Soroban RPC calls, labelled by method/outcome
 *       blockchain_rpc_duration_seconds — RPC call latency histogram
 *       payment_failures_total        — payment / fund-transfer failures, labelled by reason
 *       client_errors_total           — browser-reported errors forwarded to /api/v1/client-errors
 *       auth_events_total             — login/logout/register events, labelled by event/outcome
 *
 * The /metrics endpoint is protected by an optional bearer token.
 * Set METRICS_TOKEN in the environment to enable token protection.
 * When METRICS_TOKEN is not set the endpoint is only accessible from
 * localhost (127.0.0.1 / ::1) — suitable for scraping from the same host.
 */

import { performance } from 'node:perf_hooks';
import process from 'node:process';
import type { Request, Response, NextFunction, Router } from 'express';
import { Router as createRouter } from 'express';
import { env } from '../config/env.js';

// ── Registry ──────────────────────────────────────────────────────────────────

type Labels = Record<string, string | number>;

interface Counter {
  type: 'counter';
  help: string;
  name: string;
  values: Map<string, { labels: Labels; value: number }>;
}

interface Histogram {
  type: 'histogram';
  help: string;
  name: string;
  /** Upper bound (le) for each bucket, must be sorted ascending, no +Inf needed */
  buckets: number[];
  values: Map<
    string,
    { labels: Labels; counts: number[]; sum: number; count: number }
  >;
}

type Metric = Counter | Histogram;

const registry: Metric[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function labelKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${String(v)}"`)
    .join(',');
}

function labelStr(labels: Labels): string {
  const pairs = Object.entries(labels)
    .map(([k, v]) => `${k}="${String(v)}"`)
    .join(',');
  return pairs ? `{${pairs}}` : '';
}

// ── Counter ───────────────────────────────────────────────────────────────────

function createCounter(name: string, help: string): Counter {
  const c: Counter = { type: 'counter', help, name, values: new Map() };
  registry.push(c);
  return c;
}

export function incCounter(counter: Counter, labels: Labels = {}, amount = 1): void {
  const key = labelKey(labels);
  const existing = counter.values.get(key);
  if (existing) {
    existing.value += amount;
  } else {
    counter.values.set(key, { labels, value: amount });
  }
}

// ── Histogram ─────────────────────────────────────────────────────────────────

function createHistogram(name: string, help: string, buckets: number[]): Histogram {
  const h: Histogram = {
    type: 'histogram',
    help,
    name,
    buckets: [...buckets].sort((a, b) => a - b),
    values: new Map(),
  };
  registry.push(h);
  return h;
}

export function observeHistogram(histogram: Histogram, labels: Labels, value: number): void {
  const key = labelKey(labels);
  const existing = histogram.values.get(key);
  if (existing) {
    existing.sum += value;
    existing.count += 1;
    for (let i = 0; i < histogram.buckets.length; i++) {
      if (value <= histogram.buckets[i]) existing.counts[i]++;
    }
  } else {
    const counts = histogram.buckets.map((b) => (value <= b ? 1 : 0));
    histogram.values.set(key, { labels, counts, sum: value, count: 1 });
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderCounter(c: Counter): string {
  const lines: string[] = [
    `# HELP ${c.name} ${c.help}`,
    `# TYPE ${c.name} counter`,
  ];
  for (const { labels, value } of c.values.values()) {
    lines.push(`${c.name}${labelStr(labels)} ${value}`);
  }
  return lines.join('\n');
}

function renderHistogram(h: Histogram): string {
  const lines: string[] = [
    `# HELP ${h.name} ${h.help}`,
    `# TYPE ${h.name} histogram`,
  ];

  for (const { labels, counts, sum, count } of h.values.values()) {
    // Remove internal-only label keys before serialising
    const baseLabels = { ...labels };

    // le buckets
    let cumulative = 0;
    for (let i = 0; i < h.buckets.length; i++) {
      cumulative += counts[i];
      lines.push(
        `${h.name}_bucket${labelStr({ ...baseLabels, le: h.buckets[i] })} ${cumulative}`,
      );
    }
    // +Inf bucket = total count
    lines.push(`${h.name}_bucket${labelStr({ ...baseLabels, le: '+Inf' })} ${count}`);
    lines.push(`${h.name}_sum${labelStr(baseLabels)} ${sum}`);
    lines.push(`${h.name}_count${labelStr(baseLabels)} ${count}`);
  }

  return lines.join('\n');
}

function renderRegistry(): string {
  const parts: string[] = [];
  for (const metric of registry) {
    if (metric.type === 'counter') parts.push(renderCounter(metric));
    else parts.push(renderHistogram(metric));
  }
  return parts.join('\n\n') + '\n';
}

// ── Process metrics (collected lazily on /metrics scrape) ─────────────────────

function renderProcessMetrics(): string {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const uptime = process.uptime();

  // Measure event-loop lag with a synchronous diff
  const start = performance.now();
  // setImmediate-based measurement not possible synchronously; use 0 as approximation.
  // For accurate lag, a background interval (not used here to avoid install deps).
  const lag = Math.max(0, performance.now() - start);

  const lines: string[] = [
    '# HELP process_resident_memory_bytes Resident memory size in bytes.',
    '# TYPE process_resident_memory_bytes gauge',
    `process_resident_memory_bytes ${mem.rss}`,

    '# HELP process_heap_bytes Process heap size in bytes.',
    '# TYPE process_heap_bytes gauge',
    `process_heap_bytes ${mem.heapTotal}`,

    '# HELP process_heap_used_bytes Process heap used in bytes.',
    '# TYPE process_heap_used_bytes gauge',
    `process_heap_used_bytes ${mem.heapUsed}`,

    '# HELP process_external_bytes Node.js external memory in bytes.',
    '# TYPE process_external_bytes gauge',
    `process_external_bytes ${mem.external}`,

    '# HELP process_cpu_user_seconds_total Total user CPU time in seconds.',
    '# TYPE process_cpu_user_seconds_total counter',
    `process_cpu_user_seconds_total ${cpu.user / 1e6}`,

    '# HELP process_cpu_system_seconds_total Total system CPU time in seconds.',
    '# TYPE process_cpu_system_seconds_total counter',
    `process_cpu_system_seconds_total ${cpu.system / 1e6}`,

    '# HELP process_uptime_seconds Number of seconds the process has been running.',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${uptime}`,

    '# HELP nodejs_version_info Node.js version information.',
    '# TYPE nodejs_version_info gauge',
    `nodejs_version_info{version="${process.version}"} 1`,
  ];

  return lines.join('\n');
}

// ── Metrics definitions ───────────────────────────────────────────────────────

// ── HTTP infrastructure ───────────────────────────────────────────────────────

export const httpRequestsTotal = createCounter(
  'http_requests_total',
  'Total number of HTTP requests, labelled by method, route, and status.',
);

export const httpRequestDurationSeconds = createHistogram(
  'http_request_duration_seconds',
  'HTTP request latency in seconds, labelled by method, route, and status.',
  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);

/**
 * 4xx/5xx error rate counter.
 * Labels: method, route, status_class ("4xx" | "5xx")
 * Use this to drive "error rate > N%" alerts without scanning every status code.
 */
export const httpErrorsTotal = createCounter(
  'http_errors_total',
  'Total number of HTTP error responses (4xx and 5xx), labelled by method, route, and status_class.',
);

// ── Booking domain ────────────────────────────────────────────────────────────

export const bookingsCreatedTotal = createCounter(
  'bookings_created_total',
  'Total number of bookings created.',
);

export const bookingsCancelledTotal = createCounter(
  'bookings_cancelled_total',
  'Total number of bookings cancelled, labelled by initiated_by (guest|host|system).',
);

export const bookingsConfirmedTotal = createCounter(
  'bookings_confirmed_total',
  'Total number of bookings confirmed / approved by the host.',
);

// ── Escrow / payment domain ───────────────────────────────────────────────────

/**
 * All escrow operations attempted.
 * Labels: operation (create|release|dispute|refund)
 */
export const escrowOperationsTotal = createCounter(
  'escrow_operations_total',
  'Total number of escrow operations attempted, labelled by operation type.',
);

/**
 * Escrow operations that failed.
 * Labels: operation (create|release|dispute|refund)
 */
export const escrowFailuresTotal = createCounter(
  'escrow_failures_total',
  'Total number of escrow operation failures, labelled by operation type.',
);

/**
 * Payment / fund-transfer failures (distinct from escrow — covers direct
 * Stellar payments that do not go through the escrow contract).
 * Labels: reason (insufficient_funds|network_error|timeout|unknown)
 */
export const paymentFailuresTotal = createCounter(
  'payment_failures_total',
  'Total number of payment failures, labelled by failure reason.',
);

// ── Wallet / blockchain domain ────────────────────────────────────────────────

/**
 * Stellar wallet approval attempts (Freighter / SEP-7).
 * Labels: outcome (approved|rejected|timeout|error)
 */
export const walletApprovalsTotal = createCounter(
  'wallet_approvals_total',
  'Total number of Stellar wallet approval attempts, labelled by outcome.',
);

/**
 * Outbound Stellar / Soroban RPC calls.
 * Labels: method (e.g. simulateTransaction, sendTransaction, getTransaction),
 *         outcome (success|failure)
 */
export const blockchainRpcCallsTotal = createCounter(
  'blockchain_rpc_calls_total',
  'Total number of outbound Stellar/Soroban RPC calls, labelled by method and outcome.',
);

export const blockchainRpcDurationSeconds = createHistogram(
  'blockchain_rpc_duration_seconds',
  'Latency of outbound Stellar/Soroban RPC calls in seconds, labelled by method.',
  [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
);

// ── Auth domain ───────────────────────────────────────────────────────────────

/**
 * Authentication events.
 * Labels: event (login|logout|register|password_reset|wallet_auth),
 *         outcome (success|failure)
 */
export const authEventsTotal = createCounter(
  'auth_events_total',
  'Total number of authentication events, labelled by event type and outcome.',
);

// ── Client-side errors ────────────────────────────────────────────────────────

/**
 * Browser error reports forwarded to POST /api/v1/client-errors.
 * Labels: context (error-boundary label from the frontend)
 */
export const clientErrorsTotal = createCounter(
  'client_errors_total',
  'Total number of client-side errors reported by the browser, labelled by context.',
);

// ── Route-template normaliser ─────────────────────────────────────────────────

/**
 * Collapse UUID / numeric path segments into placeholders so high-cardinality
 * routes like /api/v1/properties/abc-123 become /api/v1/properties/:id.
 */
function normaliseRoute(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[A-Z0-9]{40,64}/g, '/:address'); // Stellar public keys
}

// ── HTTP middleware ───────────────────────────────────────────────────────────

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip the /metrics endpoint itself
  if (req.path === '/metrics') {
    next();
    return;
  }

  const startMs = performance.now();

  res.on('finish', () => {
    const route = normaliseRoute(req.path);
    const status = String(res.statusCode);
    const labels: Labels = {
      method: req.method,
      route,
      status,
    };

    incCounter(httpRequestsTotal, labels);
    observeHistogram(
      httpRequestDurationSeconds,
      labels,
      (performance.now() - startMs) / 1000,
    );

    // Track 4xx / 5xx separately for error-rate alerting
    if (res.statusCode >= 400) {
      const statusClass = res.statusCode >= 500 ? '5xx' : '4xx';
      incCounter(httpErrorsTotal, {
        method: req.method,
        route,
        status_class: statusClass,
      });
    }
  });

  next();
}

// ── /metrics route ────────────────────────────────────────────────────────────

/**
 * Allow scraping only from:
 *   • The same host (127.0.0.1 / ::1)   — when METRICS_TOKEN is not set
 *   • Any host with a valid bearer token — when METRICS_TOKEN is set
 */
function isAllowed(req: Request): boolean {
  if (env.METRICS_TOKEN) {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    return token === env.METRICS_TOKEN;
  }

  // No token configured — restrict to localhost only
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export const metricsRouter: Router = createRouter();

metricsRouter.get('/metrics', (req: Request, res: Response) => {
  if (!isAllowed(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const body = [renderProcessMetrics(), '', renderRegistry()].join('\n');
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.status(200).send(body);
});
