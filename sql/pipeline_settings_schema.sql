-- Pipeline runtime settings: detection thresholds, cooldowns and intervals the
-- admin panel («Админ-панель → Параметры анализа») changes without restarting
-- the backend (bus_stop_analytics, src/shared/runtime_settings.py).
--
--   * pipeline_settings          — overrides written by the admin panel. A missing
--                                  row means "use the backend's .env value".
--   * pipeline_settings_catalog  — which settings exist: groups, labels, JSON
--                                  schema and .env defaults. Published by the
--                                  backend at startup; the panel renders from it.
--   * pipeline_settings_agents   — one row per backend process: the overrides it
--                                  has applied and the ones it rejected, so the
--                                  panel can show whether a change took effect.
--
-- Every backend worker polls pipeline_settings (RUNTIME_SETTINGS_REFRESH_SEC,
-- 15 s by default) and applies valid values in place.
--
-- Access: service role only. The browser never touches these tables; the
-- admin API route (app/api/admin/pipeline-settings) checks profiles.role.
--
-- Apply before deploying the backend version that reads them. Additive and
-- idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pipeline_settings (
  -- Attribute name in the backend's Settings class, e.g. kp_confidence.
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.pipeline_settings IS
  'Runtime overrides of backend settings, edited in the admin panel. No row = .env value.';

CREATE TABLE IF NOT EXISTS public.pipeline_settings_catalog (
  id TEXT PRIMARY KEY,
  -- {version, groups: [{id, title, description}],
  --  fields: [{key, group, label, description, unit, services, advanced, schema, default}]}
  catalog JSONB NOT NULL,
  published_by TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pipeline_settings_catalog IS
  'Settings the backend applies at runtime, with their schema and .env defaults. Written by the backend.';

CREATE TABLE IF NOT EXISTS public.pipeline_settings_agents (
  -- <service>@<hostname>:<pid>
  instance_id TEXT PRIMARY KEY,
  -- docker-compose service name, e.g. stage1-pose
  service TEXT NOT NULL,
  hostname TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  -- Last successful read of pipeline_settings.
  synced_at TIMESTAMPTZ NOT NULL,
  -- {key: value} overrides in effect in this process.
  applied JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- {key: reason} overrides this process refused; it uses the .env value instead.
  rejected JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pipeline_settings_agents_synced
  ON public.pipeline_settings_agents (synced_at DESC);

COMMENT ON TABLE public.pipeline_settings_agents IS
  'Heartbeat of every backend process applying runtime settings. Rows of stopped processes go stale.';

-- ── Access ───────────────────────────────────────────────────────────────────

ALTER TABLE public.pipeline_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_settings_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_settings_agents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pipeline_settings FROM anon, authenticated;
REVOKE ALL ON public.pipeline_settings_catalog FROM anon, authenticated;
REVOKE ALL ON public.pipeline_settings_agents FROM anon, authenticated;
GRANT ALL ON public.pipeline_settings TO service_role;
GRANT ALL ON public.pipeline_settings_catalog TO service_role;
GRANT ALL ON public.pipeline_settings_agents TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
