-- Keep the first clean image; no historical evidence is fabricated.
-- Same RPC signature and permissions. Apply before publishing the frontend.
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
      'closed_image_url', NULL);
    INSERT INTO public.alerts(module_name, alert_type, severity, message, metadata,
      timestamp, video_timestamp, source_video, clip_path, camera_index)
    VALUES ('stops', 'bin_full', p_severity, 'Trash bin appears full or overflowing',
      coalesce(p_metadata, '{}') || jsonb_build_object(
        'episode_schema', 'bin_episode_v1', 'bin_episode', v_episode),
      p_observed_at, extract(epoch FROM p_observed_at), p_source_description,
      p_image_url, p_camera_index)
    RETURNING id INTO v_alert_id;
  ELSIF v_alert_id IS NOT NULL THEN
    IF p_overfilled THEN
      v_episode := (v_episode - 'clear_started_at' - 'clear_image_url') || jsonb_build_object('last_seen_at', p_observed_at,
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
          'clear_started_at', p_observed_at, 'clear_image_url', p_image_url);
      END IF;
      IF v_clear >= p_clear_observations THEN
        v_episode := v_episode || jsonb_build_object('status', 'closed',
          'ended_at', v_episode->'clear_started_at',
          'closed_image_at', v_episode->'clear_started_at',
          'closed_image_url', v_episode->'clear_image_url',
          'confirmed_at', p_observed_at);
        v_episode := v_episode - 'clear_started_at' - 'clear_image_url';
      END IF;
    END IF;
    -- Original timestamp/video_timestamp stay fixed. Only the evidence and
    -- episode status change; INSERT-only notification triggers do not repeat.
    UPDATE public.alerts SET
      metadata = coalesce(metadata, '{}') || CASE WHEN p_overfilled
        THEN coalesce(p_metadata, '{}') ELSE '{}'::jsonb END
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
