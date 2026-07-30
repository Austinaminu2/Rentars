# Rentars Backend — Operational Runbooks

This document covers first-response procedures for the most common production incidents.  
Each runbook follows the same structure: **Symptoms → Verify → Immediate actions → Root-cause investigation → Resolution → Prevention**.

---

## Table of Contents

1. [API Outage / Service Down](#1-api-outage--service-down)
2. [High Error Rate (5xx spike)](#2-high-error-rate-5xx-spike)
3. [Payment / Escrow Failure](#3-payment--escrow-failure)
4. [Blockchain / Stellar RPC Connection Issues](#4-blockchain--stellar-rpc-connection-issues)
5. [Authentication Failures (401/403 spike)](#5-authentication-failures-401403-spike)
6. [Database Connectivity Issues](#6-database-connectivity-issues)
7. [Rate-Limit Flood (429 spike)](#7-rate-limit-flood-429-spike)
8. [High Latency / Slow Requests](#8-high-latency--slow-requests)
9. [Frontend Error Boundary Flood](#9-frontend-error-boundary-flood)
10. [Memory or CPU Exhaustion](#10-memory-or-cpu-exhaustion)

---

## 1. API Outage / Service Down

### Symptoms
- Health check at `GET /health` returns non-200 or times out.
- Load balancer marks all instances unhealthy.
- All API clients receive connection refused or 503.

### Verify
```bash
# From within the same network / VPC
curl -sf http://localhost:3000/health | jq .

# Check process status
ps aux | grep node

# Check recent crash logs
journalctl -u rentars-api -n 100 --no-pager
# or in Docker:
docker logs rentars-api --tail 100
```

### Immediate actions
1. Restart the process: `systemctl restart rentars-api` or `docker restart rentars-api`.
2. If it crashes immediately, look for the startup error in logs — most commonly a missing env var (`env.ts` logs all failures before `process.exit(1)`).
3. If env vars are correct, check whether Supabase / Redis is reachable (see [Database runbook](#6-database-connectivity-issues)).

### Root-cause investigation
- Search structured logs for `"level":"error"` entries in the crash window.
- Look for `"message":"Fatal startup error"` or `"Blockchain configuration validation failed"`.
- Correlate with any recent deploys or config changes.

### Resolution
- Fix the root cause (missing env var, bad config, dependency outage).
- Re-deploy or restart.

### Prevention
- Add a pre-deploy smoke test: `curl /health` must return 200 before traffic is shifted.
- Keep `SUPABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN` in a secrets manager, not baked into images.

---

## 2. High Error Rate (5xx spike)

### Symptoms
- `http_errors_total{status_class="5xx"}` rising sharply on the `/metrics` dashboard.
- Alerts firing on `error_rate > 1%` threshold.

### Verify
```bash
# Query metrics endpoint (requires METRICS_TOKEN or localhost access)
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics \
  | grep http_errors_total

# Find the top failing routes in logs (last 15 minutes)
journalctl -u rentars-api --since "15 min ago" \
  | grep '"level":"error"' | jq -r '.path' | sort | uniq -c | sort -rn | head 10
```

### Immediate actions
1. Identify the failing route(s) from metrics labels (`method`, `route`).
2. Check if it is a single route or global.  A global spike usually means an infrastructure change (bad deploy, DB outage).
3. If a single route: look for the `requestId` in the error log entry and trace the full request.

### Root-cause investigation
- Structured error logs include `errorCode`, `errorMessage`, `requestId`, `stack` (5xx only).
- Cross-reference `requestId` in the access log to get the full HTTP context.
- Check whether the error correlates with a recent deploy, config change, or Supabase migration.

### Resolution
- Rollback the last deploy if the spike started at deploy time.
- If a DB migration caused it, apply a fix-forward migration.
- Hotfix the code if a specific handler is throwing unexpectedly.

### Prevention
- Canary deployments — shift 5% of traffic first and watch error rate before promoting.
- Add a test for the affected code path.

---

## 3. Payment / Escrow Failure

### Symptoms
- `escrow_failures_total` or `payment_failures_total` counters rising.
- Users reporting "payment failed" or bookings stuck in `pending` state.
- Alerts on `escrow_failures_total > N` in a rolling window.

### Verify
```bash
# Check escrow failure metrics
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics \
  | grep -E "escrow_failures_total|payment_failures_total"

# Find affected bookings in the database
# (run in Supabase SQL editor)
SELECT id, status, escrow_id, created_at
FROM bookings
WHERE status = 'pending' AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Immediate actions
1. Check `blockchain_logs` table for `operation = 'escrow_create'` or `'escrow_release'` with non-null `error_message`.
2. Check `TRUSTLESS_WORK_API_URL` is reachable: `curl -sf $TRUSTLESS_WORK_API_URL/health`.
3. Check Stellar network status at https://dashboard.stellar.org.

### Root-cause investigation
- Search structured logs for `"errorCode":"ESCROW_FAILED"` or `"ESCROW_CREATION_FAILED"`.
- Each log entry includes `requestId` — use it to find the originating booking request in the access log.
- Check whether the Stellar account has sufficient XLM for transaction fees.
- Check whether the Trustless Work API key is valid and not expired.

### Resolution
- If Trustless Work API is down: communicate to users, retry failed bookings once the service recovers.
- If Stellar network is congested: increase transaction fee multiplier via `STELLAR_BASE_FEE` env var.
- If account is out of XLM: top up the platform Stellar account.
- Manually re-trigger escrow for stuck bookings via the admin panel or a targeted DB update + re-submission.

### Prevention
- Alert on `escrow_failures_total > 5 in 5m`.
- Implement automatic retry with exponential backoff in the escrow service.
- Monitor Stellar account balance via a scheduled job.

---

## 4. Blockchain / Stellar RPC Connection Issues

### Symptoms
- `blockchain_rpc_calls_total{outcome="failure"}` rising.
- `blockchain_rpc_duration_seconds` p99 > 10 s.
- Wallet approval requests timing out.

### Verify
```bash
# Test RPC connectivity directly
curl -sf "$STELLAR_RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":{}}' | jq .

# Check wallet approval metrics
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics \
  | grep wallet_approvals_total
```

### Immediate actions
1. If the configured RPC endpoint is unhealthy, switch `STELLAR_RPC_URL` to a backup endpoint (e.g. Horizon fallback) and restart.
2. Disable blockchain-dependent features with a feature flag if available.
3. Queue new escrow transactions for retry rather than failing them immediately.

### Root-cause investigation
- Check https://status.stellar.org for network-wide incidents.
- Check logs for `"blockchain_rpc"` entries with `"outcome":"failure"` and the specific RPC method.
- Correlate the `blockchainRpcDurationSeconds` histogram — sustained high latency before failures often indicates network degradation rather than a hard outage.

### Resolution
- Network outage: wait for Stellar network recovery; retry queued transactions.
- RPC provider issue: rotate to an alternative endpoint (Ankr, QuickNode, or self-hosted Stellar Core).
- Code bug: check recent changes to `src/blockchain/` and roll back if necessary.

### Prevention
- Configure at least one fallback RPC URL.
- Alert on `blockchain_rpc_calls_total{outcome="failure"} > 3 in 1m`.
- Run the Stellar node health check in `/health` endpoint (already wired in `routes/index.ts`).

---

## 5. Authentication Failures (401/403 spike)

### Symptoms
- `auth_events_total{event="login",outcome="failure"}` rising.
- `http_errors_total{status_class="4xx"}` spike concentrated on `/api/v1/auth/*`.
- Users reporting they cannot log in.

### Verify
```bash
# Check auth failure metrics
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics \
  | grep auth_events_total

# Check for rate-limit rejections (users may be locked out)
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics \
  | grep http_errors_total | grep auth
```

### Immediate actions
1. Check whether `JWT_SECRET` has changed (a rotation without a rolling deployment causes all existing tokens to become invalid immediately).
2. Check whether Supabase auth is healthy: `GET /health` → `checks.database`.
3. If users are rate-limited, check `src/middleware/rateLimiter.ts` thresholds.

### Root-cause investigation
- Structured logs at `"level":"warn"` on `/api/v1/auth/*` include `requestId`, `userId` (if known), `errorCode`.
- `securityLogger.logAuthEvent` entries in the `security_logs` table capture `login_failure` with metadata.
- A sudden spike often means either a credential-stuffing attack (check for many distinct IPs hitting auth) or a platform-wide token expiry.

### Resolution
- Credential stuffing: increase rate-limit points on `authLimiter`, consider adding CAPTCHA or geo-blocking.
- JWT secret rotation: coordinate with a rolling deploy that accepts both old and new tokens during transition.
- Supabase issue: follow the [Database runbook](#6-database-connectivity-issues).

### Prevention
- Alert on `auth_events_total{outcome="failure"} > 50 in 5m`.
- Enable hCaptcha in production (`HCAPTCHA_ENABLED=true`).
- Store JWT secret in a secrets manager; use versioned secrets for zero-downtime rotation.

---

## 6. Database Connectivity Issues

### Symptoms
- `GET /health` returns `checks.database: "error"`.
- 500 errors across all routes that touch the database.
- Logs contain `"Failed to log blockchain operation"` or Supabase client errors.

### Verify
```bash
# Health check
curl -sf http://localhost:3000/health | jq .checks

# Check Supabase status
curl -sf "$SUPABASE_URL/rest/v1/" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" | head -c 200
```

### Immediate actions
1. Check https://status.supabase.com for platform-wide incidents.
2. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct and not expired.
3. Check connection pool limits — Supabase free-tier projects have a low concurrent connection cap.

### Root-cause investigation
- All DB errors bubble up through the service layer and are structured-logged at `"level":"error"`.
- Look for `pgError` or `PGRST` codes in the log entries.
- Check whether a recent migration introduced a breaking schema change.

### Resolution
- Service outage: wait for Supabase recovery; read-only degraded mode may be possible for some endpoints.
- Connection pool exhaustion: reduce `SUPABASE_POOL_SIZE` or upgrade the Supabase plan.
- Migration rollback: run a reverse migration SQL in the Supabase SQL editor.

### Prevention
- Monitor `GET /health` on a 30-second interval; alert if `checks.database != "ok"` for > 1 minute.
- Use Supabase connection pooling (pgBouncer) for high-traffic deployments.

---

## 7. Rate-Limit Flood (429 spike)

### Symptoms
- `http_errors_total{status_class="4xx"}` spike, specifically 429 responses.
- Legitimate users complaining they are blocked.
- `rate_limit_exceeded` entries in `blockchain_logs`.

### Verify
```bash
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics \
  | grep http_errors_total | grep 429
```

### Immediate actions
1. Determine whether this is an attack (many distinct users hitting the same route) or a configuration problem (limits are too tight).
2. If an attack: check upstream firewall / WAF rules; consider temporarily blocking the source IP range.
3. If misconfiguration: temporarily increase the threshold in `rateLimiter.ts`, deploy hotfix.

### Root-cause investigation
- `rateLimitStore.service.ts` records hashed identities and routes.  Query it to find which route/IP pattern is being hit.
- Structured logs include `scope`, `route`, `method` for every rate-limit rejection.

### Resolution
- Attack: block at the CDN/WAF layer; do not rely solely on application-level limiting.
- Legitimate traffic spike: raise limits in `rateLimiter.ts`; consider separating per-user vs per-IP limiting.

### Prevention
- Set up CDN-level rate limiting as the first line of defence.
- Alert on a sudden spike of 429s that doesn't coincide with a known traffic event.

---

## 8. High Latency / Slow Requests

### Symptoms
- `http_request_duration_seconds` p99 > 2 s.
- Users reporting slow page loads or booking timeouts.
- `REQUEST_TIMEOUT` errors appearing in logs.

### Verify
```bash
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics \
  | grep http_request_duration_seconds_bucket | grep -v "^#"
```

### Immediate actions
1. Check which routes are slow (look at the `route` label on the histogram).
2. Check `process_heap_used_bytes` — if near `process_heap_bytes`, a GC pause may be causing latency.
3. Check whether Supabase query latency has increased.

### Root-cause investigation
- Slow routes often involve N+1 queries or missing indexes.  Check the Supabase query performance dashboard.
- `blockchain_rpc_duration_seconds` — if blockchain calls are slow, that will cascade to booking/escrow routes.
- Check whether the event loop is saturated: `process_uptime_seconds` growing faster than wall time is a warning sign.

### Resolution
- Add a missing database index (follow the migration naming convention in `database/MIGRATIONS_NAMING.md`).
- Introduce result caching in `cache.service.ts` for hot read paths.
- Increase the timeout threshold in `timeoutMiddleware` as a temporary measure while the root cause is fixed.

### Prevention
- Add p99 latency alerts: `http_request_duration_seconds{le="2"}` rate below threshold.
- Run `EXPLAIN ANALYZE` on slow queries in staging before deploying schema changes.

---

## 9. Frontend Error Boundary Flood

### Symptoms
- `client_errors_total` counter rising sharply.
- `POST /api/v1/client-errors` volume spike visible in `http_requests_total`.
- Users seeing the "Something went wrong" error page repeatedly.

### Verify
```bash
# Check client error counter
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics \
  | grep client_errors_total

# Find recent client error reports in blockchain_logs
# (Supabase SQL editor)
SELECT operation, input_json, error_message, created_at
FROM blockchain_logs
WHERE operation = 'client_error'
  AND created_at > NOW() - INTERVAL '30 minutes'
ORDER BY created_at DESC
LIMIT 50;
```

### Root-cause investigation
- Each client error report includes `context` (the error boundary label), `href` (page URL), `correlationId` (the backend request-ID that preceded the error).
- Use the `correlationId` to find the server-side log entry: search structured logs for `"requestId":"<id>"`.
- The `context` label identifies which part of the UI is failing (e.g. `"booking-form"`, `"global-error-boundary"`).

### Resolution
- A specific context label flooding: deploy a hotfix for that component.
- Global-error-boundary flooding: likely a shared dependency or a bad API response shape — check recent deploys and API changes.
- If caused by a backend change, roll back the backend deploy first.

### Prevention
- Alert on `client_errors_total > 20 in 5m`.
- Add error boundary tests for critical flows (booking, checkout, auth).
- Use the `correlationId` in the frontend support flow so users can provide it to support.

---

## 10. Memory or CPU Exhaustion

### Symptoms
- `process_heap_used_bytes` near or equal to `process_heap_bytes`.
- `process_cpu_user_seconds_total` growing faster than expected.
- OOM kills in container logs.
- Increasing response latency preceding a crash.

### Verify
```bash
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics \
  | grep -E "process_heap|process_cpu|process_resident"
```

### Immediate actions
1. Restart the process to clear the immediate pressure.
2. Increase container memory limit as a temporary measure.
3. Check for a memory-leak pattern: heap growing monotonically between GC cycles.

### Root-cause investigation
- A flat heap-used line that suddenly spikes usually means a large in-memory operation (e.g. loading a full table into memory).
- A gradual heap growth over hours is a leak — look for caches without eviction, event-listener accumulation, or circular references.
- High CPU with low memory usually means an expensive computation loop — check search / analytics queries.

### Resolution
- Memory leak: identify with a heap snapshot in staging; patch and deploy.
- Large in-memory operation: paginate the query; use streaming.
- CPU loop: add pagination or background job offloading.

### Prevention
- Set container memory limits 20% above baseline usage so OOM kills trigger alerts before the process becomes unusable.
- Alert when `process_heap_used_bytes / process_heap_bytes > 0.85` for > 5 minutes.
- Schedule periodic heap profiling in staging after each significant feature release.

---

## Alerting Thresholds Reference

| Metric | Alert condition | Severity |
|---|---|---|
| `http_errors_total{status_class="5xx"}` | rate > 1% of total requests over 5 min | Critical |
| `http_errors_total{status_class="4xx"}` | rate > 10% of total requests over 5 min | Warning |
| `http_request_duration_seconds` p99 | > 2 s over 5 min | Warning |
| `http_request_duration_seconds` p99 | > 5 s over 5 min | Critical |
| `escrow_failures_total` | > 5 in 5 min | Critical |
| `payment_failures_total` | > 3 in 5 min | Critical |
| `blockchain_rpc_calls_total{outcome="failure"}` | > 3 in 1 min | Critical |
| `wallet_approvals_total{outcome="error"}` | > 5 in 5 min | Warning |
| `auth_events_total{outcome="failure"}` | > 50 in 5 min | Warning |
| `client_errors_total` | > 20 in 5 min | Warning |
| `process_heap_used_bytes / process_heap_bytes` | > 0.85 for 5 min | Warning |
| `/health` non-200 | any occurrence | Critical |

---

## Log Query Recipes

All structured log entries are JSON objects. Use these patterns against your log aggregator (Loki, CloudWatch Insights, Splunk, etc.).

```
# Find all 5xx errors in the last hour
{ level="error" } | json | status >= 500

# Trace a specific request end-to-end
{ requestId="<id>" }

# Find all errors for a specific user
{ userId="<user-id>", level=~"error|warn" }

# Find all escrow failures
{ message=~"escrow" } | json | errorCode =~ "ESCROW.*"

# Find slow requests (> 1 s)
{ level="info" } | json | durationMs > 1000

# Find all CORS rejections
{ message="CORS rejected origin" }
```

---

## On-Call Contacts

| Role | Contact |
|---|---|
| Platform on-call | See PagerDuty rotation |
| Supabase support | https://supabase.com/support |
| Stellar status | https://status.stellar.org |
| Trustless Work | https://docs.trustlesswork.com |
