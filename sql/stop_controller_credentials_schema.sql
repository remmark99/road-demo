-- Per-stop LuCI credentials for bus stop controllers.
--
-- Deliberately NOT columns on public.bus_stops: that table is readable with the
-- anon key, which ships to the browser, so a password column there would be
-- public. This table grants nothing to anon/authenticated — only the controller
-- worker's service_role key can read it.
--
-- A stop without a row here falls back to the worker's CONTROLLER_USER /
-- CONTROLLER_PWD env pair, so only the stops that differ need a row.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.stop_controller_credentials (
  bus_stop_id INTEGER PRIMARY KEY REFERENCES public.bus_stops(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stop_controller_credentials ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policy on purpose: these are secrets, not app data.
DROP POLICY IF EXISTS "Allow service role all access to controller credentials"
  ON public.stop_controller_credentials;
CREATE POLICY "Allow service role all access to controller credentials"
  ON public.stop_controller_credentials FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.stop_controller_credentials FROM anon, authenticated;
GRANT ALL ON public.stop_controller_credentials TO service_role;

COMMENT ON TABLE public.stop_controller_credentials IS
  'LuCI login per bus stop controller. Service role only — never expose to anon.';

-- Example: give the OG stop its own pair and leave every other stop on the
-- worker default.
--
--   INSERT INTO public.stop_controller_credentials (bus_stop_id, username, password, note)
--   VALUES (1, 'admin', '<password>', 'OG stop')
--   ON CONFLICT (bus_stop_id) DO UPDATE
--     SET username = EXCLUDED.username,
--         password = EXCLUDED.password,
--         note     = EXCLUDED.note,
--         updated_at = NOW();

NOTIFY pgrst, 'reload schema';
