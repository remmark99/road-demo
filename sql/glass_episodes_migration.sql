-- Apply after controller_alerts_bus_stop_migration.sql, before the new worker.
BEGIN;
ALTER TABLE public.controller_alerts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
CREATE TABLE IF NOT EXISTS public.glass_stop_state (
  bus_stop_id INTEGER PRIMARY KEY REFERENCES public.bus_stops(id) ON DELETE CASCADE,
  active_alert_id TEXT,
  last_observed_at TIMESTAMPTZ,
  clear_count INTEGER NOT NULL DEFAULT 0,
  camera_indexes INTEGER[] NOT NULL DEFAULT '{}',
  last_frames JSONB NOT NULL DEFAULT '{}'
);
ALTER TABLE public.glass_stop_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.glass_stop_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.glass_stop_state TO service_role;

CREATE OR REPLACE FUNCTION public.record_glass_observation(
  p_bus_stop_id INTEGER, p_observed_at TIMESTAMPTZ, p_broken BOOLEAN,
  p_evidence JSONB, p_model_response TEXT, p_clear_observations INTEGER DEFAULT 2,
  p_expected_alert_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.glass_stop_state%ROWTYPE;
  aid public.controller_alerts.id%TYPE;
  episode JSONB;
  cameras INTEGER[];
  clears INTEGER;
  action TEXT := 'clear';
BEGIN
  IF p_bus_stop_id IS NULL OR p_observed_at IS NULL OR NOT isfinite(p_observed_at)
     OR p_observed_at > now() + interval '1 minute' OR p_broken IS NULL
     OR p_clear_observations IS NULL
     OR p_clear_observations NOT BETWEEN 2 AND 100
     OR p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array'
     OR jsonb_array_length(p_evidence) = 0 THEN
    RAISE EXCEPTION 'Invalid glass observation';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_evidence) e
             WHERE nullif(e->'after'->>'url', '') IS NULL
                OR e->>'camera_index' IS NULL
                OR e->'after'->>'timestamp' IS NULL) THEN
    RAISE EXCEPTION 'Missing glass evidence';
  END IF;
  SELECT array_agg(DISTINCT (e->>'camera_index')::integer ORDER BY (e->>'camera_index')::integer)
    INTO cameras FROM jsonb_array_elements(p_evidence) e;
  INSERT INTO public.glass_stop_state(bus_stop_id) VALUES(p_bus_stop_id) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM public.glass_stop_state WHERE bus_stop_id = p_bus_stop_id FOR UPDATE;
  IF p_observed_at <= s.last_observed_at
     OR p_expected_alert_id IS DISTINCT FROM s.active_alert_id THEN
    RETURN jsonb_build_object('action', 'ignored');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_evidence) e
      WHERE (e->'after'->>'timestamp')::double precision <=
            (s.last_frames->>(e->>'camera_index'))::double precision) THEN
    RETURN jsonb_build_object('action', 'ignored', 'reason', 'reused_frame');
  END IF;
  IF s.active_alert_id IS NOT NULL AND NOT cameras @> s.camera_indexes THEN
    RETURN jsonb_build_object('action', 'ignored', 'reason', 'missing_camera');
  END IF;
  clears := CASE WHEN p_broken THEN 0 ELSE s.clear_count + 1 END;
  IF s.active_alert_id IS NULL AND p_broken THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_evidence) e
               WHERE nullif(e->'before'->>'url', '') IS NULL) THEN
      RAISE EXCEPTION 'New glass episodes require before evidence';
    END IF;
    episode := jsonb_build_object('status', 'open', 'started_at', p_observed_at,
      'last_seen_at', p_observed_at, 'observation_count', 1,
      'first_evidence', p_evidence, 'latest_evidence', p_evidence);
    INSERT INTO public.controller_alerts(module_name, bus_stop_id, element, address,
      category, value, alarm, message, clip_path, metadata)
    VALUES('stops', p_bus_stop_id, 1, 0, 'incident', 1, 'alarm',
      'Подтверждено разбитие стекла. Ведётся контроль состояния.',
      p_evidence->0->'after'->>'url',
      jsonb_build_object('glass_episode', episode, 'model_response', p_model_response))
    RETURNING id INTO aid;
    action := 'opened';
  ELSIF s.active_alert_id IS NOT NULL THEN
    SELECT id, metadata->'glass_episode' INTO aid, episode FROM public.controller_alerts
      WHERE id::text = s.active_alert_id FOR UPDATE;
    IF aid IS NULL OR episode->>'status' IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'Active glass episode missing or invalid';
    END IF;
    episode := episode || jsonb_build_object('last_checked_at', p_observed_at,
      'latest_evidence', p_evidence,
      'observation_count', (episode->>'observation_count')::integer + 1);
    action := 'updated';
    IF p_broken THEN
      episode := episode || jsonb_build_object('last_seen_at', p_observed_at);
    ELSIF clears >= p_clear_observations THEN
      episode := episode || jsonb_build_object('status', 'closed', 'ended_at', p_observed_at,
        'closed_evidence', p_evidence);
      action := 'closed';
    END IF;
    UPDATE public.controller_alerts SET
      metadata = coalesce(metadata, '{}') || jsonb_build_object(
        'glass_episode', episode, 'model_response', p_model_response),
      alarm = CASE WHEN action = 'closed' THEN 'normal' ELSE 'alarm' END,
      message = CASE WHEN action = 'closed' THEN 'Стекло восстановлено. Событие закрыто.'
        ELSE 'Подтверждено разбитие стекла. Ведётся контроль состояния.' END
      WHERE id = aid;
  END IF;
  UPDATE public.glass_stop_state SET last_observed_at = p_observed_at,
    last_frames = (SELECT jsonb_object_agg(e->>'camera_index', e->'after'->'timestamp')
                   FROM jsonb_array_elements(p_evidence) e),
    active_alert_id = CASE WHEN action = 'closed' THEN NULL ELSE aid::text END,
    clear_count = least(clears, p_clear_observations),
    camera_indexes = CASE WHEN action = 'closed' OR aid IS NULL THEN '{}'::integer[]
      ELSE cameras END
    WHERE bus_stop_id = p_bus_stop_id;
  RETURN jsonb_build_object('action', action, 'alert_id', aid);
END;
$$;
REVOKE ALL ON FUNCTION public.record_glass_observation(INTEGER,TIMESTAMPTZ,BOOLEAN,JSONB,TEXT,INTEGER,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_glass_observation(INTEGER,TIMESTAMPTZ,BOOLEAN,JSONB,TEXT,INTEGER,TEXT)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
