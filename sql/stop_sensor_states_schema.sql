-- Current sensor state per stop. Safe to run repeatedly.

ALTER TABLE public.bus_stops
  ADD COLUMN IF NOT EXISTS controller_status TEXT DEFAULT 'offline';
ALTER TABLE public.bus_stops
  ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.stop_sensor_states (
  bus_stop_id INTEGER NOT NULL REFERENCES public.bus_stops(id) ON DELETE CASCADE,
  element INTEGER NOT NULL,
  address INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  name TEXT,
  value DOUBLE PRECISION,
  alarm TEXT DEFAULT 'normal',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT stop_sensor_states_pkey PRIMARY KEY (bus_stop_id, element, category)
);

CREATE INDEX IF NOT EXISTS idx_stop_sensor_states_bus_stop
  ON public.stop_sensor_states(bus_stop_id);

ALTER TABLE public.stop_sensor_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to sensor states" ON public.stop_sensor_states;
CREATE POLICY "Allow public read access to sensor states"
  ON public.stop_sensor_states FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow service role all access to sensor states" ON public.stop_sensor_states;
CREATE POLICY "Allow service role all access to sensor states"
  ON public.stop_sensor_states FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.stop_sensor_states FROM anon, authenticated;
GRANT SELECT ON public.stop_sensor_states TO anon, authenticated;
GRANT ALL ON public.stop_sensor_states TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stop_sensor_states;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.stop_sensor_states IS
  'Latest controller reading per stop, sensor element and category.';

NOTIFY pgrst, 'reload schema';
