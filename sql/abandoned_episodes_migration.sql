-- Start/finish evidence is stored with the existing alert and retains its RLS.
BEGIN;
CREATE OR REPLACE FUNCTION public.open_abandoned_episode(
 p_event_id UUID, p_camera_index INTEGER, p_observed_at TIMESTAMPTZ,
 p_image_url TEXT, p_metadata JSONB, p_source_description TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id UUID;
BEGIN
 IF p_event_id IS NULL OR p_camera_index IS NULL OR p_observed_at IS NULL OR NOT isfinite(p_observed_at)
    OR p_observed_at>now()+interval '1 minute'
    OR jsonb_typeof(p_metadata->'abandoned_regions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_metadata->'abandoned_regions') NOT BETWEEN 1 AND 32 THEN
  RAISE EXCEPTION 'Invalid abandoned-object evidence';
 END IF;
 INSERT INTO alerts(id,module_name,alert_type,severity,message,metadata,timestamp,video_timestamp,source_video,clip_path,camera_index)
 VALUES(p_event_id,'stops','abandoned_object',0.8,'Оставлен предмет',
  p_metadata||jsonb_build_object('episode_schema','abandoned_episode_v1','abandoned_episode',jsonb_build_object(
    'status','open','started_at',p_observed_at,'last_seen_at',p_observed_at,'last_observed_at',p_observed_at,
    'ended_at',NULL,'first_image_url',p_image_url,'first_image_at',CASE WHEN p_image_url IS NOT NULL THEN p_observed_at END,'closed_image_url',NULL,
    'clear_count',0,'observation_count',1)),
  p_observed_at,extract(epoch FROM p_observed_at),p_source_description,p_image_url,p_camera_index)
 ON CONFLICT(id) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL AND NOT EXISTS(SELECT 1 FROM alerts WHERE id=p_event_id AND alert_type='abandoned_object' AND camera_index=p_camera_index) THEN
  RAISE EXCEPTION 'Event ID collision';
 END IF;
 RETURN jsonb_build_object('alert_id',p_event_id,'inserted',v_id IS NOT NULL);
END; $$;
CREATE OR REPLACE FUNCTION public.record_abandoned_observation(
 p_alert_id UUID,p_observed_at TIMESTAMPTZ,p_present BOOLEAN,p_image_url TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_episode JSONB; v_count INTEGER;
BEGIN
 IF p_alert_id IS NULL OR p_observed_at IS NULL OR NOT isfinite(p_observed_at) OR p_observed_at>now()+interval '1 minute' THEN
  RAISE EXCEPTION 'Invalid abandoned-object observation';
 END IF;
 SELECT metadata->'abandoned_episode' INTO v_episode FROM alerts
  WHERE id=p_alert_id AND alert_type='abandoned_object' AND metadata->>'episode_schema'='abandoned_episode_v1' FOR UPDATE;
 IF v_episode IS NULL OR v_episode->>'status'<>'open'
    OR p_observed_at<=(v_episode->>'last_observed_at')::timestamptz THEN RETURN jsonb_build_object('action','ignored'); END IF;
 IF p_present IS FALSE AND nullif(btrim(p_image_url),'') IS NULL THEN RETURN jsonb_build_object('action','ignored'); END IF;
 IF p_present IS DISTINCT FROM FALSE THEN
  v_episode:=(v_episode-'clear_started_at'-'clear_image_url')||jsonb_build_object('clear_count',0);
  IF p_present IS TRUE THEN v_episode:=v_episode||jsonb_build_object('last_seen_at',p_observed_at,'observation_count',(v_episode->>'observation_count')::integer+1); END IF;
 ELSE
  v_count:=coalesce((v_episode->>'clear_count')::integer,0)+1;
  IF v_count=1 THEN v_episode:=v_episode||jsonb_build_object('clear_started_at',p_observed_at,'clear_image_url',p_image_url); END IF;
  v_episode:=v_episode||jsonb_build_object('clear_count',v_count);
  IF v_count>=2 AND p_observed_at-(v_episode->>'clear_started_at')::timestamptz>=interval '15 seconds' THEN
   v_episode:=(v_episode||jsonb_build_object('status','closed','ended_at',v_episode->'clear_started_at',
    'closed_image_at',v_episode->'clear_started_at','closed_image_url',v_episode->'clear_image_url','confirmed_at',p_observed_at))-'clear_started_at'-'clear_image_url';
  END IF;
 END IF;
 v_episode:=v_episode||jsonb_build_object('last_observed_at',p_observed_at);
 UPDATE alerts SET metadata=metadata||jsonb_build_object('abandoned_episode',v_episode) WHERE id=p_alert_id;
 RETURN jsonb_build_object('action',CASE WHEN v_episode->>'status'='closed' THEN 'closed' ELSE 'updated' END);
END; $$;
REVOKE ALL ON FUNCTION public.open_abandoned_episode(UUID,INTEGER,TIMESTAMPTZ,TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_abandoned_observation(UUID,TIMESTAMPTZ,BOOLEAN,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_abandoned_episode(UUID,INTEGER,TIMESTAMPTZ,TEXT,JSONB,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_abandoned_observation(UUID,TIMESTAMPTZ,BOOLEAN,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
