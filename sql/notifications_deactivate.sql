-- Stop new fan-out and scheduled dispatch without deleting preferences or queue
-- data. Safe to re-apply.

BEGIN;

DROP TRIGGER IF EXISTS alerts_enqueue_notifications ON public.alerts;
DROP TRIGGER IF EXISTS controller_alerts_enqueue_notifications ON public.controller_alerts;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
    'notifications-dispatch-every-minute',
    'notifications-cleanup-daily'
);

COMMIT;
