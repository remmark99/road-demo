-- Lying-person episodes and observations.
-- Apply only after a production preflight and explicit approval.
-- Compatibility invariant: this migration never alters existing application
-- tables. It only reads profiles and inserts the same lying_person alert shape
-- already used by the legacy pipeline.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lying_person_episodes (
  id UUID PRIMARY KEY,
  alert_id TEXT NOT NULL UNIQUE,
  camera_id TEXT NOT NULL,
  camera_index INTEGER NOT NULL,
  location_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  started_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  canonical_subject JSONB NOT NULL,
  canonical_bbox JSONB NOT NULL,
  first_image_url TEXT,
  latest_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (last_seen_at >= started_at),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (
    (status = 'open' AND ended_at IS NULL)
    OR (status = 'closed' AND ended_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.lying_person_observations (
  observation_id UUID PRIMARY KEY,
  episode_id UUID NOT NULL REFERENCES public.lying_person_episodes(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  track_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  spatial_evidence JSONB NOT NULL,
  qwen_metadata JSONB NOT NULL,
  match_score DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1))
);

CREATE INDEX IF NOT EXISTS idx_lying_person_episodes_open_camera_last_seen
  ON public.lying_person_episodes (camera_id, last_seen_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_lying_person_observations_episode_time
  ON public.lying_person_observations (episode_id, observed_at DESC);

ALTER TABLE public.lying_person_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lying_person_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized stop users read lying person episodes"
  ON public.lying_person_episodes;
DROP POLICY IF EXISTS "Authenticated users read lying person episodes"
  ON public.lying_person_episodes;
CREATE POLICY "Authorized stop users read lying person episodes"
  ON public.lying_person_episodes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.profiles AS profile
       WHERE profile.id = auth.uid()
         AND (
           profile.role = 'admin'
           OR coalesce(to_jsonb(profile.modules), '[]'::jsonb) ? 'stops'
         )
    )
  );

DROP POLICY IF EXISTS "Authenticated users read lying person observations"
  ON public.lying_person_observations;

REVOKE ALL ON public.lying_person_episodes FROM anon, authenticated;
REVOKE ALL ON public.lying_person_observations FROM anon, authenticated;
GRANT SELECT ON public.lying_person_episodes TO authenticated;
GRANT ALL ON public.lying_person_episodes TO service_role;
GRANT ALL ON public.lying_person_observations TO service_role;

CREATE OR REPLACE FUNCTION public.open_lying_person_episode(
  p_episode_id UUID,
  p_observation_id UUID,
  p_camera_id TEXT,
  p_camera_index INTEGER,
  p_location_id TEXT,
  p_observed_at TIMESTAMPTZ,
  p_event_ts DOUBLE PRECISION,
  p_track_id TEXT,
  p_frame_id TEXT,
  p_spatial_evidence JSONB,
  p_subject JSONB,
  p_first_image_url TEXT,
  p_latest_image_url TEXT,
  p_alert_severity DOUBLE PRECISION,
  p_alert_message TEXT,
  p_alert_metadata JSONB,
  p_source_description TEXT,
  p_match_score DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_episode UUID;
  v_alert_id TEXT;
BEGIN
  SELECT episode_id
    INTO v_existing_episode
    FROM public.lying_person_observations
   WHERE observation_id = p_observation_id;

  IF v_existing_episode IS NOT NULL THEN
    RETURN jsonb_build_object(
      'episode_id', v_existing_episode,
      'inserted', false
    );
  END IF;

  INSERT INTO public.alerts (
    module_name,
    alert_type,
    severity,
    message,
    metadata,
    timestamp,
    video_timestamp,
    source_video,
    clip_path,
    camera_index
  ) VALUES (
    'stops',
    'lying_person',
    p_alert_severity,
    p_alert_message,
    coalesce(p_alert_metadata, '{}'::jsonb) || jsonb_build_object(
      'episode_id', p_episode_id::text,
      'episode_schema', 'lying_person_episode_v1'
    ),
    p_observed_at,
    p_event_ts,
    p_source_description,
    p_first_image_url,
    p_camera_index
  )
  RETURNING id::text INTO v_alert_id;

  INSERT INTO public.lying_person_episodes (
    id,
    alert_id,
    camera_id,
    camera_index,
    location_id,
    status,
    started_at,
    last_seen_at,
    observation_count,
    canonical_subject,
    canonical_bbox,
    first_image_url,
    latest_image_url
  ) VALUES (
    p_episode_id,
    v_alert_id,
    p_camera_id,
    p_camera_index,
    nullif(p_location_id, ''),
    'open',
    p_observed_at,
    p_observed_at,
    1,
    p_subject,
    p_spatial_evidence -> 'bbox_normalized',
    p_first_image_url,
    p_latest_image_url
  );

  INSERT INTO public.lying_person_observations (
    observation_id,
    episode_id,
    observed_at,
    track_id,
    frame_id,
    spatial_evidence,
    qwen_metadata,
    match_score
  ) VALUES (
    p_observation_id,
    p_episode_id,
    p_observed_at,
    p_track_id,
    p_frame_id,
    p_spatial_evidence,
    p_subject,
    p_match_score
  );

  RETURN jsonb_build_object(
    'episode_id', p_episode_id,
    'alert_id', v_alert_id,
    'inserted', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.append_lying_person_observation(
  p_episode_id UUID,
  p_observation_id UUID,
  p_observed_at TIMESTAMPTZ,
  p_track_id TEXT,
  p_frame_id TEXT,
  p_spatial_evidence JSONB,
  p_subject JSONB,
  p_match_score DOUBLE PRECISION,
  p_canonical_bbox JSONB,
  p_canonical_subject JSONB,
  p_first_image_url TEXT,
  p_latest_image_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_episode UUID;
  v_updated UUID;
BEGIN
  SELECT episode_id
    INTO v_existing_episode
    FROM public.lying_person_observations
   WHERE observation_id = p_observation_id;

  IF v_existing_episode IS NOT NULL THEN
    RETURN jsonb_build_object(
      'episode_id', v_existing_episode,
      'inserted', false
    );
  END IF;

  SELECT id
    INTO v_updated
    FROM public.lying_person_episodes
   WHERE id = p_episode_id
     AND status = 'open'
   FOR UPDATE;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'lying person episode % is not open', p_episode_id;
  END IF;

  INSERT INTO public.lying_person_observations (
    observation_id,
    episode_id,
    observed_at,
    track_id,
    frame_id,
    spatial_evidence,
    qwen_metadata,
    match_score
  ) VALUES (
    p_observation_id,
    p_episode_id,
    p_observed_at,
    p_track_id,
    p_frame_id,
    p_spatial_evidence,
    p_subject,
    p_match_score
  );

  UPDATE public.lying_person_episodes
     SET started_at = least(started_at, p_observed_at),
         last_seen_at = greatest(last_seen_at, p_observed_at),
         observation_count = observation_count + 1,
         canonical_bbox = p_canonical_bbox,
         canonical_subject = p_canonical_subject,
         first_image_url = CASE
           WHEN p_observed_at < started_at THEN p_first_image_url
           ELSE first_image_url
         END,
         latest_image_url = CASE
           WHEN p_observed_at >= last_seen_at THEN p_latest_image_url
           ELSE latest_image_url
         END,
         updated_at = now()
   WHERE id = p_episode_id;

  RETURN jsonb_build_object(
    'episode_id', p_episode_id,
    'inserted', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_stale_lying_person_episodes(
  p_stale_before TIMESTAMPTZ
)
RETURNS TABLE (episode_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.lying_person_episodes
     SET status = 'closed',
         ended_at = last_seen_at,
         updated_at = now()
   WHERE status = 'open'
     AND last_seen_at < p_stale_before
  RETURNING id;
$$;

REVOKE ALL ON FUNCTION public.open_lying_person_episode(
  UUID, UUID, TEXT, INTEGER, TEXT, TIMESTAMPTZ, DOUBLE PRECISION,
  TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, DOUBLE PRECISION,
  TEXT, JSONB, TEXT, DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_lying_person_episode(
  UUID, UUID, TEXT, INTEGER, TEXT, TIMESTAMPTZ, DOUBLE PRECISION,
  TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, DOUBLE PRECISION,
  TEXT, JSONB, TEXT, DOUBLE PRECISION
) TO service_role;

REVOKE ALL ON FUNCTION public.append_lying_person_observation(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, JSONB, JSONB,
  DOUBLE PRECISION, JSONB, JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_lying_person_observation(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, JSONB, JSONB,
  DOUBLE PRECISION, JSONB, JSONB, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.close_stale_lying_person_episodes(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_lying_person_episodes(TIMESTAMPTZ)
  TO service_role;

COMMENT ON TABLE public.lying_person_episodes IS
  'Long-running, camera-scoped lying-person incidents; one alert per episode.';
COMMENT ON TABLE public.lying_person_observations IS
  'Idempotent Qwen-confirmed observations belonging to lying-person episodes.';

COMMIT;
