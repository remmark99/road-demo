-- Confidence per episode boundary. Same RPC signature and permissions as
-- bin_first_clear_evidence_migration.sql, which this file supersedes.
--
-- The tray (opening) observation scores "the bin is full" -- that is the start of
-- the episode. Closing needs `p_clear_observations` clean frames in a row, so the
-- end is not one frame's opinion: the episode keeps the SUM and COUNT of the clean
-- streak and closes on their average. A single over-confident frame therefore
-- cannot decide the end (and the same rule keeps the start honest: the episode
-- opens on exactly one observation, so its own score is unambiguous).
--
-- Only our trained classifier sends a score. The Stage 2 VLM answers yes/no and
-- contributes none, so `confidence` is absent there and both fields stay null --
-- the feed then shows no number rather than an invented one.
--
-- Apply before publishing the frontend.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_bin_observation(
  p_camera_index INTEGER,
  p_observed_at TIMESTAMPTZ,
  p_overfilled BOOLEAN,
  p_image_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_source_description TEXT DEFAULT NULL,
  p_severity DOUBLE PRECISION DEFAULT 0.7,
  p_clear_observations INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_state public.bin_camera_state%ROWTYPE;
  v_alert_id public.alerts.id%TYPE;
  v_episode JSONB;
  v_clear INTEGER;
  v_confidence DOUBLE PRECISION;
BEGIN
  IF p_camera_index IS NULL OR p_observed_at IS NULL OR NOT isfinite(p_observed_at)
     OR p_observed_at > now() + interval '1 minute' OR p_overfilled IS NULL
     OR p_clear_observations IS NULL OR p_clear_observations < 2
     OR p_clear_observations > 100 THEN
    RAISE EXCEPTION 'Invalid bin observation';
  END IF;
  -- Absence without an image cannot prove recovery or advance its watermark.
  IF NOT p_overfilled AND nullif(btrim(p_image_url), '') IS NULL THEN
    RETURN jsonb_build_object('action', 'ignored', 'reason', 'missing_clear_image');
  END IF;
  -- A malformed or out-of-range score is treated as "not measured".
  v_confidence := CASE WHEN jsonb_typeof(coalesce(p_metadata, '{}') -> 'confidence') = 'number'
      AND (p_metadata ->> 'confidence')::double precision BETWEEN 0 AND 1
    THEN (p_metadata ->> 'confidence')::double precision END;
  INSERT INTO public.bin_camera_state(camera_index) VALUES (p_camera_index)
    ON CONFLICT DO NOTHING;
  SELECT * INTO v_state FROM public.bin_camera_state
    WHERE camera_index = p_camera_index FOR UPDATE;
  IF p_observed_at <= v_state.last_observed_at THEN
    RETURN jsonb_build_object('action', 'ignored', 'alert_id', v_state.active_alert_id);
  END IF;

  v_alert_id := v_state.active_alert_id;
  v_clear := CASE WHEN p_overfilled THEN 0 ELSE v_state.clear_count + 1 END;
  IF v_alert_id IS NOT NULL THEN
    SELECT metadata->'bin_episode' INTO v_episode FROM public.alerts
      WHERE id = v_alert_id AND camera_index = p_camera_index
        AND alert_type = 'bin_full' FOR UPDATE;
    IF v_episode IS NULL OR v_episode->>'status' IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'Active bin alert % is missing or invalid', v_alert_id;
    END IF;
  END IF;

  IF p_overfilled AND v_alert_id IS NULL THEN
    v_episode := jsonb_build_object('status', 'open', 'started_at', p_observed_at,
      'last_seen_at', p_observed_at, 'ended_at', NULL, 'observation_count', 1,
      'first_image_url', p_image_url, 'first_image_at', CASE WHEN p_image_url IS NOT NULL THEN p_observed_at END,
      'closed_image_url', NULL, 'start_confidence', v_confidence);
    INSERT INTO public.alerts(module_name, alert_type, severity, message, metadata,
      timestamp, video_timestamp, source_video, clip_path, camera_index)
    VALUES ('stops', 'bin_full', p_severity, 'Trash bin appears full or overflowing',
      coalesce(p_metadata, '{}') - 'confidence' || jsonb_build_object(
        'episode_schema', 'bin_episode_v1', 'bin_episode', v_episode),
      p_observed_at, extract(epoch FROM p_observed_at), p_source_description,
      p_image_url, p_camera_index)
    RETURNING id INTO v_alert_id;
  ELSIF v_alert_id IS NOT NULL THEN
    IF p_overfilled THEN
      -- The opening score is kept: later confirmations cannot rewrite the start.
      v_episode := (v_episode - 'clear_started_at' - 'clear_image_url'
                    - 'clear_conf_sum' - 'clear_conf_count')
        || jsonb_build_object('last_seen_at', p_observed_at,
          'observation_count', (v_episode->>'observation_count')::integer + 1);
      -- Retain the earliest available evidence, including after an upload failure.
      IF v_episode->>'first_image_url' IS NULL AND p_image_url IS NOT NULL THEN
        v_episode := v_episode || jsonb_build_object('first_image_url', p_image_url, 'first_image_at', p_observed_at);
      END IF;
    ELSE
      -- Keep the first clean frame durably while the following observations
      -- confirm it. A positive observation above discards this candidate.
      IF v_state.clear_count = 0 OR v_episode->>'clear_image_url' IS NULL THEN
        v_episode := v_episode || jsonb_build_object(
          'clear_started_at', p_observed_at, 'clear_image_url', p_image_url,
          'clear_conf_sum', coalesce(v_confidence, 0),
          'clear_conf_count', CASE WHEN v_confidence IS NULL THEN 0 ELSE 1 END);
      ELSE
        -- coalesce tolerates a candidate whose streak started before this
        -- migration existed: it was written without the sum/count keys.
        v_episode := v_episode || jsonb_build_object(
          'clear_conf_sum', coalesce((v_episode->>'clear_conf_sum')::double precision, 0) + coalesce(v_confidence, 0),
          'clear_conf_count', coalesce((v_episode->>'clear_conf_count')::integer, 0)
            + CASE WHEN v_confidence IS NULL THEN 0 ELSE 1 END);
      END IF;
      IF v_clear >= p_clear_observations THEN
        -- ended_at stays the FIRST clean frame; the score is the streak average.
        v_episode := v_episode || jsonb_build_object('status', 'closed',
          'ended_at', v_episode->'clear_started_at',
          'closed_image_at', v_episode->'clear_started_at',
          'closed_image_url', v_episode->'clear_image_url',
          'end_confidence', CASE WHEN coalesce((v_episode->>'clear_conf_count')::integer, 0) > 0
            THEN round((coalesce((v_episode->>'clear_conf_sum')::double precision, 0)
              / (v_episode->>'clear_conf_count')::integer)::numeric, 4) END,
          'end_confidence_samples', nullif(coalesce((v_episode->>'clear_conf_count')::integer, 0), 0),
          'confirmed_at', p_observed_at);
        v_episode := v_episode - 'clear_started_at' - 'clear_image_url'
          - 'clear_conf_sum' - 'clear_conf_count';
      END IF;
    END IF;
    -- Original timestamp/video_timestamp stay fixed. Only the evidence and
    -- episode status change; INSERT-only notification triggers do not repeat.
    -- `confidence` is stripped from the alert level: the score belongs to the
    -- episode boundary it was measured for, not to a shared, overwritable key.
    UPDATE public.alerts SET
      metadata = coalesce(metadata, '{}') || CASE WHEN p_overfilled
        THEN coalesce(p_metadata, '{}') - 'confidence' ELSE '{}'::jsonb END
        || jsonb_build_object('episode_schema', 'bin_episode_v1', 'bin_episode', v_episode),
      clip_path = CASE WHEN p_overfilled THEN coalesce(p_image_url, clip_path) ELSE clip_path END
    WHERE id = v_alert_id;
  END IF;

  UPDATE public.bin_camera_state SET last_observed_at = p_observed_at,
    clear_count = least(v_clear, p_clear_observations),
    active_alert_id = CASE WHEN NOT p_overfilled AND v_clear >= p_clear_observations
      THEN NULL ELSE v_alert_id END
  WHERE camera_index = p_camera_index;
  RETURN jsonb_build_object('action', CASE WHEN v_episode->>'status' = 'closed' THEN 'closed'
    WHEN p_overfilled AND v_state.active_alert_id IS NULL THEN 'opened'
    WHEN v_alert_id IS NULL THEN 'clear' ELSE 'updated' END, 'alert_id', v_alert_id);
END;
$$;
REVOKE ALL ON FUNCTION public.record_bin_observation(INTEGER, TIMESTAMPTZ, BOOLEAN, TEXT, JSONB, TEXT, DOUBLE PRECISION, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_bin_observation(INTEGER, TIMESTAMPTZ, BOOLEAN, TEXT, JSONB, TEXT, DOUBLE PRECISION, INTEGER)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
