-- Свести типы событий контроллера к одному — «инцидент».
--
-- Раньше срабатывание датчика на остановке приходило как `glass_break` (а ещё
-- раньше — как `digital input`) и показывалось на карте как «вандализм», рядом
-- с отдельным статусом «отказ обогревателя».
--
-- Ни то, ни другое не соответствует тому, что реально знает система:
--   * датчик фиксирует отклонение, но не причину — мокрый пакет, брошенный в
--     стекло, срабатывает так же, как удар, поэтому «вандализм» утверждает
--     больше, чем можно подтвердить;
--   * обогревателя на остановках нет и не планируется — прежний оранжевый
--     статус выводился из того же дискретного входа 1, что и «вандализм».
--
-- Бэкенд теперь пишет controller_alerts.category = 'incident'. Миграция делает
-- так, чтобы это не порвало уже существующие подписки:
--   1. notification_canonical_event_type() сворачивает старые категории в
--      'incident', поэтому и архивные строки, и новые дают один event_key;
--   2. сохранённые подписки переписываются на новый ключ — иначе подписчик
--      молча перестал бы получать эти уведомления.
--
-- Идемпотентна: повторный запуск ничего не меняет. Сами строки controller_alerts
-- не трогаются — история остаётся как была, её сворачивает функция на чтении.

BEGIN;

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
        WHEN event_source = 'controller_alerts'
         AND access_module = 'stops'
         AND raw_event_type = ANY(ARRAY[
            'incident',
            'glass_break',
            'digital input'
         ]::TEXT[])
        THEN 'incident'
        ELSE COALESCE(raw_event_type, 'event')
    END
$$;

-- Переписать сохранённые подписки на новый ключ.
UPDATE public.notification_preferences
SET email_event_types = (
        SELECT ARRAY(
            SELECT DISTINCT CASE
                WHEN t IN (
                    'controller_alerts:stops:glass_break',
                    'controller_alerts:stops:digital input'
                ) THEN 'controller_alerts:stops:incident'
                ELSE t
            END
            FROM unnest(email_event_types) AS t
            ORDER BY 1
        )
    )
WHERE email_event_types && ARRAY[
    'controller_alerts:stops:glass_break',
    'controller_alerts:stops:digital input'
]::TEXT[];

UPDATE public.notification_preferences
SET max_event_types = (
        SELECT ARRAY(
            SELECT DISTINCT CASE
                WHEN t IN (
                    'controller_alerts:stops:glass_break',
                    'controller_alerts:stops:digital input'
                ) THEN 'controller_alerts:stops:incident'
                ELSE t
            END
            FROM unnest(max_event_types) AS t
            ORDER BY 1
        )
    )
WHERE max_event_types && ARRAY[
    'controller_alerts:stops:glass_break',
    'controller_alerts:stops:digital input'
]::TEXT[];

COMMIT;
