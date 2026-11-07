-- Границы микрорайонов из 2ГИС (объекты adm_div / living_area).
--
-- В districts изначально лежали полигоны из OSM, но там есть не все
-- микрорайоны Сургута. Недостающие добираются из ответа 2ГИС: в
-- geometry.selection — WKT полигона (lon lat, WGS84), в geometry.centroid — WKT точки.
--
--   dgis_id — id объекта в 2ГИС; по нему повторная загрузка обновляет строку,
--             а не плодит дубли.
--
-- Если такой микрорайон уже есть из OSM (полигоны перекрываются больше чем
-- наполовину), строка не дублируется: ей проставляется dgis_id, а границы и
-- название заменяются на данные 2ГИС. Иначе две пересекающиеся строки
-- делили бы между собой одни и те же остановки.
--
-- Если уже применён sql/stop_district_assignment.sql, остановки
-- перепривязываются автоматически триггером districts_reassign_stops.
--
-- Безопасно запускать повторно.

BEGIN;

ALTER TABLE public.districts
  ADD COLUMN IF NOT EXISTS dgis_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'districts_dgis_id_key') THEN
    ALTER TABLE public.districts ADD CONSTRAINT districts_dgis_id_key UNIQUE (dgis_id);
  END IF;
END $$;

COMMENT ON COLUMN public.districts.dgis_id IS 'id объекта adm_div в 2ГИС, если границы взяты оттуда.';

-- Принимает один объект из ответа 2ГИС (то, что лежит под ключом "0").
-- Возвращает districts.id.
CREATE OR REPLACE FUNCTION public.upsert_district_from_2gis(item jsonb)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_dgis_id  bigint := (item->>'id')::bigint;
  v_name     text   := item->>'name';
  v_place    text   := coalesce(item->>'detailed_subtype', item->>'subtype', 'neighbourhood');
  v_geom     geometry;
  v_centroid geometry;
  v_id       int;
BEGIN
  IF v_dgis_id IS NULL OR v_name IS NULL OR item #>> '{geometry,selection}' IS NULL THEN
    RAISE EXCEPTION 'В объекте 2ГИС нет id, name или geometry.selection: %', left(item::text, 200);
  END IF;

  v_geom := st_makevalid(st_geomfromtext(item #>> '{geometry,selection}', 4326));
  v_centroid := CASE
    WHEN item #>> '{geometry,centroid}' IS NOT NULL THEN st_geomfromtext(item #>> '{geometry,centroid}', 4326)
    ELSE st_pointonsurface(v_geom)
  END;

  -- 1. Уже загружали из 2ГИС.
  SELECT id INTO v_id FROM public.districts WHERE dgis_id = v_dgis_id;

  -- 2. Тот же микрорайон, пришедший из OSM.
  IF v_id IS NULL THEN
    SELECT d.id INTO v_id
      FROM public.districts d
     WHERE d.dgis_id IS NULL
       AND d.geom IS NOT NULL
       AND st_intersects(d.geom, v_geom)
       AND st_area(st_intersection(d.geom, v_geom)) > 0.5 * least(st_area(d.geom), st_area(v_geom))
     ORDER BY st_area(st_intersection(d.geom, v_geom)) DESC
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.districts (name, place, geom, centroid, dgis_id)
    VALUES (v_name, v_place, v_geom, v_centroid, v_dgis_id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.districts
       SET name = v_name, place = v_place, geom = v_geom, centroid = v_centroid, dgis_id = v_dgis_id
     WHERE id = v_id;
  END IF;

  RETURN v_id;
END $$;

COMMIT;

-- Использование — вставить ответ 2ГИС целиком (объект с ключами "0", "1", … или массив):
--
--   SELECT public.upsert_district_from_2gis(value)
--     FROM jsonb_each($json${ "0": { ... } }$json$::jsonb);
--
--   -- для массива: FROM jsonb_array_elements($json$[ ... ]$json$::jsonb)
--
-- Проверка перекрытий между микрорайонами (должно быть пусто или почти пусто):
--   SELECT a.name, b.name, round(st_area(st_intersection(a.geom, b.geom)::geography)) AS m2
--     FROM public.districts a JOIN public.districts b ON a.id < b.id AND st_intersects(a.geom, b.geom)
--    WHERE st_area(st_intersection(a.geom, b.geom)::geography) > 100
--    ORDER BY m2 DESC;
