-- Слияние остановок «Умного транспорта» с bus_stops. «Умный транспорт» — источник
-- истины для названия, направления и координат. id строк bus_stops не меняются:
-- на них ссылаются cameras, stop_sensor_states, stop_controller_credentials
-- (ON DELETE CASCADE) и controller_alerts.
--
-- Служебные данные слияния живут в отдельной таблице, а не в колонках bus_stops:
-- bus_stops входит в publication vector_replica_pub, и новая колонка без такой же
-- на реплике остановила бы подписку. bus_stop_merge в publication не входит.
--
-- Заполняется scripts/merge-smart-transport-stops.mjs. Идемпотентно.

CREATE TABLE IF NOT EXISTS public.bus_stop_merge (
  bus_stop_id INTEGER PRIMARY KEY REFERENCES public.bus_stops(id) ON DELETE CASCADE,
  smart_transport_id INTEGER,
  -- matched_geo | matched_name | renamed | inserted | hidden
  action TEXT NOT NULL,
  -- duplicate (на той же остановке есть строка с оборудованием) | not_in_smart_transport
  map_hidden_reason TEXT,
  -- Значения до слияния — для отката.
  legacy JSONB,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bus_stop_merge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read bus stop merge" ON public.bus_stop_merge;
CREATE POLICY "Authenticated read bus stop merge"
  ON public.bus_stop_merge FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.bus_stop_merge FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.bus_stop_merge FROM authenticated;
GRANT SELECT ON public.bus_stop_merge TO authenticated;
GRANT ALL ON public.bus_stop_merge TO service_role;

-- Карта не показывает дубли и остановки, которых нет в «Умном транспорте».
CREATE OR REPLACE FUNCTION public.get_bus_stops_geojson()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object(
          'id', b.id,
          'name', b.name,
          'short_name', b.short_name,
          'description', b.description,
          'address', b.address
        ),
        'geometry', ST_AsGeoJSON(b.geom)::jsonb
      )
    ), '[]'::jsonb)
  )
  from bus_stops b
  where b.geom is not null
    and ST_GeometryType(b.geom) = 'ST_Point'
    and not exists (
      select 1 from bus_stop_merge m
      where m.bus_stop_id = b.id and m.map_hidden_reason is not null
    );
$function$;

NOTIFY pgrst, 'reload schema';
