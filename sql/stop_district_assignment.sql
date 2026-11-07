-- Привязка остановки к микрорайону — хранимый факт, а не вычисление на клиенте.
--
-- Раньше микрорайон считался в браузере двумя разными способами: по полигонам
-- districts (график покрытия) и по ближайшему центру из захардкоженного
-- lib/districts.ts (текущая аналитика). Остановки на общей границе двух
-- микрорайонов (а в Сургуте границы идут по улицам, где и стоят остановки)
-- выпадали из подсчёта как «ambiguous».
--
--   district_id     — микрорайон остановки; NULL = вне всех полигонов
--                     (посёлки, трассы) или полигона ещё нет в districts;
--   district_manual — district_id поставлен руками, триггеры его не трогают.
--
-- Правило: полигон, внутри которого лежит точка; если точка на границе или
-- чуть снаружи — ближайший полигон в пределах 150 м; при равенстве — меньший id.
--
-- Новые остановки и перенос остановки получают микрорайон триггером на
-- bus_stops, изменение границ в districts пересчитывает остановки триггером
-- на districts. Бэкфилл — в конце файла.
--
-- Безопасно запускать повторно.

BEGIN;

-- Расстояния считаются в geography, поэтому обе таблицы должны быть в WGS84.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT geom FROM public.districts WHERE geom IS NOT NULL AND st_srid(geom) <> 4326
    UNION ALL
    SELECT geom FROM public.bus_stops WHERE geom IS NOT NULL AND st_srid(geom) <> 4326
  ) s;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Геометрии не в SRID 4326: %', bad;
  END IF;
END $$;

ALTER TABLE public.bus_stops
  ADD COLUMN IF NOT EXISTS district_id int REFERENCES public.districts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS district_manual boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bus_stops_district_id ON public.bus_stops (district_id);

COMMENT ON COLUMN public.bus_stops.district_id IS
  'Микрорайон остановки. Ставится триггером по districts.geom; NULL — вне всех полигонов.';
COMMENT ON COLUMN public.bus_stops.district_manual IS
  'district_id задан вручную; автоматический пересчёт его не перезаписывает.';

CREATE OR REPLACE FUNCTION public.resolve_stop_district(p_geom geometry)
RETURNS int
LANGUAGE sql STABLE AS $$
  SELECT d.id
    FROM public.districts d
   WHERE p_geom IS NOT NULL
     AND d.geom IS NOT NULL
     AND st_dwithin(d.geom::geography, p_geom::geography, 150)
   ORDER BY st_distance(d.geom::geography, p_geom::geography), d.id
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.bus_stops_set_district()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW.district_manual THEN
    NEW.district_id := public.resolve_stop_district(NEW.geom);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bus_stops_set_district ON public.bus_stops;
CREATE TRIGGER bus_stops_set_district
  BEFORE INSERT OR UPDATE OF geom, district_manual ON public.bus_stops
  FOR EACH ROW EXECUTE FUNCTION public.bus_stops_set_district();

-- Границы поменялись (или добавился/удалился микрорайон) — пересчитать все
-- автоматические привязки. Остановок сотни, это дешевле точечной логики.
CREATE OR REPLACE FUNCTION public.districts_reassign_stops()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.bus_stops b
     SET district_id = public.resolve_stop_district(b.geom)
   WHERE NOT b.district_manual
     AND b.district_id IS DISTINCT FROM public.resolve_stop_district(b.geom);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS districts_reassign_stops ON public.districts;
CREATE TRIGGER districts_reassign_stops
  AFTER INSERT OR DELETE OR UPDATE OF geom ON public.districts
  FOR EACH STATEMENT EXECUTE FUNCTION public.districts_reassign_stops();

-- Бэкфилл. map_inventory_stops следит только за geom/id/ip_address/has_controller,
-- поэтому этот UPDATE историю инвентаря не трогает.
UPDATE public.bus_stops b
   SET district_id = public.resolve_stop_district(b.geom)
 WHERE NOT b.district_manual
   AND b.district_id IS DISTINCT FROM public.resolve_stop_district(b.geom);

COMMIT;

-- Проверка после запуска:
--
-- Сколько остановок в каждом микрорайоне (микрорайоны без остановок тоже):
--   SELECT d.id, d.name, count(b.id) AS stops
--     FROM public.districts d LEFT JOIN public.bus_stops b ON b.district_id = d.id
--    GROUP BY d.id, d.name ORDER BY d.name;
--
-- Остановки без микрорайона — кандидаты на недостающие полигоны:
--   SELECT id, name, address, st_y(geom) AS lat, st_x(geom) AS lon
--     FROM public.bus_stops WHERE district_id IS NULL ORDER BY name;
--
-- Ручная привязка:
--   UPDATE public.bus_stops SET district_id = <id>, district_manual = true WHERE id = <stop>;
