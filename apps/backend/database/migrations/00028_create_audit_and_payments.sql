-- Migration: 00028_create_audit_and_payments.sql
-- Creates the audit_logs table for structured audit trail (issue #376)
-- and the payments table for payment state tracking (issue #378).

-- ─── audit_logs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   TEXT,
  ip            TEXT,
  meta          JSONB,

  -- Index on actor to support "show audit history for user X"
  CONSTRAINT audit_logs_action_not_empty CHECK (char_length(action) > 0)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor     ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action    ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource  ON audit_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);

-- RLS: Only admins (service-role) can read audit_logs.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_service_role_only ON audit_logs
  USING (auth.role() = 'service_role');

-- ─── payments ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_usdc     NUMERIC(20, 7) NOT NULL CHECK (amount_usdc > 0),
  stellar_tx_hash TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed', 'timed_out')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB,

  CONSTRAINT payments_booking_id_unique UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_booking    ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant     ON payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_tx_hash    ON payments (stellar_tx_hash) WHERE stellar_tx_hash IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_payments_updated_at();

-- RLS: Tenants can read their own payments; service role has full access.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_tenant_read ON payments
  FOR SELECT USING (auth.uid() = tenant_id);

CREATE POLICY payments_service_role_all ON payments
  USING (auth.role() = 'service_role');
