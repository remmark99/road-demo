-- Snapshot of stops from the «Умный транспорт» dispatcher API (stations/load).
-- Kept separate from bus_stops so both sets can be compared on the map before
-- deciding how to merge them. Filled by scripts/import-smart-transport-stops.mjs.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.smart_transport_stops (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  description TEXT,
  address TEXT,
  note TEXT,
  transport_type_flags INTEGER,
  direction INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  station_owner_id INTEGER,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geo_zone JSONB,
  -- Nearest bus_stops row and the bus_stops row with the same id, for comparison.
  nearest_bus_stop_id INTEGER,
  nearest_distance_m DOUBLE PRECISION,
  same_id_distance_m DOUBLE PRECISION,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.smart_transport_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read smart transport stops" ON public.smart_transport_stops;
CREATE POLICY "Authenticated read smart transport stops"
  ON public.smart_transport_stops FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role all smart transport stops" ON public.smart_transport_stops;
CREATE POLICY "Service role all smart transport stops"
  ON public.smart_transport_stops FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.smart_transport_stops FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.smart_transport_stops FROM authenticated;
GRANT SELECT ON public.smart_transport_stops TO authenticated;
GRANT ALL ON public.smart_transport_stops TO service_role;

COMMENT ON TABLE public.smart_transport_stops IS
  'Stops imported from the Smart Transport dispatcher API for comparison with bus_stops.';

NOTIFY pgrst, 'reload schema';
