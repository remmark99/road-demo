-- Tag controller alerts with the bus stop their controller sits on.
--
-- Until now a single controller was polled, so every row in controller_alerts
-- implicitly belonged to that one stop. The controller worker now polls every
-- stop listed in bus_stops.ip_address, so alerts have to say where they came
-- from. Additive and idempotent: the column is nullable, existing rows keep
-- working, and the notifications trigger on this table is untouched.

BEGIN;

ALTER TABLE public.controller_alerts
  ADD COLUMN IF NOT EXISTS bus_stop_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'controller_alerts_bus_stop_id_fkey'
      AND conrelid = 'public.controller_alerts'::regclass
  ) THEN
    ALTER TABLE public.controller_alerts
      ADD CONSTRAINT controller_alerts_bus_stop_id_fkey
      FOREIGN KEY (bus_stop_id) REFERENCES public.bus_stops(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_controller_alerts_bus_stop_created
  ON public.controller_alerts(bus_stop_id, created_at DESC);

COMMENT ON COLUMN public.controller_alerts.bus_stop_id IS
  'Stop whose controller raised the alarm. NULL on rows predating multi-controller polling.';

COMMIT;

NOTIFY pgrst, 'reload schema';
