-- Start history from the migration time; never invent earlier map totals.
BEGIN;
CREATE TABLE IF NOT EXISTS public.map_inventory_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    cameras integer NOT NULL CHECK (cameras >= 0),
    stops integer NOT NULL CHECK (stops >= 0),
    sensor_stops integer NOT NULL CHECK (sensor_stops >= 0)
);
CREATE INDEX IF NOT EXISTS map_inventory_history_time_idx ON public.map_inventory_history(recorded_at, id);
ALTER TABLE public.map_inventory_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.map_inventory_history FROM anon, authenticated;
GRANT SELECT ON public.map_inventory_history TO authenticated;
GRANT SELECT ON public.map_inventory_history TO service_role;
DROP POLICY IF EXISTS map_inventory_read ON public.map_inventory_history;
CREATE POLICY map_inventory_read ON public.map_inventory_history FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
        AND (role = 'admin' OR 'stops' = ANY(modules)))
);

CREATE OR REPLACE FUNCTION public.capture_map_inventory() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE sensor_total integer; camera_total integer; stop_total integer; previous public.map_inventory_history%ROWTYPE;
BEGIN
    -- Serialize captures so concurrent edits cannot publish an older total last.
    PERFORM pg_advisory_xact_lock(68291, 1);
    SELECT count(*) INTO stop_total FROM public.bus_stops
        WHERE geom IS NOT NULL AND public.ST_GeometryType(geom) = 'ST_Point';
    SELECT count(DISTINCT c.camera_index) INTO camera_total FROM public.cameras c
        WHERE c.module = 'stops' AND (
            (c.bus_stop_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bus_stops s
                WHERE s.id = c.bus_stop_id AND s.geom IS NOT NULL AND public.ST_GeometryType(s.geom) = 'ST_Point'))
            OR (c.bus_stop_id IS NULL AND c.lat BETWEEN -90 AND 90 AND c.lng BETWEEN -180 AND 180)
        );
    SELECT count(*) INTO sensor_total FROM public.bus_stops
        WHERE geom IS NOT NULL AND public.ST_GeometryType(geom) = 'ST_Point' AND nullif(btrim(ip_address), '') IS NOT NULL;
    SELECT * INTO previous FROM public.map_inventory_history ORDER BY recorded_at DESC, id DESC LIMIT 1;
    IF NOT FOUND OR previous.cameras <> camera_total OR previous.stops <> stop_total OR previous.sensor_stops <> sensor_total THEN
        INSERT INTO public.map_inventory_history(cameras, stops, sensor_stops) VALUES (camera_total, stop_total, sensor_total);
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_map_inventory() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_map_inventory_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM public.capture_map_inventory();
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_map_inventory_trigger() FROM PUBLIC, anon, authenticated;

-- Status updates never change map membership and do not write history.
DROP TRIGGER IF EXISTS map_inventory_cameras ON public.cameras;
CREATE TRIGGER map_inventory_cameras AFTER INSERT OR DELETE OR TRUNCATE OR UPDATE OF module, bus_stop_id, lat, lng, camera_index
    ON public.cameras FOR EACH STATEMENT EXECUTE FUNCTION public.capture_map_inventory_trigger();
DROP TRIGGER IF EXISTS map_inventory_stops ON public.bus_stops;
CREATE TRIGGER map_inventory_stops AFTER INSERT OR DELETE OR TRUNCATE OR UPDATE OF geom, id, ip_address
    ON public.bus_stops FOR EACH STATEMENT EXECUTE FUNCTION public.capture_map_inventory_trigger();
SELECT public.capture_map_inventory();
COMMIT;
