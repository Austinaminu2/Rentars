-- Migration 00028: Add property_type column and ensure bedrooms/bathrooms exist
--
-- Rationale: tenants expect to filter by property type (apartment, house, etc.)
-- and by minimum bedroom/bathroom counts. This migration:
--   1. Adds property_type as a constrained TEXT column with an index.
--   2. Adds bathrooms column if it doesn't already exist (bedrooms was added
--      earlier but bathrooms may be missing).
--   3. Adds indexes on bedrooms and bathrooms to support efficient inequality
--      filters (>=) used by the search service.
--   4. Ensures bedrooms column exists (idempotent via IF NOT EXISTS).

-- ── Property type ──────────────────────────────────────────────────────────────

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_type TEXT
    CHECK (
      property_type IS NULL OR
      property_type IN ('Apartment', 'House', 'Villa', 'Condo', 'Studio', 'Room', 'Townhouse', 'Cabin', 'Loft', 'Boat')
    );

COMMENT ON COLUMN properties.property_type IS
  'Listing category: Apartment | House | Villa | Condo | Studio | Room | Townhouse | Cabin | Loft | Boat';

-- Index for set-membership filter (= operator is an index scan for low cardinality)
CREATE INDEX IF NOT EXISTS idx_properties_property_type
  ON properties (property_type)
  WHERE property_type IS NOT NULL;

-- ── Bedrooms ──────────────────────────────────────────────────────────────────

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0);

COMMENT ON COLUMN properties.bedrooms IS 'Number of bedrooms (0 = studio)';

CREATE INDEX IF NOT EXISTS idx_properties_bedrooms
  ON properties (bedrooms)
  WHERE bedrooms IS NOT NULL;

-- ── Bathrooms ────────────────────────────────────────────────────────────────

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS bathrooms NUMERIC(3, 1)
    CHECK (bathrooms IS NULL OR bathrooms >= 0);

COMMENT ON COLUMN properties.bathrooms IS
  'Number of bathrooms; 0.5 increments supported (e.g. 1.5 = 1 full + 1 half bath)';

CREATE INDEX IF NOT EXISTS idx_properties_bathrooms
  ON properties (bathrooms)
  WHERE bathrooms IS NOT NULL;

-- ── Composite index for combined filter (type + bedrooms + bathrooms) ─────────

CREATE INDEX IF NOT EXISTS idx_properties_type_beds_baths
  ON properties (property_type, bedrooms, bathrooms)
  WHERE property_type IS NOT NULL;
