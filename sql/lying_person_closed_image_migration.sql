-- Lying-person episodes: an end photo taken when the episode closes.
--
-- Why: the card's «После — событие завершено» used to render the last CONFIRMED
-- observation's frame, which by definition still shows the person lying. The
-- aggregator now captures the camera's current frame at the moment the close
-- scan finishes the episode and stores it here.
--
-- This migration only adds columns and two service-role functions; it never
-- rewrites existing rows, and close_stale_lying_person_episodes is left in place
-- for the episodes-disabled rollback path.

BEGIN;

ALTER TABLE public.lying_person_episodes
  ADD COLUMN IF NOT EXISTS closed_image_url TEXT;

ALTER TABLE public.lying_person_episodes
  ADD COLUMN IF NOT EXISTS closed_image_at TIMESTAMPTZ;

-- Which open episodes the close scan must finish, with the camera to snapshot.
CREATE OR REPLACE FUNCTION public.stale_lying_person_episodes(
  p_stale_before TIMESTAMPTZ
)
RETURNS TABLE (episode_id UUID, camera_id TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, camera_id
    FROM public.lying_person_episodes
   WHERE status = 'open'
     AND last_seen_at < p_stale_before
   ORDER BY last_seen_at;
$$;

-- Close exactly one episode and record its end photo. ended_at stays the last
-- confirmed observation: the end of the incident is where the evidence ended,
-- while closed_image_at is when the (clean) picture was taken.
CREATE OR REPLACE FUNCTION public.close_lying_person_episode(
  p_episode_id UUID,
  p_closed_image_url TEXT DEFAULT NULL,
  p_closed_image_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated UUID;
BEGIN
  UPDATE public.lying_person_episodes
     SET status = 'closed',
         ended_at = last_seen_at,
         closed_image_url = p_closed_image_url,
         closed_image_at = coalesce(p_closed_image_at, now()),
         updated_at = now()
   WHERE id = p_episode_id
     AND status = 'open'
  RETURNING id INTO v_updated;

  RETURN jsonb_build_object(
    'episode_id', p_episode_id,
    'closed', v_updated IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stale_lying_person_episodes(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stale_lying_person_episodes(TIMESTAMPTZ)
  TO service_role;

REVOKE ALL ON FUNCTION public.close_lying_person_episode(UUID, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_lying_person_episode(UUID, TEXT, TIMESTAMPTZ)
  TO service_role;

COMMENT ON COLUMN public.lying_person_episodes.closed_image_url IS
  'Camera frame captured when the episode closed: the scene without the lying person. Null on episodes closed before this migration and when the camera had no frame at that moment.';
COMMENT ON COLUMN public.lying_person_episodes.closed_image_at IS
  'When the end photo was captured (the close scan moment). ended_at remains the last confirmed observation.';

COMMIT;
