import type { SupabaseClient } from '@supabase/supabase-js'
import { getBinEpisode, type BinEpisode } from '@/lib/bin-episodes'
import type { Alert } from '@/lib/types'
import { CONDITION_LABELS, stopConditionAt, type ConditionLevel, type StopConditionsResponse } from '@/lib/stop-conditions'
import { buildStopConditions } from '@/lib/stop-conditions-data'
import {
    ToolInputError, boolArg, enumArg, enumListArg, intArg, localDay, localTime, minutesBetween, optionalText,
    parseMoment, periodArgs, type ToolArgs,
} from './args'
import { VECTOR_TOOL_TITLES } from './titles'
import { loadDirectory, readAll, resolveStop, searchStops, stopLabel, stopSummary, type Directory } from './directory'

export interface VectorToolContext {
    db: SupabaseClient
    now: number
}

export const SECURITY_TYPES = ['lying_person', 'smoking', 'abandoned_object', 'dogs_without_people'] as const
type SecurityType = typeof SECURITY_TYPES[number]
export const EVENT_LABELS: Record<string, string> = {
    lying_person: 'Лежачий человек', smoking: 'Курение', abandoned_object: 'Оставленный предмет',
    dogs_without_people: 'Собаки без людей', bin_full: 'Переполнена урна',
}
const DAY = 86_400_000
const HOUR = 3_600_000
const LIMIT_MAX = 200

export interface VectorTool {
    name: string
    title: string
    description: string
    inputSchema: Record<string, unknown>
    handler: (ctx: VectorToolContext, args: ToolArgs) => Promise<unknown>
}

const period = {
    from: { type: 'string', maxLength: 40, description: 'Начало: YYYY-MM-DD (полночь по Сургуту) или ISO 8601. По умолчанию — сутки назад' },
    to: { type: 'string', maxLength: 40, description: 'Конец: YYYY-MM-DD (день включается целиком) или ISO 8601. По умолчанию — сейчас' },
}
const stopParam = { type: 'string', maxLength: 120, description: 'id остановки (например "179") или её название / номер' }
const limit = (fallback: number) => ({ type: 'integer', minimum: 1, maximum: LIMIT_MAX, default: fallback })
const schema = (properties: Record<string, unknown>, required: string[] = []) =>
    ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) })

async function readSecurityEvents(db: SupabaseClient, from: number, to: number, types: readonly string[]) {
    return readAll<{ id: string; alert_type: string; camera_index: number | null; timestamp: string; location_id: string | null }>((a, b) => db.from('alerts')
        .select('id,alert_type,camera_index,timestamp,location_id:metadata->>location_id').in('alert_type', [...types])
        .gte('timestamp', new Date(from).toISOString()).lt('timestamp', new Date(to).toISOString()).order('timestamp', { ascending: false }).range(a, b))
}

function eventStop(directory: Directory, event: { camera_index: number | null; location_id?: string | null }) {
    return (event.camera_index !== null ? directory.stopByCamera.get(event.camera_index) : undefined)
        ?? (event.location_id ? directory.stopByLocation.get(event.location_id) : undefined)
}

async function readBinEpisodes(db: SupabaseClient, directory: Directory, from: number, to: number) {
    // Эпизод записан на время начала; переполнение дольше месяца не ищем.
    const rows = await readAll<Pick<Alert, 'alert_type' | 'metadata'> & { id: string; camera_index: number | null }>((a, b) => db.from('alerts')
        .select('id,alert_type,camera_index,metadata').eq('alert_type', 'bin_full')
        .gte('timestamp', new Date(from - 30 * DAY).toISOString()).lt('timestamp', new Date(to).toISOString()).order('timestamp').range(a, b))
    const episodes: { id: string; stop_id: number | null; episode: BinEpisode; start: number; end: number | null }[] = []
    for (const row of rows) {
        const episode = getBinEpisode(row)
        if (!episode) continue
        const start = Date.parse(episode.started_at), end = episode.ended_at ? Date.parse(episode.ended_at) : null
        if (start >= to || (end !== null && end <= from)) continue
        const stopId = eventStop(directory, { camera_index: row.camera_index, location_id: row.metadata?.location_id as string | undefined }) ?? null
        episodes.push({ id: row.id, stop_id: stopId, episode, start, end })
    }
    return episodes
}

async function conditionsAt(ctx: VectorToolContext, at: number) {
    // Три часа истории хватает: климат берётся не старше двух часов, события — за час.
    const data = await buildStopConditions(ctx.db, Math.floor((at - 3 * HOUR) / HOUR) * HOUR, Math.ceil(at / HOUR) * HOUR, Math.min(at, ctx.now))
    return data
}

function evaluate(directory: Directory, data: StopConditionsResponse, at: number) {
    return directory.stops.map(stop => {
        const hasCameras = directory.cameras.some(c => c.bus_stop_id === stop.id)
        return { stop, condition: stopConditionAt(data.stops[stop.id], data.thresholds, at, { hasCameras }) }
    })
}

function countBy<T>(items: T[], key: (item: T) => string) {
    const counts: Record<string, number> = {}
    for (const item of items) { const k = key(item); counts[k] = (counts[k] ?? 0) + 1 }
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]))
}

export const VECTOR_TOOLS: VectorTool[] = [
    {
        name: 'system_overview',
        title: VECTOR_TOOL_TITLES.system_overview,
        description: 'Главный экран ситуации по остановочным павильонам Сургута: сколько остановок, камер и датчиков, сколько из них сейчас в сети, '
            + 'события безопасности за сутки, открытые переполнения урн, состояние остановок (норма / нарушения) и нормы температуры и влажности. '
            + 'Начинай с него вопросы «как дела», «что происходит», «сводка».',
        inputSchema: schema({}),
        async handler(ctx) {
            const directory = await loadDirectory(ctx.db)
            const [events, bins, conditions] = await Promise.all([
                readSecurityEvents(ctx.db, ctx.now - DAY, ctx.now, SECURITY_TYPES),
                readBinEpisodes(ctx.db, directory, ctx.now - DAY, ctx.now),
                conditionsAt(ctx, ctx.now),
            ])
            const states = (kind: string) => countBy(directory.states.filter(s => s.equipment_type === kind), s => s.status)
            const levels = countBy(evaluate(directory, conditions, ctx.now), r => r.condition.level)
            return {
                as_of: localTime(ctx.now),
                stops: {
                    total: directory.stops.length,
                    with_cameras: new Set(directory.cameras.map(c => c.bus_stop_id).filter(id => id !== null)).size,
                    with_sensors: directory.stops.filter(s => s.has_controller || s.ip_address).length,
                },
                cameras: { total: directory.states.filter(s => s.equipment_type === 'camera').length, by_status: states('camera') },
                sensor_controllers: { total: directory.states.filter(s => s.equipment_type === 'controller').length, by_status: states('controller') },
                security_events_24h: Object.fromEntries(Object.entries(countBy(events, e => e.alert_type)).map(([k, v]) => [EVENT_LABELS[k] ?? k, v])),
                bins_full_now: bins.filter(b => b.end === null).length,
                stop_conditions_now: Object.fromEntries((['ok', 'warn', 'bad', 'unknown'] as ConditionLevel[]).map(l => [CONDITION_LABELS[l], levels[l] ?? 0])),
                norms: conditions.thresholds,
            }
        },
    },
    {
        name: 'find_stops',
        title: VECTOR_TOOL_TITLES.find_stops,
        description: 'Ищет остановки по словам из названия, направления, адреса, номера или микрорайона. Без query — все остановки с фильтрами. '
            + 'Возвращает id (нужен другим инструментам), оснащение и статус связи.',
        inputSchema: schema({
            query: { type: 'string', maxLength: 120, description: 'Например «Никольский», «Мира 31», «14 микрорайон»' },
            equipment: { type: 'string', enum: ['any', 'cameras', 'sensors', 'none'], default: 'any' },
            offline_only: { type: 'boolean', default: false, description: 'Только остановки, где что-то не в сети' },
            limit: limit(30),
            offset: { type: 'integer', minimum: 0, default: 0 },
        }),
        async handler(ctx, args) {
            const directory = await loadDirectory(ctx.db)
            const query = optionalText(args, 'query', 120)
            const equipment = enumArg(args, 'equipment', ['any', 'cameras', 'sensors', 'none'] as const, 'any')
            const offlineOnly = boolArg(args, 'offline_only')
            const take = intArg(args, 'limit', 30, 1, LIMIT_MAX), offset = intArg(args, 'offset', 0, 0, 100_000)
            const rows = (query ? searchStops(directory, query) : directory.stops)
                .map(stop => stopSummary(directory, stop))
                .filter(s => equipment === 'any' || (equipment === 'cameras' ? s.cameras > 0 : equipment === 'sensors' ? s.sensors : !s.cameras && !s.sensors))
                .filter(s => !offlineOnly || s.cameras_online < s.cameras || s.sensors_status === 'offline')
                .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))
            return { total: rows.length, offset, stops: rows.slice(offset, offset + take), next_offset: offset + take < rows.length ? offset + take : null }
        },
    },
    {
        name: 'get_stop',
        title: VECTOR_TOOL_TITLES.get_stop,
        description: 'Всё об одной остановке: оснащение и статус каждой камеры и контроллера, текущие показания датчиков, состояние по нормам, '
            + 'события безопасности и урна за сутки, отключения за неделю, люди на остановке сейчас.',
        inputSchema: schema({ stop: stopParam }, ['stop']),
        async handler(ctx, args) {
            const directory = await loadDirectory(ctx.db)
            const stop = resolveStop(directory, args.stop)
            const cameraIndexes = directory.cameras.filter(c => c.bus_stop_id === stop.id).map(c => c.camera_index)
            const locations = [...directory.stopByLocation.entries()].filter(([, id]) => id === stop.id).map(([loc]) => loc)
            const [sensors, events, bins, outages, conditions, busyness] = await Promise.all([
                readAll<{ element: number; category: string | null; name: string | null; value: number | null; alarm: string | null; updated_at: string }>((a, b) => ctx.db
                    .from('stop_sensor_states').select('element,category,name,value,alarm,updated_at').eq('bus_stop_id', stop.id).order('element').range(a, b)),
                cameraIndexes.length ? readAll<{ alert_type: string; timestamp: string; camera_index: number | null }>((a, b) => ctx.db.from('alerts')
                    .select('alert_type,timestamp,camera_index').in('alert_type', [...SECURITY_TYPES]).in('camera_index', cameraIndexes)
                    .gte('timestamp', new Date(ctx.now - DAY).toISOString()).order('timestamp', { ascending: false }).range(a, b)) : Promise.resolve([]),
                readBinEpisodes(ctx.db, directory, ctx.now - DAY, ctx.now),
                readAll<{ equipment_type: string; equipment_id: number; started_at: string; ended_at: string | null }>((a, b) => ctx.db.from('equipment_outages')
                    .select('equipment_type,equipment_id,started_at,ended_at').eq('bus_stop_id', stop.id)
                    .or(`ended_at.is.null,ended_at.gte.${new Date(ctx.now - 7 * DAY).toISOString()}`).order('started_at').range(a, b)),
                conditionsAt(ctx, ctx.now),
                locations.length ? ctx.db.from('busyness_windows').select('location_id,window_start,person_count_avg,person_count_max')
                    .in('location_id', locations).order('window_start', { ascending: false }).limit(locations.length * 3) : Promise.resolve({ data: [] }),
            ])
            const condition = stopConditionAt(conditions.stops[stop.id], conditions.thresholds, ctx.now, { hasCameras: cameraIndexes.length > 0 })
            const states = directory.states.filter(s => s.bus_stop_id === stop.id || (s.equipment_type === 'controller' && s.equipment_id === stop.id))
            const latestByLocation = new Map<string, { window_start: string; person_count_avg: number }>()
            for (const row of (busyness.data ?? []) as { location_id: string; window_start: string; person_count_avg: number }[]) {
                if (!latestByLocation.has(row.location_id)) latestByLocation.set(row.location_id, row)
            }
            return {
                as_of: localTime(ctx.now),
                stop: stopSummary(directory, stop),
                equipment: states.map(s => ({
                    kind: s.equipment_type === 'camera' ? 'камера' : 'контроллер датчиков', id: s.equipment_id, status: s.status,
                    since: localTime(s.status_since), minutes_in_status: s.status_since ? minutesBetween(Date.parse(s.status_since), ctx.now) : null,
                })),
                sensors: sensors.map(r => ({ element: r.element, category: r.category, name: r.name, value: r.value, alarm: r.alarm, updated: localTime(r.updated_at) })),
                condition: { level: CONDITION_LABELS[condition.level], issues: condition.issues, temperature: condition.temperature, humidity: condition.humidity, norms: conditions.thresholds },
                security_events_24h: { total: events.length, by_type: countBy(events, e => EVENT_LABELS[e.alert_type] ?? e.alert_type), latest: events.slice(0, 5).map(e => ({ type: EVENT_LABELS[e.alert_type] ?? e.alert_type, time: localTime(e.timestamp), camera: e.camera_index })) },
                bin_episodes_24h: bins.filter(b => b.stop_id === stop.id).map(b => ({ started: localTime(b.start), ended: localTime(b.end), open: b.end === null })),
                outages_7d: { count: outages.length, minutes: outages.reduce((sum, o) => sum + minutesBetween(Math.max(Date.parse(o.started_at), ctx.now - 7 * DAY), o.ended_at ? Date.parse(o.ended_at) : ctx.now), 0) },
                people_now: [...latestByLocation.values()].reduce((sum, row) => sum + (row.person_count_avg ?? 0), 0),
                people_updated: localTime([...latestByLocation.values()].map(r => r.window_start).sort().at(-1) ?? null),
            }
        },
    },
    {
        name: 'equipment_status',
        title: VECTOR_TOOL_TITLES.equipment_status,
        description: 'Текущий статус связи камер и контроллеров датчиков по таблице мониторинга: что не в сети, с какого времени и сколько минут.',
        inputSchema: schema({
            kind: { type: 'string', enum: ['camera', 'controller', 'all'], default: 'all' },
            status: { type: 'string', enum: ['offline', 'online', 'unknown', 'all'], default: 'offline' },
            stop: stopParam,
            limit: limit(50),
        }),
        async handler(ctx, args) {
            const directory = await loadDirectory(ctx.db)
            const kind = enumArg(args, 'kind', ['camera', 'controller', 'all'] as const, 'all')
            const status = enumArg(args, 'status', ['offline', 'online', 'unknown', 'all'] as const, 'offline')
            const stop = args.stop != null ? resolveStop(directory, args.stop) : null
            const scoped = directory.states.filter(s => (kind === 'all' || s.equipment_type === kind) && (!stop || s.bus_stop_id === stop.id))
            const rows = scoped.filter(s => status === 'all' || s.status === status)
                .sort((a, b) => (a.status_since ?? '').localeCompare(b.status_since ?? ''))
            const take = intArg(args, 'limit', 50, 1, LIMIT_MAX)
            return {
                as_of: localTime(ctx.now),
                counts: { cameras: countBy(scoped.filter(s => s.equipment_type === 'camera'), s => s.status), controllers: countBy(scoped.filter(s => s.equipment_type === 'controller'), s => s.status) },
                total: rows.length,
                items: rows.slice(0, take).map(s => ({
                    kind: s.equipment_type === 'camera' ? 'камера' : 'контроллер датчиков', id: s.equipment_id, status: s.status,
                    stop_id: s.bus_stop_id, stop: stopLabel(s.bus_stop_id !== null ? directory.stopById.get(s.bus_stop_id) : undefined, s.bus_stop_id),
                    since: localTime(s.status_since), minutes: s.status_since ? minutesBetween(Date.parse(s.status_since), ctx.now) : null,
                })),
            }
        },
    },
    {
        name: 'equipment_outages',
        title: VECTOR_TOOL_TITLES.equipment_outages,
        description: 'История отключений камер и контроллеров за период: сколько раз и сколько минут каждое устройство было не в сети. '
            + 'Короткие обрывы связи (меньше min_minutes) не считаются.',
        inputSchema: schema({ ...period, kind: { type: 'string', enum: ['camera', 'controller', 'all'], default: 'all' }, stop: stopParam,
            min_minutes: { type: 'integer', minimum: 0, maximum: 1440, default: 10 }, limit: limit(30) }),
        async handler(ctx, args) {
            const directory = await loadDirectory(ctx.db)
            const { from, to } = periodArgs(args, ctx.now, 7)
            const kind = enumArg(args, 'kind', ['camera', 'controller', 'all'] as const, 'all')
            const stop = args.stop != null ? resolveStop(directory, args.stop) : null
            const minMinutes = intArg(args, 'min_minutes', 10, 0, 1440)
            const rows = await readAll<{ equipment_type: string; equipment_id: number; bus_stop_id: number | null; started_at: string; ended_at: string | null }>((a, b) => {
                let q = ctx.db.from('equipment_outages').select('equipment_type,equipment_id,bus_stop_id,started_at,ended_at')
                    .lt('started_at', new Date(to).toISOString()).or(`ended_at.is.null,ended_at.gt.${new Date(from).toISOString()}`)
                if (kind !== 'all') q = q.eq('equipment_type', kind)
                if (stop) q = q.eq('bus_stop_id', stop.id)
                return q.order('started_at').range(a, b)
            }, 100_000)
            const devices = new Map<string, { kind: string; id: number; stop_id: number | null; outages: number; minutes: number; open: boolean }>()
            for (const row of rows) {
                const full = minutesBetween(Date.parse(row.started_at), row.ended_at ? Date.parse(row.ended_at) : ctx.now)
                if (full < minMinutes) continue
                const key = `${row.equipment_type}:${row.equipment_id}`
                const device = devices.get(key) ?? { kind: row.equipment_type, id: row.equipment_id, stop_id: row.bus_stop_id, outages: 0, minutes: 0, open: false }
                device.outages++
                device.minutes += minutesBetween(Math.max(Date.parse(row.started_at), from), Math.min(row.ended_at ? Date.parse(row.ended_at) : ctx.now, to))
                device.open ||= row.ended_at === null
                devices.set(key, device)
            }
            const list = [...devices.values()].sort((a, b) => b.minutes - a.minutes)
            const take = intArg(args, 'limit', 30, 1, LIMIT_MAX)
            return {
                period: { from: localTime(from), to: localTime(to) },
                devices_with_outages: list.length,
                outages: list.reduce((s, d) => s + d.outages, 0),
                downtime_minutes: list.reduce((s, d) => s + d.minutes, 0),
                worst: list.slice(0, take).map(d => ({
                    kind: d.kind === 'camera' ? 'камера' : 'контроллер датчиков', id: d.id, stop_id: d.stop_id,
                    stop: stopLabel(d.stop_id !== null ? directory.stopById.get(d.stop_id) : undefined, d.stop_id),
                    outages: d.outages, downtime_minutes: d.minutes, offline_now: d.open,
                })),
            }
        },
    },
    {
        name: 'security_events',
        title: VECTOR_TOOL_TITLES.security_events,
        description: 'События видеоаналитики на остановках за период: лежачий человек, курение, оставленный предмет, собаки без людей. '
            + 'Считает по типам и группирует по остановкам, дням или часам суток, показывает последние случаи.',
        inputSchema: schema({ ...period,
            types: { type: 'array', items: { type: 'string', enum: [...SECURITY_TYPES] }, description: 'По умолчанию все типы' },
            stop: stopParam,
            group_by: { type: 'string', enum: ['stop', 'day', 'hour_of_day', 'type'], default: 'stop' },
            limit: limit(20) }),
        async handler(ctx, args) {
            const directory = await loadDirectory(ctx.db)
            const { from, to } = periodArgs(args, ctx.now, 1)
            const types = enumListArg<SecurityType>(args, 'types', SECURITY_TYPES)
            const stop = args.stop != null ? resolveStop(directory, args.stop) : null
            const groupBy = enumArg(args, 'group_by', ['stop', 'day', 'hour_of_day', 'type'] as const, 'stop')
            const take = intArg(args, 'limit', 20, 1, LIMIT_MAX)
            const events = (await readSecurityEvents(ctx.db, from, to, types))
                .map(e => ({ ...e, stop_id: eventStop(directory, e) ?? null }))
                .filter(e => !stop || e.stop_id === stop.id)
            const groupKey = (e: typeof events[number]) => groupBy === 'stop' ? stopLabel(e.stop_id !== null ? directory.stopById.get(e.stop_id) : undefined, e.stop_id)
                : groupBy === 'day' ? localDay(Date.parse(e.timestamp))
                : groupBy === 'hour_of_day' ? `${new Date(Date.parse(e.timestamp) + 5 * HOUR).getUTCHours().toString().padStart(2, '0')}:00`
                : EVENT_LABELS[e.alert_type] ?? e.alert_type
            const groups = Object.entries(countBy(events, groupKey))
            return {
                period: { from: localTime(from), to: localTime(to) },
                total: events.length,
                by_type: Object.fromEntries(Object.entries(countBy(events, e => e.alert_type)).map(([k, v]) => [EVENT_LABELS[k] ?? k, v])),
                group_by: groupBy,
                groups: (groupBy === 'stop' ? groups : groups.sort((a, b) => a[0].localeCompare(b[0]))).slice(0, take).map(([key, count]) => ({ key, count })),
                latest: events.slice(0, 10).map(e => ({ id: e.id, type: EVENT_LABELS[e.alert_type] ?? e.alert_type, time: localTime(e.timestamp),
                    stop: stopLabel(e.stop_id !== null ? directory.stopById.get(e.stop_id) : undefined, e.stop_id), camera: e.camera_index })),
            }
        },
    },
    {
        name: 'stop_conditions',
        title: VECTOR_TOOL_TITLES.stop_conditions,
        description: 'Состояние каждой остановки на момент времени, как слой «Состояние остановок» на карте: норма, одно нарушение, два и больше. '
            + 'Нарушения: температура или влажность вне норм из настроек, переполненная урна, событие безопасности или разбитие стекла за последний час.',
        inputSchema: schema({ at: { type: 'string', maxLength: 40, description: 'Момент YYYY-MM-DD или ISO 8601, по умолчанию сейчас' },
            level: { type: 'string', enum: ['bad', 'warn', 'problems', 'ok', 'unknown', 'all'], default: 'problems', description: 'problems = оранжевые и красные' },
            limit: limit(30) }),
        async handler(ctx, args) {
            const atText = optionalText(args, 'at', 40)
            const at = atText ? Math.min(parseMoment(atText, 'at'), ctx.now) : ctx.now
            if (ctx.now - at > 92 * DAY) throw new ToolInputError('История состояний доступна за последние 92 дня')
            const level = enumArg(args, 'level', ['bad', 'warn', 'problems', 'ok', 'unknown', 'all'] as const, 'problems')
            const directory = await loadDirectory(ctx.db)
            const data = await conditionsAt(ctx, at)
            const rows = evaluate(directory, data, at)
            const wanted = rows.filter(r => level === 'all' || r.condition.level === level || (level === 'problems' && (r.condition.level === 'bad' || r.condition.level === 'warn')))
                .sort((a, b) => b.condition.issues.length - a.condition.issues.length)
            const take = intArg(args, 'limit', 30, 1, LIMIT_MAX)
            return {
                at: localTime(at),
                norms: data.thresholds,
                counts: Object.fromEntries((['ok', 'warn', 'bad', 'unknown'] as ConditionLevel[]).map(l => [CONDITION_LABELS[l], rows.filter(r => r.condition.level === l).length])),
                total: wanted.length,
                stops: wanted.slice(0, take).map(r => ({ stop_id: r.stop.id, stop: stopLabel(r.stop), level: CONDITION_LABELS[r.condition.level],
                    issues: r.condition.issues, temperature: r.condition.temperature, humidity: r.condition.humidity })),
            }
        },
    },
    {
        name: 'stop_climate',
        title: VECTOR_TOOL_TITLES.stop_climate,
        description: 'Температура и влажность в павильонах. Без stop — последние показания всех остановок с сортировкой (самые холодные, тёплые, влажные) '
            + 'и отметкой выхода за нормы. Со stop и периодом — почасовая история этой остановки.',
        inputSchema: schema({ stop: stopParam, sort: { type: 'string', enum: ['coldest', 'warmest', 'most_humid', 'name'], default: 'coldest' },
            ...period, limit: limit(20) }),
        async handler(ctx, args) {
            const directory = await loadDirectory(ctx.db)
            const stop = args.stop != null ? resolveStop(directory, args.stop) : null
            if (stop && (args.from || args.to)) {
                const { from, to } = periodArgs(args, ctx.now, 1)
                if (to - from > 31 * DAY) throw new ToolInputError('Почасовая история — не больше 31 дня')
                const data = await buildStopConditions(ctx.db, Math.floor(from / HOUR) * HOUR, Math.ceil(to / HOUR) * HOUR, to)
                return { stop: stopLabel(stop), norms: data.thresholds,
                    hourly: (data.stops[stop.id]?.climate ?? []).map(([t, temp, hum]) => ({ time: localTime(t), temperature: temp, humidity: hum })) }
            }
            const data = await conditionsAt(ctx, ctx.now)
            const rows = await readAll<{ bus_stop_id: number; category: string; value: number | null; updated_at: string }>((a, b) => {
                let q = ctx.db.from('stop_sensor_states').select('bus_stop_id,category,value,updated_at').in('category', ['temperature', 'humidity'])
                if (stop) q = q.eq('bus_stop_id', stop.id)
                return q.order('bus_stop_id').range(a, b)
            })
            const byStop = new Map<number, { temperature: number | null; humidity: number | null; updated: string }>()
            for (const row of rows) {
                const entry = byStop.get(row.bus_stop_id) ?? { temperature: null, humidity: null, updated: row.updated_at }
                if (row.category === 'temperature') entry.temperature = row.value
                if (row.category === 'humidity') entry.humidity = row.value
                if (row.updated_at > entry.updated) entry.updated = row.updated_at
                byStop.set(row.bus_stop_id, entry)
            }
            const n = data.thresholds
            const sort = enumArg(args, 'sort', ['coldest', 'warmest', 'most_humid', 'name'] as const, 'coldest')
            const list = [...byStop.entries()].map(([id, v]) => ({ stop_id: id, stop: stopLabel(directory.stopById.get(id), id), ...v, updated: localTime(v.updated),
                temperature_out_of_norm: v.temperature !== null && n.tempEnabled && (v.temperature < n.tempMin || v.temperature > n.tempMax),
                humidity_out_of_norm: v.humidity !== null && n.humidityEnabled && (v.humidity < n.humidityMin || v.humidity > n.humidityMax) }))
            const value = (x: number | null, empty: number) => x ?? empty
            list.sort((a, b) => sort === 'coldest' ? value(a.temperature, 999) - value(b.temperature, 999)
                : sort === 'warmest' ? value(b.temperature, -999) - value(a.temperature, -999)
                : sort === 'most_humid' ? value(b.humidity, -1) - value(a.humidity, -1)
                : a.stop.localeCompare(b.stop, 'ru'))
            return { as_of: localTime(ctx.now), norms: n, stops_with_readings: list.length,
                out_of_norm: { temperature: list.filter(r => r.temperature_out_of_norm).length, humidity: list.filter(r => r.humidity_out_of_norm).length },
                stops: list.slice(0, intArg(args, 'limit', 20, 1, LIMIT_MAX)) }
        },
    },
    {
        name: 'passenger_load',
        title: VECTOR_TOOL_TITLES.passenger_load,
        description: 'Сколько людей видят камеры на остановках за период: среднее одновременное количество и пик. Это люди в кадре, а не уникальные пассажиры. '
            + 'Группировка по остановкам или по часам суток.',
        inputSchema: schema({ ...period, stop: stopParam, group_by: { type: 'string', enum: ['stop', 'hour_of_day'], default: 'stop' }, limit: limit(20) }),
        async handler(ctx, args) {
            const directory = await loadDirectory(ctx.db)
            const { from, to } = periodArgs(args, ctx.now, 1)
            const stop = args.stop != null ? resolveStop(directory, args.stop) : null
            const groupBy = enumArg(args, 'group_by', ['stop', 'hour_of_day'] as const, 'stop')
            const { data, error } = await ctx.db.rpc('get_stop_load_hourly', { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() })
            if (error) throw new Error('Не удалось прочитать пассажиропоток')
            const hours = ((data as { hours?: [string, string, number, number, number, number][] } | null)?.hours ?? [])
                .map(([location, hour, weighted, weight, peak]) => ({ stop_id: directory.stopByLocation.get(location) ?? null, location, hour: Date.parse(hour), weighted, weight, peak }))
                .filter(h => !stop || h.stop_id === stop.id)
            const groups = new Map<string, { weighted: number; weight: number; peak: number }>()
            for (const h of hours) {
                const key = groupBy === 'stop' ? stopLabel(h.stop_id !== null ? directory.stopById.get(h.stop_id) : undefined, h.stop_id) + (h.stop_id === null ? ` (${h.location})` : '')
                    : `${new Date(h.hour + 5 * HOUR).getUTCHours().toString().padStart(2, '0')}:00`
                const g = groups.get(key) ?? { weighted: 0, weight: 0, peak: 0 }
                g.weighted += h.weighted; g.weight += h.weight; g.peak = Math.max(g.peak, h.peak)
                groups.set(key, g)
            }
            const rows = [...groups.entries()].map(([key, g]) => ({ key, average_people: g.weight ? Math.round(10 * g.weighted / g.weight) / 10 : 0, peak_people: g.peak }))
            rows.sort((a, b) => groupBy === 'stop' ? b.average_people - a.average_people : a.key.localeCompare(b.key))
            return { period: { from: localTime(from), to: localTime(to) }, note: 'Люди в кадре одной камеры направления, не уникальные пассажиры', group_by: groupBy,
                rows: rows.slice(0, intArg(args, 'limit', 20, 1, LIMIT_MAX)) }
        },
    },
    {
        name: 'bin_episodes',
        title: VECTOR_TOOL_TITLES.bin_episodes,
        description: 'Эпизоды переполнения урн за период: где, когда началось, когда убрали и сколько длилось. Открытые эпизоды — урна переполнена сейчас.',
        inputSchema: schema({ ...period, status: { type: 'string', enum: ['open', 'closed', 'all'], default: 'all' }, stop: stopParam, limit: limit(30) }),
        async handler(ctx, args) {
            const directory = await loadDirectory(ctx.db)
            const { from, to } = periodArgs(args, ctx.now, 7)
            const status = enumArg(args, 'status', ['open', 'closed', 'all'] as const, 'all')
            const stop = args.stop != null ? resolveStop(directory, args.stop) : null
            const episodes = (await readBinEpisodes(ctx.db, directory, from, to))
                .filter(e => (!stop || e.stop_id === stop.id) && (status === 'all' || (status === 'open') === (e.end === null)))
                .sort((a, b) => b.start - a.start)
            return {
                period: { from: localTime(from), to: localTime(to) }, total: episodes.length, open_now: episodes.filter(e => e.end === null).length,
                episodes: episodes.slice(0, intArg(args, 'limit', 30, 1, LIMIT_MAX)).map(e => ({ stop_id: e.stop_id,
                    stop: stopLabel(e.stop_id !== null ? directory.stopById.get(e.stop_id) : undefined, e.stop_id),
                    started: localTime(e.start), cleaned: localTime(e.end), minutes: minutesBetween(e.start, e.end ?? ctx.now), confirmations: e.episode.observation_count })),
            }
        },
    },
    {
        name: 'districts_summary',
        title: VECTOR_TOOL_TITLES.districts_summary,
        description: 'Сводка по микрорайонам: сколько остановок, сколько с камерами и датчиками, сколько из них сейчас на связи.',
        inputSchema: schema({ limit: limit(60) }),
        async handler(ctx, args) {
            const directory = await loadDirectory(ctx.db)
            const rows = new Map<string, { stops: number; with_cameras: number; cameras_online_stops: number; with_sensors: number; sensors_online: number }>()
            for (const stop of directory.stops) {
                const summary = stopSummary(directory, stop)
                const key = summary.district ?? 'Без микрорайона'
                const row = rows.get(key) ?? { stops: 0, with_cameras: 0, cameras_online_stops: 0, with_sensors: 0, sensors_online: 0 }
                row.stops++
                if (summary.cameras) row.with_cameras++
                if (summary.cameras_online) row.cameras_online_stops++
                if (summary.sensors) row.with_sensors++
                if (summary.sensors_status === 'online') row.sensors_online++
                rows.set(key, row)
            }
            const list = [...rows.entries()].map(([district, r]) => ({ district, ...r, video_coverage_pct: r.stops ? Math.round(100 * r.cameras_online_stops / r.stops) : 0 }))
                .sort((a, b) => b.video_coverage_pct - a.video_coverage_pct || a.district.localeCompare(b.district, 'ru', { numeric: true }))
            return { as_of: localTime(ctx.now), districts: list.slice(0, intArg(args, 'limit', 60, 1, LIMIT_MAX)) }
        },
    },
]

export const VECTOR_TOOL_NAMES = new Set(VECTOR_TOOLS.map(tool => tool.name))
