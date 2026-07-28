-- Add stay length limits, check-in/out times to properties,
-- and host earnings summary view.

-- #268: min/max stay length per property
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS min_nights INTEGER NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  ADD COLUMN IF NOT EXISTS max_nights INTEGER CHECK (max_nights IS NULL OR (max_nights >= 1 AND max_nights >= min_nights));

-- #269: configurable check-in / check-out times per property
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS check_in_time  TIME NOT NULL DEFAULT '15:00:00',
  ADD COLUMN IF NOT EXISTS check_out_time TIME NOT NULL DEFAULT '11:00:00';

-- #271: host earnings summary view (gross, fees, net, pending vs released)
-- Platform fee is 5 % of total_price.
CREATE OR REPLACE VIEW host_earnings_summary AS
SELECT
  p.owner_id                                                      AS host_id,
  b.property_id,
  b.id                                                            AS booking_id,
  b.total_price                                                   AS gross,
  ROUND(b.total_price * 0.05, 2)                                  AS platform_fee,
  ROUND(b.total_price * 0.95, 2)                                  AS net,
  b.status,
  b.escrow_id,
  CASE
    WHEN b.status IN ('Confirmed', 'Completed')  THEN 'released'
    ELSE 'pending'
  END                                                             AS escrow_state,
  b.created_at
FROM bookings b
JOIN properties p ON p.id = b.property_id
WHERE b.status NOT IN ('Cancelled');
