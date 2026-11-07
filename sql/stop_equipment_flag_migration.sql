-- Наличие контроллера на остановке — отдельный факт, а не вывод из ip_address.
--
-- «Без оборудования» на карте (синяя точка, строка в правой панели, фильтр) —
-- это остановка, у которой нет ни камер, ни контроллера. Раньше «контроллер
-- есть» выводилось из непустого bus_stops.ip_address, и 13 остановок попадали
-- в «без оборудования» ошибочно: оборудование на них смонтировано, но пока вся
-- группа отвечает через один общий адрес, поэтому ip_address у них пуст —
-- иначе контроллер-воркер опрашивал бы один адрес 13 раз и приписывал бы
-- показания одного контроллера тринадцати остановкам.
--
--   has_controller — контроллер смонтирован (паспортный факт);
--   ip_address     — адрес для опроса, если он известен и индивидуален.
--
-- Когда каждой остановке выдадут собственный адрес в подсети, заполнится
-- ip_address, а флаг останется прежним. Воркеры по-прежнему опрашивают только
-- строки с непустым ip_address и флаг не читают.
--
-- После этой миграции заново прогнать sql/map_inventory_history.sql: там
-- «остановки с датчиками» считаются по тому же признаку.
--
-- Безопасно запускать повторно.

BEGIN;

ALTER TABLE public.bus_stops
  ADD COLUMN IF NOT EXISTS has_controller boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bus_stops.has_controller IS
  'Контроллер смонтирован на остановке. Не путать с ip_address: адрес может быть неизвестен или общий на группу остановок, оборудование при этом есть.';

-- Бэкфилл: остановки с собственным адресом + те, у кого в файле стояла
-- IP-заглушка (misc/bus_stops_refresh.sql репозитория bus_stop_analytics
-- сохранил её текстом в note, а сам ip_address оставил пустым).
UPDATE public.bus_stops SET has_controller = true
 WHERE has_controller = false
   AND (nullif(btrim(ip_address), '') IS NOT NULL
        OR btrim(note) LIKE 'IP в файле:%');

-- Ожидается: с контроллером 106, из них без собственного IP 13.
DO $$
DECLARE equipped int; shared_ip int;
BEGIN
  SELECT count(*) FILTER (WHERE has_controller),
         count(*) FILTER (WHERE has_controller AND nullif(btrim(ip_address), '') IS NULL)
    INTO equipped, shared_ip
    FROM public.bus_stops;
  RAISE NOTICE 'Остановок с контроллером: % (из них за общим адресом: %)', equipped, shared_ip;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
