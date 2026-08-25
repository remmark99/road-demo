-- Notifications delivery schema for Email and MAX.
-- Apply only after the application endpoints are deployed. This migration does not
-- store provider credentials; create the named Vault secrets described below.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    email_event_types TEXT[],
    last_test_email_at TIMESTAMPTZ,
    max_user_id TEXT,
    max_display_name TEXT,
    max_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    max_event_types TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_preferences_email_length
        CHECK (email IS NULL OR char_length(email) <= 320),
    CONSTRAINT notification_preferences_email_required
        CHECK (NOT email_enabled OR email IS NOT NULL),
    CONSTRAINT notification_preferences_max_required
        CHECK (NOT max_enabled OR max_user_id IS NOT NULL),
    CONSTRAINT notification_preferences_max_user_id_format
        CHECK (max_user_id IS NULL OR max_user_id ~ '^[0-9]+$')
);

ALTER TABLE public.notification_preferences
    ADD COLUMN IF NOT EXISTS email_event_types TEXT[];
ALTER TABLE public.notification_preferences
    ADD COLUMN IF NOT EXISTS max_event_types TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_max_user_id_key
    ON public.notification_preferences(max_user_id)
    WHERE max_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.max_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    linked_max_user_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT max_link_tokens_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT max_link_tokens_user_id_format
        CHECK (linked_max_user_id IS NULL OR linked_max_user_id ~ '^[0-9]+$')
);

CREATE INDEX IF NOT EXISTS max_link_tokens_user_created_idx
    ON public.max_link_tokens(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL CHECK (source IN ('alerts', 'controller_alerts')),
    event_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'max')),
    recipient TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_until TIMESTAMPTZ,
    lease_token UUID,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_deliveries_event_recipient_key
        UNIQUE (source, event_id, user_id, channel)
);

CREATE INDEX IF NOT EXISTS notification_deliveries_dispatch_idx
    ON public.notification_deliveries(status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS notification_deliveries_recipient_idx
    ON public.notification_deliveries(channel, recipient, status);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification preferences"
    ON public.notification_preferences;
CREATE POLICY "Users read own notification preferences"
    ON public.notification_preferences
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own notification preferences"
    ON public.notification_preferences;
DROP POLICY IF EXISTS "Users update own notification preferences"
    ON public.notification_preferences;

REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
REVOKE ALL ON public.max_link_tokens FROM anon, authenticated;
REVOKE ALL ON public.notification_deliveries FROM anon, authenticated;
GRANT SELECT ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
GRANT ALL ON public.max_link_tokens TO service_role;
GRANT ALL ON public.notification_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.set_notification_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_preferences_set_updated_at
    ON public.notification_preferences;
CREATE TRIGGER notification_preferences_set_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW EXECUTE FUNCTION public.set_notification_updated_at();

DROP TRIGGER IF EXISTS notification_deliveries_set_updated_at
    ON public.notification_deliveries;
CREATE TRIGGER notification_deliveries_set_updated_at
    BEFORE UPDATE ON public.notification_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.set_notification_updated_at();

-- These two named secrets must be created in Supabase Vault before activation:
--   notification_dispatch_url    = https://<app>/api/internal/notifications/dispatch
--   notification_dispatch_secret = the same value as NOTIFICATION_DISPATCH_SECRET
CREATE OR REPLACE FUNCTION public.wake_notification_dispatcher()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    dispatch_url TEXT;
    dispatch_secret TEXT;
BEGIN
    SELECT decrypted_secret INTO dispatch_url
    FROM vault.decrypted_secrets
    WHERE name = 'notification_dispatch_url'
    ORDER BY updated_at DESC
    LIMIT 1;

    SELECT decrypted_secret INTO dispatch_secret
    FROM vault.decrypted_secrets
    WHERE name = 'notification_dispatch_secret'
    ORDER BY updated_at DESC
    LIMIT 1;

    IF dispatch_url IS NULL OR dispatch_secret IS NULL OR dispatch_url !~ '^https://' THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := dispatch_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || dispatch_secret
        ),
        body := jsonb_build_object('source', 'supabase'),
        timeout_milliseconds := 5000
    );
EXCEPTION WHEN OTHERS THEN
    -- Event insertion must not fail merely because the dispatcher is unavailable.
    RAISE WARNING 'Unable to wake notification dispatcher (SQLSTATE %)', SQLSTATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_access_module(raw_module TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT CASE COALESCE(raw_module, '')
        WHEN 'snowplow_detection' THEN 'roads'
        WHEN 'snow_detection' THEN 'roads'
        WHEN 'puddle_detection' THEN 'roads'
        WHEN 'pothole_detection' THEN 'roads'
        WHEN 'snow_pile_detection' THEN 'roads'
        WHEN 'camera_check' THEN 'roads'
        WHEN 'dahua_detection' THEN 'shore'
        WHEN 'shore_security' THEN 'shore'
        WHEN 'shore_safety' THEN 'shore'
        WHEN 'park_monitoring' THEN 'parks'
        WHEN 'safe_park' THEN 'parks'
        WHEN 'transport_monitoring' THEN 'transport'
        WHEN 'transport_control' THEN 'transport'
        WHEN 'bus_stop_monitoring' THEN 'stops'
        WHEN 'stop_monitoring' THEN 'stops'
        WHEN 'controller' THEN 'stops'
        ELSE COALESCE(raw_module, '')
    END
$$;

CREATE OR REPLACE FUNCTION public.notification_canonical_event_type(
    event_source TEXT,
    access_module TEXT,
    raw_event_type TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT CASE
        WHEN event_source = 'alerts'
         AND access_module = 'shore'
         AND raw_event_type = 'tripwire'
        THEN 'line_cross'
        WHEN event_source = 'alerts'
         AND access_module = 'stops'
         AND raw_event_type = ANY(ARRAY[
            'trash_overflow',
            'trash_bin_overflow',
            'bin_overflow',
            'bin_full',
            'garbage_overflow',
            'stop_trash_overflow',
            'stop_bin_overflow',
            'overflowing_trash',
            'overflowing_bin',
            'trash_full',
            'park_trash_overflow'
         ]::TEXT[])
        THEN 'bin_full'
        ELSE COALESCE(raw_event_type, 'event')
    END
$$;

CREATE OR REPLACE FUNCTION public.notification_delivery_event_key(payload JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT COALESCE(
        payload ->> 'event_key',
        (payload ->> 'source') || ':' ||
        public.notification_access_module(payload ->> 'module_name') || ':' ||
        public.notification_canonical_event_type(
            payload ->> 'source',
            public.notification_access_module(payload ->> 'module_name'),
            payload ->> 'event_type'
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.enqueue_event_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    event_row JSONB := to_jsonb(NEW);
    event_payload JSONB;
    event_source TEXT := TG_TABLE_NAME;
    access_module TEXT;
    canonical_event_type TEXT;
    event_key TEXT;
    inserted_count INTEGER := 0;
BEGIN
    IF event_source NOT IN ('alerts', 'controller_alerts') THEN
        RAISE EXCEPTION 'Unsupported notification source: %', event_source;
    END IF;

    access_module := public.notification_access_module(event_row ->> 'module_name');
    canonical_event_type := public.notification_canonical_event_type(
        event_source,
        access_module,
        CASE
            WHEN event_source = 'alerts' THEN COALESCE(event_row ->> 'alert_type', 'event')
            ELSE COALESCE(event_row ->> 'category', 'event')
        END
    );
    event_key := event_source || ':' || access_module || ':' || canonical_event_type;

    event_payload := jsonb_build_object(
        'source', event_source,
        'event_id', event_row ->> 'id',
        'event_key', event_key,
        'module_name', LEFT(access_module, 100),
        'event_type', LEFT(canonical_event_type, 200),
        'message', LEFT(COALESCE(event_row ->> 'message', 'Новое событие'), 4000),
        'severity', CASE
            WHEN event_source = 'alerts' THEN COALESCE(event_row ->> 'severity', 'не указана')
            ELSE COALESCE(event_row ->> 'alarm', 'не указана')
        END,
        'timestamp', CASE
            WHEN event_source = 'alerts' THEN COALESCE(event_row ->> 'timestamp', event_row ->> 'created_at')
            ELSE event_row ->> 'created_at'
        END,
        'clip_path', event_row -> 'clip_path'
    );

    INSERT INTO public.notification_deliveries (
        source,
        event_id,
        user_id,
        channel,
        recipient,
        payload
    )
    SELECT
        event_source,
        event_row ->> 'id',
        preferences.user_id,
        destination.channel,
        destination.recipient,
        event_payload
    FROM public.notification_preferences AS preferences
    INNER JOIN public.profiles AS profile ON profile.id = preferences.user_id
    CROSS JOIN LATERAL (
        VALUES
            (
                'email'::TEXT,
                CASE WHEN preferences.email_enabled THEN preferences.email END,
                preferences.email_event_types
            ),
            (
                'max'::TEXT,
                CASE WHEN preferences.max_enabled THEN preferences.max_user_id END,
                preferences.max_event_types
            )
    ) AS destination(channel, recipient, selected_types)
    WHERE destination.recipient IS NOT NULL
      AND access_module = ANY(COALESCE(profile.modules, ARRAY[]::TEXT[]))
      AND (
          destination.selected_types IS NULL
          OR event_key = ANY(destination.selected_types)
      )
    ON CONFLICT (source, event_id, user_id, channel) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    IF inserted_count > 0 THEN
        PERFORM public.wake_notification_dispatcher();
    END IF;

    RETURN NEW;
END;
$$;

-- Delivery remains inactive after this schema migration. Apply
-- notifications_activate.sql only after the application endpoints, Vault
-- secrets and MAX webhook are ready.

CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(
    worker_token UUID,
    batch_size INTEGER DEFAULT 20
)
RETURNS SETOF public.notification_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    UPDATE public.notification_deliveries AS filtered
    SET status = 'cancelled',
        lease_until = NULL,
        lease_token = NULL,
        last_error = NULL
    WHERE filtered.status = 'pending'
      AND NOT EXISTS (
          SELECT 1
          FROM public.notification_preferences AS preference
          WHERE preference.user_id = filtered.user_id
            AND (
                (
                    filtered.channel = 'email'
                    AND preference.email_enabled
                    AND preference.email = filtered.recipient
                    AND (
                        preference.email_event_types IS NULL
                        OR public.notification_delivery_event_key(filtered.payload)
                            = ANY(preference.email_event_types)
                    )
                )
                OR
                (
                    filtered.channel = 'max'
                    AND preference.max_enabled
                    AND preference.max_user_id = filtered.recipient
                    AND (
                        preference.max_event_types IS NULL
                        OR public.notification_delivery_event_key(filtered.payload)
                            = ANY(preference.max_event_types)
                    )
                )
            )
      );

    UPDATE public.notification_deliveries AS exhausted
    SET status = 'failed',
        lease_until = NULL,
        lease_token = NULL,
        last_error = COALESCE(exhausted.last_error, 'Delivery lease expired after maximum attempts')
    WHERE exhausted.attempts >= 5
      AND (
          (exhausted.status = 'pending' AND exhausted.next_attempt_at <= NOW())
          OR
          (exhausted.status = 'processing' AND exhausted.lease_until < NOW())
      );

    RETURN QUERY
    WITH candidates AS MATERIALIZED (
        SELECT delivery.id
        FROM public.notification_deliveries AS delivery
        WHERE delivery.attempts < 5
          AND (
              (delivery.status = 'pending' AND delivery.next_attempt_at <= NOW())
              OR
              (delivery.status = 'processing' AND delivery.lease_until < NOW())
          )
          AND EXISTS (
              SELECT 1
              FROM public.notification_preferences AS preference
              WHERE preference.user_id = delivery.user_id
                AND (
                    (
                        delivery.channel = 'email'
                        AND preference.email_enabled
                        AND preference.email = delivery.recipient
                        AND (
                            preference.email_event_types IS NULL
                            OR public.notification_delivery_event_key(delivery.payload)
                                = ANY(preference.email_event_types)
                        )
                    )
                    OR
                    (
                        delivery.channel = 'max'
                        AND preference.max_enabled
                        AND preference.max_user_id = delivery.recipient
                        AND (
                            preference.max_event_types IS NULL
                            OR public.notification_delivery_event_key(delivery.payload)
                                = ANY(preference.max_event_types)
                        )
                    )
                )
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.notification_deliveries AS active
              WHERE active.channel = delivery.channel
                AND active.recipient = delivery.recipient
                AND active.status = 'processing'
                AND active.lease_until >= NOW()
          )
        ORDER BY delivery.next_attempt_at, delivery.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT LEAST(GREATEST(batch_size, 1), 50) * 4
    ), serialized AS (
        SELECT DISTINCT ON (delivery.channel, delivery.recipient) delivery.id
        FROM candidates
        INNER JOIN public.notification_deliveries AS delivery USING (id)
        WHERE pg_try_advisory_xact_lock(
            hashtextextended(delivery.channel || ':' || delivery.recipient, 0)
        )
        ORDER BY delivery.channel, delivery.recipient, delivery.created_at
        LIMIT LEAST(GREATEST(batch_size, 1), 50)
    ), claimed AS (
        UPDATE public.notification_deliveries AS delivery
        SET status = 'processing',
            attempts = delivery.attempts + 1,
            lease_until = NOW() + INTERVAL '2 minutes',
            lease_token = worker_token,
            last_error = NULL
        FROM serialized
        WHERE delivery.id = serialized.id
        RETURNING delivery.*
    )
    SELECT * FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_notification_event_types(
    requested_user_id UUID,
    requested_email_types TEXT[],
    requested_max_types TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    INSERT INTO public.notification_preferences (
        user_id,
        email_event_types,
        max_event_types
    ) VALUES (
        requested_user_id,
        requested_email_types,
        requested_max_types
    )
    ON CONFLICT (user_id) DO UPDATE
    SET email_event_types = EXCLUDED.email_event_types,
        max_event_types = EXCLUDED.max_event_types;

    UPDATE public.notification_deliveries AS delivery
    SET status = 'cancelled',
        lease_until = NULL,
        lease_token = NULL,
        last_error = NULL
    WHERE delivery.user_id = requested_user_id
      AND delivery.status = 'pending'
      AND (
          (
              delivery.channel = 'email'
              AND requested_email_types IS NOT NULL
              AND NOT (
                  public.notification_delivery_event_key(delivery.payload)
                  = ANY(requested_email_types)
              )
          )
          OR
          (
              delivery.channel = 'max'
              AND requested_max_types IS NOT NULL
              AND NOT (
                  public.notification_delivery_event_key(delivery.payload)
                  = ANY(requested_max_types)
              )
          )
      );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_max_link_token(
    requested_token_hash TEXT,
    requested_max_user_id TEXT,
    requested_display_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    link_token public.max_link_tokens%ROWTYPE;
BEGIN
    IF requested_token_hash !~ '^[0-9a-f]{64}$'
       OR requested_max_user_id !~ '^[0-9]+$' THEN
        RETURN NULL;
    END IF;

    SELECT * INTO link_token
    FROM public.max_link_tokens
    WHERE token_hash = requested_token_hash
    FOR UPDATE;

    IF NOT FOUND OR link_token.expires_at <= NOW() THEN
        RETURN NULL;
    END IF;

    IF link_token.consumed_at IS NOT NULL THEN
        IF link_token.linked_max_user_id = requested_max_user_id THEN
            RETURN link_token.user_id;
        END IF;
        RETURN NULL;
    END IF;

    UPDATE public.max_link_tokens
    SET consumed_at = NOW(), linked_max_user_id = requested_max_user_id
    WHERE id = link_token.id;

    INSERT INTO public.notification_preferences (
        user_id,
        max_user_id,
        max_display_name,
        max_enabled
    ) VALUES (
        link_token.user_id,
        requested_max_user_id,
        NULLIF(LEFT(TRIM(requested_display_name), 160), ''),
        TRUE
    )
    ON CONFLICT (user_id) DO UPDATE
    SET max_user_id = EXCLUDED.max_user_id,
        max_display_name = EXCLUDED.max_display_name,
        max_enabled = TRUE;

    RETURN link_token.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_notification_email_test(
    requested_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    claimed_count INTEGER := 0;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(requested_user_id::TEXT, 0));

    INSERT INTO public.notification_preferences (
        user_id,
        last_test_email_at
    ) VALUES (
        requested_user_id,
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET last_test_email_at = EXCLUDED.last_test_email_at
    WHERE public.notification_preferences.last_test_email_at IS NULL
       OR public.notification_preferences.last_test_email_at <= NOW() - INTERVAL '1 minute';

    GET DIAGNOSTICS claimed_count = ROW_COUNT;
    RETURN claimed_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_notification_history()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    DELETE FROM public.notification_deliveries
    WHERE status IN ('sent', 'cancelled')
      AND updated_at < NOW() - INTERVAL '30 days';

    DELETE FROM public.notification_deliveries
    WHERE status = 'failed'
      AND updated_at < NOW() - INTERVAL '90 days';

    DELETE FROM public.max_link_tokens
    WHERE created_at < NOW() - INTERVAL '1 day';
END;
$$;

REVOKE ALL ON FUNCTION public.wake_notification_dispatcher() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_access_module(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_canonical_event_type(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_delivery_event_key(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_event_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_deliveries(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_notification_event_types(UUID, TEXT[], TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_max_link_token(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_email_test(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_notification_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_notification_event_types(UUID, TEXT[], TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_max_link_token(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_notification_email_test(UUID) TO service_role;

COMMIT;

-- Activate with notifications_activate.sql. Disable without deleting queue
-- data with notifications_deactivate.sql.
