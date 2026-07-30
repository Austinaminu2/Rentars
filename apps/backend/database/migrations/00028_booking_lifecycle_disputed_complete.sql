-- Migration 00028: full booking lifecycle support
-- Adds 'Disputed' and 'Completed' to the status check constraint
-- and adds a dispute_reason text column.

-- 1. Drop existing status constraint (if present) and re-create with all states
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('Pending', 'Confirmed', 'Cancelled', 'Completed', 'Disputed'));

-- 2. Add dispute_reason column (nullable — only populated when status = 'Disputed')
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT;

-- 3. Index on status to speed up lifecycle queries
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
