-- Schema migration for Live Stop Sensor Readings (UPSERT strategy)
-- Run this script in the Supabase SQL Editor

-- 1. Add controller monitoring columns to public.bus_stops if they do not exist
ALTER TABLE public.bus_stops ADD COLUMN IF NOT EXISTS controller_status TEXT DEFAULT 'offline';
ALTER TABLE public.bus_stops ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ;

-- 2. Create public.stop_sensor_states table
CREATE TABLE IF NOT EXISTS public.stop_sensor_states (
  bus_stop_id INTEGER NOT NULL REFERENCES public.bus_stops(id) ON DELETE CASCADE,
  element INTEGER NOT NULL,            -- IO Element ID (e.g. 13 for temp/hum, 14 for temp, 1 for digital)
  address INTEGER NOT NULL DEFAULT 0,  -- IO Element Address
  category TEXT NOT NULL,              -- 'temperature', 'humidity', 'digital input', 'glass_break'
  name TEXT,                           -- Sensor human-readable name ("Датчик температуры")
  value DOUBLE PRECISION,              -- Numerical measurement (°C, %, Volts, binary 0.0/1.0)
  alarm TEXT DEFAULT 'normal',         -- 'normal', 'warning', 'critical', 'alarm'
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT stop_sensor_states_pkey PRIMARY KEY (bus_stop_id, element, category)
);

-- 3. Indexes for fast lookup by stop
CREATE INDEX IF NOT EXISTS idx_stop_sensor_states_bus_stop ON public.stop_sensor_states(bus_stop_id);

-- 4. Enable Row Level Security (RLS) & Policies
ALTER TABLE public.stop_sensor_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to sensor states" ON public.stop_sensor_states;
CREATE POLICY "Allow public read access to sensor states" ON public.stop_sensor_states
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow service role all access to sensor states" ON public.stop_sensor_states;
CREATE POLICY "Allow service role all access to sensor states" ON public.stop_sensor_states
  FOR ALL USING (true) WITH CHECK (true);

-- 5. Enable Supabase Realtime for public.stop_sensor_states
ALTER PUBLICATION supabase_realtime ADD TABLE public.stop_sensor_states;

-- Comments
COMMENT ON TABLE public.stop_sensor_states IS 'Live single-row current sensor states per bus stop and sensor category.';
COMMENT ON COLUMN public.stop_sensor_states.bus_stop_id IS 'Reference to public.bus_stops.id';
