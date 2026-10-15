#!/usr/bin/env node
// Слияние остановок «Умного транспорта» (smart_transport_stops) с bus_stops.
// «Умный транспорт» — источник истины для названия, направления и координат.
// Требует sql/smart_transport_merge_schema.sql и свежий импорт
// scripts/import-smart-transport-stops.mjs.
//
// Правила:
//   1. По расстоянию, один к одному: остановки с оборудованием (контроллер или
//      камеры) выбирают первыми, радиус 100 м; остальные — 60 м. Строке
//      переписываются название, направление и координаты, id не меняется.
//   2. Остановки, стоящие в точке-заглушке (центр карты по умолчанию), — по
//      названию и направлению среди ещё свободных остановок «Умного транспорта».
//   3. Строка с оборудованием без пары, но рядом с занятой остановкой (второй
//      павильон) — только название; точка остаётся своя.
//   4. Строка без оборудования без пары скрывается с карты: дубль или её нет в
//      «Умном транспорте». Сама строка не удаляется.
//   5. Остановки «Умного транспорта» без пары добавляются с id 100000 + их id.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (pg-meta Supabase).
// Usage: node scripts/merge-smart-transport-stops.mjs [--apply | --rollback] [--verbose]

const apply = process.argv.includes('--apply')
const rollback = process.argv.includes('--rollback')
const verbose = process.argv.includes('--verbose')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

const EQUIPPED_RADIUS_M = 100
const PLAIN_RADIUS_M = 60
const INSERTED_ID_OFFSET = 100000

async function sql(query) {
    const res = await fetch(`${url}/pg/query`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(120_000),
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`pg-meta: HTTP ${res.status} ${body.slice(0, 500)}`)
    return body ? JSON.parse(body) : []
}

const literal = value => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`

if (rollback) {
    // Возвращает прежние значения, убирает добавленные строки (если на них ещё
    // ничего не ссылается) и разметку слияния. Функция карты остаётся новой — без
    // строк в bus_stop_merge она показывает все остановки, как раньше.
    await sql(`
begin;
update public.bus_stops b set
  name = m.legacy->>'name', short_name = m.legacy->>'short_name', description = m.legacy->>'description',
  direction = (m.legacy->>'direction')::int, transport_type_flags = (m.legacy->>'transport_type_flags')::int,
  geom = ST_SetSRID(ST_GeomFromGeoJSON(m.legacy->>'geom'), 4326)
from public.bus_stop_merge m
where m.bus_stop_id = b.id and m.action in ('matched_geo', 'matched_name', 'renamed');
delete from public.bus_stops b using public.bus_stop_merge m
where m.bus_stop_id = b.id and m.action = 'inserted'
  and not exists (select 1 from public.cameras c where c.bus_stop_id = b.id)
  and not exists (select 1 from public.stop_sensor_states s where s.bus_stop_id = b.id)
  and not exists (select 1 from public.stop_controller_credentials s where s.bus_stop_id = b.id)
  and not exists (select 1 from public.controller_alerts a where a.bus_stop_id = b.id);
delete from public.bus_stop_merge;
commit;`)
    console.log('Слияние откатано')
    process.exit(0)
}

const [{ ready }] = await sql("select to_regclass('public.bus_stop_merge') is not null as ready")
if (!ready && apply) throw new Error('Нет таблицы bus_stop_merge — сначала sql/smart_transport_merge_schema.sql')
const merged = ready ? (await sql('select count(*)::int as count from public.bus_stop_merge'))[0].count : 0
if (merged) throw new Error(`Слияние уже применено (${merged} строк в bus_stop_merge). Сначала --rollback.`)

const ours = await sql(`
select b.id, b.name, b.description, b.has_controller, ST_X(b.geom) as lng, ST_Y(b.geom) as lat,
  (select count(*)::int from public.cameras c where c.bus_stop_id = b.id) as cams
from public.bus_stops b where b.geom is not null`)
const st = await sql('select id, name, description, lat, lng from public.smart_transport_stops where is_active')
if (!st.length) throw new Error('smart_transport_stops пуста — сначала импорт')

const distance = (a, b) => Math.hypot((a.lng - b.lng) * 111320 * Math.cos(61.25 * Math.PI / 180), (a.lat - b.lat) * 110540)
const equipped = stop => stop.has_controller || stop.cams > 0
const pointKey = stop => `${stop.lng.toFixed(4)},${stop.lat.toFixed(4)}`
const pointUse = new Map()
for (const stop of ours) pointUse.set(pointKey(stop), (pointUse.get(pointKey(stop)) || 0) + 1)
const placeholder = stop => pointUse.get(pointKey(stop)) >= 5

const STOP_WORDS = /(^|\s)(ост|остановка|ул|пр|пр-т|п|пос|м-н|мкрн|микрорайон|ж\/к|жк)\.?(?=\s|$)/g
const normalize = text => (text || '').toLowerCase().replace(/ё/g, 'е').replace(/\(.*?\)/g, ' ')
    .replace(/["«»“”]/g, ' ').replace(STOP_WORDS, ' ').replace(/[^0-9a-zа-я]+/g, ' ').trim().split(/\s+/).filter(Boolean)
const words = text => new Set(normalize(text))
const subset = (a, b) => a.size > 0 && [...a].every(w => b.has(w))

const ourByStop = new Map(), stByOur = new Map(), plan = []
const take = (ourId, stId, action) => { ourByStop.set(stId, ourId); stByOur.set(ourId, stId); plan.push({ bus_stop_id: ourId, st_id: stId, action }) }

// 1. По расстоянию
const pairs = []
for (const o of ours) {
    if (placeholder(o)) continue
    const radius = equipped(o) ? EQUIPPED_RADIUS_M : PLAIN_RADIUS_M
    for (const s of st) { const d = distance(o, s); if (d <= radius) pairs.push([equipped(o) ? 0 : 1, d, o.id, s.id]) }
}
pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
for (const [, , ourId, stId] of pairs) if (!stByOur.has(ourId) && !ourByStop.has(stId)) take(ourId, stId, 'matched_geo')

// 2. Заглушки — по названию и направлению
for (const o of ours.filter(placeholder).sort((a, b) => a.id - b.id)) {
    const name = normalize(o.name).join(' ')
    let candidates = st.filter(s => !ourByStop.has(s.id) && name && normalize(s.name).join(' ') === name)
    if (!candidates.length) {
        const context = new Set([...words(o.name), ...words(o.description)])
        candidates = st.filter(s => !ourByStop.has(s.id) && subset(words(s.name), context))
    }
    if (!candidates.length) continue
    const direction = words(o.description)
    const best = candidates.reduce((a, b) => [...words(b.description)].filter(w => direction.has(w)).length >
        [...words(a.description)].filter(w => direction.has(w)).length ? b : a)
    take(o.id, best.id, 'matched_name')
}

// 3–4. Остальные наши строки
for (const o of ours) {
    if (stByOur.has(o.id)) continue
    const near = placeholder(o) ? [] : st.filter(s => distance(o, s) <= (equipped(o) ? EQUIPPED_RADIUS_M : PLAIN_RADIUS_M))
    if (equipped(o)) {
        if (near.length) plan.push({ bus_stop_id: o.id, st_id: near.reduce((a, b) => distance(o, b) < distance(o, a) ? b : a).id, action: 'renamed' })
    } else {
        plan.push({ bus_stop_id: o.id, st_id: null, action: 'hidden', hidden: near.length ? 'duplicate' : 'not_in_smart_transport' })
    }
}

// 5. Новые
const inserted = st.filter(s => !ourByStop.has(s.id)).map(s => s.id)

const count = action => plan.filter(p => p.action === action).length
const kept = ours.length - plan.length
console.log(`bus_stops: ${ours.length}, Умный транспорт: ${st.length}`)
console.log(`по расстоянию: ${count('matched_geo')}, по названию: ${count('matched_name')}, только название (второй павильон): ${count('renamed')}`)
console.log(`скрыть: ${count('hidden')} (дубли ${plan.filter(p => p.hidden === 'duplicate').length}, нет в УТ ${plan.filter(p => p.hidden === 'not_in_smart_transport').length}), без изменений: ${kept}, добавить: ${inserted.length}`)
console.log(`точек на карте после: ${ours.length - count('hidden') + inserted.length}`)
if (verbose) {
    const O = new Map(ours.map(o => [o.id, o])), T = new Map(st.map(s => [s.id, s]))
    for (const p of plan) console.log([p.action, p.bus_stop_id, O.get(p.bus_stop_id).name?.trim(), '→', p.st_id ? T.get(p.st_id).name : p.hidden].join('\t'))
    for (const id of inserted) console.log(['inserted', INSERTED_ID_OFFSET + id, T.get(id).name, T.get(id).description || ''].join('\t'))
}
if (!apply) { console.log('Сухой прогон: в базу ничего не записано. Запись — с --apply.'); process.exit(0) }

await sql(`
begin;
insert into public.bus_stop_merge (bus_stop_id, smart_transport_id, action, map_hidden_reason, legacy)
select p.bus_stop_id, p.st_id, p.action, p.hidden, jsonb_build_object(
  'name', b.name, 'short_name', b.short_name, 'description', b.description, 'direction', b.direction,
  'transport_type_flags', b.transport_type_flags, 'geom', ST_AsGeoJSON(b.geom)::jsonb)
from jsonb_to_recordset(${literal(plan)}) as p(bus_stop_id int, st_id int, action text, hidden text)
join public.bus_stops b on b.id = p.bus_stop_id;

update public.bus_stops b set
  name = s.name, short_name = coalesce(nullif(trim(s.short_name), ''), s.name),
  description = coalesce(nullif(trim(s.description), ''), b.description),
  direction = coalesce(s.direction, b.direction), transport_type_flags = coalesce(s.transport_type_flags, b.transport_type_flags),
  geom = ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)
from public.bus_stop_merge m join public.smart_transport_stops s on s.id = m.smart_transport_id
where m.bus_stop_id = b.id and m.action in ('matched_geo', 'matched_name');

update public.bus_stops b set name = s.name, short_name = coalesce(nullif(trim(s.short_name), ''), s.name)
from public.bus_stop_merge m join public.smart_transport_stops s on s.id = m.smart_transport_id
where m.bus_stop_id = b.id and m.action = 'renamed';

insert into public.bus_stops (id, name, short_name, description, direction, transport_type_flags, note, geom)
select ${INSERTED_ID_OFFSET} + s.id, s.name, coalesce(nullif(trim(s.short_name), ''), s.name), nullif(trim(s.description), ''),
  s.direction, s.transport_type_flags, s.note, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)
from public.smart_transport_stops s where s.id = any(array[${inserted.join(',') || 'null'}]::int[]);

insert into public.bus_stop_merge (bus_stop_id, smart_transport_id, action)
select ${INSERTED_ID_OFFSET} + id, id, 'inserted' from public.smart_transport_stops where id = any(array[${inserted.join(',') || 'null'}]::int[]);
commit;`)
const [after] = await sql(`select count(*)::int as merge_rows,
  (select jsonb_array_length(public.get_bus_stops_geojson()->'features')) as map_points from public.bus_stop_merge`)
console.log(`Применено: строк разметки ${after.merge_rows}, точек на карте ${after.map_points}`)
