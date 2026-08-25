-- Activate notification fan-out only after endpoints, secrets and the MAX
-- webhook are ready. Safe to re-apply.

BEGIN;

DO $$
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

    IF dispatch_url IS NULL OR dispatch_url !~ '^https://' THEN
        RAISE EXCEPTION 'Vault secret notification_dispatch_url is missing or is not HTTPS';
    END IF;
    IF dispatch_secret IS NULL OR char_length(dispatch_secret) < 32 THEN
        RAISE EXCEPTION 'Vault secret notification_dispatch_secret is missing or too short';
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS alerts_enqueue_notifications ON public.alerts;
CREATE TRIGGER alerts_enqueue_notifications
    AFTER INSERT ON public.alerts
    FOR EACH ROW EXECUTE FUNCTION public.enqueue_event_notifications();

DROP TRIGGER IF EXISTS controller_alerts_enqueue_notifications ON public.controller_alerts;
CREATE TRIGGER controller_alerts_enqueue_notifications
    AFTER INSERT ON public.controller_alerts
    FOR EACH ROW EXECUTE FUNCTION public.enqueue_event_notifications();

SELECT cron.schedule(
    'notifications-dispatch-every-minute',
    '* * * * *',
    'SELECT public.wake_notification_dispatcher()'
);

SELECT cron.schedule(
    'notifications-cleanup-daily',
    '17 3 * * *',
    'SELECT public.cleanup_notification_history()'
);

COMMIT;
