-- АНАЛИТИЧЕСКИЕ ЗАПРОСЫ ДЛЯ АДМИНИСТРАЦИИ ГОРОДА (ФИНАЛЬНАЯ ВЕРСИЯ)
-- Период анализа: Весь 2025 год
-- Основная метрика: Время реакции (reaction_h)

-- 1. АНАЛИЗ "ХВОСТОВ" РЕАКЦИИ ПО ПОДРЯДЧИКАМ И ТИПАМ СОБЫТИЙ
-- Вопрос: "У каких подрядчиков и по каким типам инцидентов зафиксированы наиболее длительные задержки реакции за год?"
-- Описание: Выявляет конкретные пары "подрядчик-инцидент", где 5% случаев (p95) имеют критические задержки.
SELECT
  contractor_id AS "ID Подрядчика",
  work_kind_ru AS "Тип работ",
  inc_type_ru AS "Тип инцидента",
  percentile_cont(0.50) WITHIN GROUP (ORDER BY reaction_h) AS "Медиана реакции (ч)",
  percentile_cont(0.90) WITHIN GROUP (ORDER BY reaction_h) AS "90% случаев (ч)",
  percentile_cont(0.95) WITHIN GROUP (ORDER BY reaction_h) AS "Худшие 5% (ч)",
  COUNT(*) AS "Всего инцидентов"
FROM prod_v_all_incidents
WHERE start_ts >= '2025-01-01' AND start_ts < '2025-12-31'
GROUP BY 1,2,3
HAVING COUNT(*) >= 5
ORDER BY "Худшие 5% (ч)" DESC;


-- 2. РЕЙТИНГ КАТЕГОРИЙ ПРОБЛЕМ ПО СЛОЖНОСТИ РЕАГИРОВАНИЯ
-- Вопрос: "Какие категории дорожных проблем вызывали наибольшие сложности с оперативным реагированием в течение года?"
-- Описание: Показывает типы инцидентов (наледь, грязь, знаки), по которым p90 времени реакции и % нарушений SLA максимальны.
SELECT
  work_kind_ru AS "Тип работ",
  inc_type_ru AS "Категория инцидента",
  percentile_cont(0.90) WITHIN GROUP (ORDER BY reaction_h) AS "Время реакции p90 (ч)",
  COUNT(*) AS "Кол-во инцидентов",
  ROUND(100.0 * SUM(CASE WHEN is_violation THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*)::numeric,0), 1) AS "% нарушений SLA"
FROM prod_v_all_incidents
WHERE start_ts >= '2025-01-01' AND start_ts < '2025-12-31'
GROUP BY 1,2
HAVING COUNT(*) >= 5
ORDER BY "Время реакции p90 (ч)" DESC;


-- 3. ПОЧАСОВОЙ ГРАФИК НАРУШЕНИЙ РЕГЛАМЕНТА
-- Вопрос: "В какие часы суток чаще всего нарушаются регламенты реагирования по различным типам инцидентов?"
-- Описание: Анализ "провалов" в оперативности в зависимости от времени суток и типа проблемы (уборка/ремонт).
SELECT
  work_kind_ru AS "Тип работ",
  inc_type_ru AS "Тип инцидента",
  EXTRACT(HOUR FROM start_ts)::int AS "Час суток",
  COUNT(*) AS "Всего инцидентов",
  SUM(CASE WHEN is_violation THEN 1 ELSE 0 END) AS "Кол-во нарушений",
  ROUND(100.0 * SUM(CASE WHEN is_violation THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*)::numeric,0), 1) AS "% просрочек"
FROM prod_v_all_incidents
WHERE start_ts >= '2025-01-01' AND start_ts < '2025-12-31'
GROUP BY 1,2,3
ORDER BY "% просрочек" DESC, "Всего инцидентов" DESC;


-- 4. ДИСЦИПЛИНА ПОДРЯДЧИКОВ ПО ДНЯМ НЕДЕЛИ
-- Вопрос: "В какие дни недели наблюдается снижение дисциплины при обработке дорожных инцидентов?"
-- Описание: Выявление системных задержек в выходные или праздничные дни в разрезе видов работ и типов событий.
SELECT
  work_kind_ru AS "Тип работ",
  inc_type_ru AS "Тип инцидента",
  CASE EXTRACT(DOW FROM start_ts)::int 
    WHEN 0 THEN '0. Воскресенье' WHEN 1 THEN '1. Понедельник' WHEN 2 THEN '2. Вторник'
    WHEN 3 THEN '3. Среда' WHEN 4 THEN '4. Четверг' WHEN 5 THEN '5. Пятница' WHEN 6 THEN '6. Суббота'
  END AS "День недели",
  COUNT(*) AS "Всего инцидентов",
  ROUND(100.0 * SUM(CASE WHEN is_violation THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*)::numeric,0), 1) AS "% нарушений"
FROM prod_v_all_incidents
WHERE start_ts >= '2025-01-01' AND start_ts < '2025-12-31'
GROUP BY 1,2,3
ORDER BY "День недели" ASC;


-- 5. ЭФФЕКТИВНОСТЬ РАБОТЫ СПЕЦТЕХНИКИ
-- Вопрос: "Насколько эффективно спецтехника справлялась с устранением выявленных проблем в течение года?"
-- Описание: Показывает процент выездов техники, которые привели к реальному изменению состояния участка (устранение инцидента).
SELECT
  vehicle_type_ru AS "Тип техники",
  COUNT(*) AS "Всего проездов",
  ROUND(100.0 * SUM(CASE WHEN changed_state THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*)::numeric,0), 1) AS "% успешных выездов"
FROM saturgen_maintenance_passes
WHERE ts >= '2025-01-01' AND ts < '2025-12-31'
GROUP BY 1
ORDER BY "% успешных выездов" DESC;


-- 6. ВЛИЯНИЕ УБОРКИ НА СКОРОСТЬ ТРАФИКА
-- Вопрос: "Как работа спецтехники повлияла на реальное увеличение скорости движения транспорта за год?"
-- Описание: Сравнение средней скорости потока "До" и "После" работы техники (анализ 3-часовых интервалов).
WITH p AS (
  SELECT ts, camera_id, vehicle_type_ru
  FROM saturgen_maintenance_passes
  WHERE changed_state = TRUE
    AND ts >= '2025-01-01' AND ts < '2025-12-31'
),
b AS (
  SELECT p.camera_id, p.ts, AVG(t.avg_speed_kmh) AS speed_before
  FROM p JOIN saturgen_traffic_metrics t ON t.camera_id = p.camera_id
   AND t.ts_bucket >= date_trunc('hour', p.ts) - interval '3 hours'
   AND t.ts_bucket <  date_trunc('hour', p.ts)
  GROUP BY 1,2
),
a AS (
  SELECT p.camera_id, p.ts, AVG(t.avg_speed_kmh) AS speed_after
  FROM p JOIN saturgen_traffic_metrics t ON t.camera_id = p.camera_id
   AND t.ts_bucket >= date_trunc('hour', p.ts)
   AND t.ts_bucket <  date_trunc('hour', p.ts) + interval '3 hours'
  GROUP BY 1,2
)
SELECT
  p.vehicle_type_ru AS "Тип техники",
  ROUND(AVG(a.speed_after - b.speed_before)::numeric, 2) AS "Прирост скорости (км/ч)",
  COUNT(*) AS "Подтвержденных выездов"
FROM p JOIN a USING (camera_id, ts) JOIN b USING (camera_id, ts)
GROUP BY 1
ORDER BY "Прирост скорости (км/ч)" DESC;


-- 7. ТЕХНИЧЕСКИЙ МОНИТОРИНГ КАМЕР (КАЧЕСТВО ДАННЫХ ЗА ГОД)
-- Вопрос: "Какие камеры имели наибольшие пробелы в данных за год и требуют технического обслуживания?"
-- Описание: Рейтинг видеокамер по количеству потерянных часов данных о трафике.
WITH hours AS (
  SELECT generate_series('2025-01-01 00:00:00'::timestamp, '2025-12-30 23:00:00'::timestamp, interval '1 hour') AS ts_bucket
),
expected AS (
  SELECT c.camera_id, h.ts_bucket FROM saturgen_cameras c CROSS JOIN hours h
),
actual AS (
  SELECT camera_id, ts_bucket FROM saturgen_traffic_metrics
  WHERE ts_bucket >= '2025-01-01' AND ts_bucket < '2025-12-31'
  GROUP BY 1,2
)
SELECT
  e.camera_id AS "ID Камеры",
  COUNT(*) AS "Ожидалось часов",
  SUM(CASE WHEN a.camera_id IS NULL THEN 1 ELSE 0 END) AS "Пропущено часов",
  ROUND(100.0 * SUM(CASE WHEN a.camera_id IS NULL THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*)::numeric,0), 1) AS "% потерь данных"
FROM expected e
LEFT JOIN actual a ON a.camera_id = e.camera_id AND a.ts_bucket = e.ts_bucket
GROUP BY 1
ORDER BY "% потерь данных" DESC
LIMIT 20;


-- 8. ЗАВИСИМОСТЬ СОБЛЮДЕНИЯ SLA ОТ ПОГОДНЫХ УСЛОВИЙ
-- Вопрос: "Как погодные условия влияли на долю нарушений регламента подрядными организациями в течение года?"
-- Описание: Объективный анализ роста просрочек в зависимости от уровня осадков и температуры.
SELECT
  w.precip_level_ru AS "Уровень осадков",
  ROUND(AVG(w.temp_c)::numeric, 1) AS "Ср. температура",
  COUNT(i.inc_id) AS "Всего инцидентов",
  ROUND(100.0 * SUM(CASE WHEN i.is_violation THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(i.inc_id)::numeric,0), 1) AS "% нарушений SLA"
FROM prod_v_all_incidents i
JOIN saturgen_weather w ON date_trunc('hour', i.start_ts) = date_trunc('hour', w.ts)
WHERE i.start_ts >= '2025-01-01' AND i.start_ts < '2025-12-31'
GROUP BY 1
ORDER BY "% нарушений SLA" DESC;
