-- Часовая агрегация пассажирской аналитики на стороне базы.
--
-- Сайт раньше читал минутные окна построчно с лимитом 60 000 строк. С ноября
-- камер стало около 90, и лимит перекрывает меньше половины суток: утренние
-- часы даже у периода «Сегодня» отбрасывались.
--
-- Функция возвращает одну строку json, поэтому лимит строк PostgREST на неё
-- не действует и повторного чтения по страницам нет.
--   hours:  [location_id, hour_start, weighted_sum, weight, peak, windows]
--   latest: [location_id, window_start, person_count_avg]
-- Замер на 125 (1,86 млн строк): 1,5 с за всё время, 0,6 с за 30 дней.
--
-- Индекс создаётся отдельно от транзакции (CONCURRENTLY): выполнять этот файл
-- через psql без --single-transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_busyness_windows_window_start
    ON public.busyness_windows (window_start DESC);

CREATE OR REPLACE FUNCTION public.get_stop_load_hourly(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
    WITH hours AS (
        SELECT
            location_id,
            date_bin('1 hour', window_start, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS hour_start,
            SUM(person_count_avg * GREATEST(COALESCE(sample_count, 0), 1)) AS weighted_sum,
            SUM(GREATEST(COALESCE(sample_count, 0), 1)) AS weight,
            MAX(COALESCE(person_count_max, 0)) AS peak,
            COUNT(*) AS windows,
            MAX(window_start) AS newest_window
        FROM public.busyness_windows
        WHERE window_start >= p_from
          AND window_start <= p_to
          AND person_count_avg >= 0
          AND (sample_count IS NULL OR sample_count > 0)
        GROUP BY 1, 2
    ),
    newest AS (
        SELECT location_id, MAX(newest_window) AS window_start
        FROM hours
        GROUP BY 1
    )
    SELECT json_build_object(
        'hours', COALESCE((
            SELECT json_agg(json_build_array(location_id, hour_start, weighted_sum, weight, peak, windows))
            FROM hours
        ), '[]'::json),
        'latest', COALESCE((
            SELECT json_agg(json_build_array(n.location_id, n.window_start, w.person_count_avg))
            FROM newest n
            JOIN public.busyness_windows w USING (location_id, window_start)
        ), '[]'::json)
    );
$$;

-- Права как у самой таблицы: функция выполняется от имени вызывающего, RLS действует.
REVOKE ALL ON FUNCTION public.get_stop_load_hourly(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stop_load_hourly(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- PostgREST должен увидеть новую функцию.
NOTIFY pgrst, 'reload schema';
