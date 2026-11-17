import type { Cell, Sheet } from './xlsx'
import { MIN_OUTAGE_MS, type OutageRow } from './equipment-outages-read'

/** Время Сургута (UTC+5) для подписей в отчёте. */
const OFFSET = 5 * 3_600_000

export function localDateTime(time: number) {
    const iso = new Date(time + OFFSET).toISOString()
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)}`
}

export function humanDuration(ms: number) {
    const minutes = Math.max(0, Math.round(ms / 60_000))
    const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), rest = minutes % 60
    if (days > 0) return `${days} дн ${hours} ч`
    if (hours > 0) return `${hours} ч ${rest} мин`
    return `${rest} мин`
}

const hoursValue = (ms: number) => Math.round(ms / 360_000) / 10

export interface ReportDeviceState {
    equipment_type: 'camera' | 'controller'
    equipment_id: number
    bus_stop_id: number | null
    stop_name: string | null
    status: 'online' | 'offline' | 'unknown'
    /** Начало текущего отключения или момент последнего восстановления. */
    status_since: string | null
}

export interface ReportStop {
    id: number
    name: string
    number: string
    district: string
}

const STATUS_LABEL = { online: 'В сети', offline: 'Не в сети', unknown: 'Нет данных' } as const

function deviceLabel(type: 'camera' | 'controller', id: number) {
    return type === 'camera' ? `Камера № ${id >= 10000 ? id - 10000 : id}` : 'Контроллер датчиков'
}

/**
 * Отчёт «Оборудование на момент выгрузки»: что работает и что нет на время формирования,
 * плюс отключения от 10 минут за выбранный период. Каждый лист — таблица Excel с фильтрами.
 */
export function equipmentStatusSheets({ at, from, to, states, stops, outages }: {
    at: number
    from: number
    to: number
    states: ReportDeviceState[]
    stops: Map<number, ReportStop>
    outages: OutageRow[]
}): Sheet[] {
    const stopOf = (id: number | null, fallback?: string | null) => (id !== null ? stops.get(id) : undefined)
        ?? { id: id ?? 0, name: fallback?.trim() || 'Вне остановки', number: id !== null ? String(id) : '—', district: '—' }

    const devices = states.map((state) => {
        const stop = stopOf(state.bus_stop_id, state.stop_name)
        const since = state.status_since ? Date.parse(state.status_since) : null
        const downMs = state.status === 'offline' && since !== null ? Math.max(0, at - since) : null
        return { state, stop, since, downMs }
    })
    const deviceRow = (d: (typeof devices)[number]): Cell[] => [
        STATUS_LABEL[d.state.status],
        d.downMs !== null && d.since !== null ? localDateTime(d.since) : null,
        d.downMs !== null ? humanDuration(d.downMs) : null,
        d.downMs !== null ? hoursValue(d.downMs) : null,
        d.stop.name,
        d.stop.number,
        d.stop.district,
        deviceLabel(d.state.equipment_type, d.state.equipment_id),
    ]
    const deviceHeader: Cell[] = ['Статус на момент выгрузки', 'Не в сети с', 'Сколько не в сети', 'Часов не в сети', 'Остановка', '№ остановки', 'Микрорайон', 'Устройство']
    const deviceWidths = [16, 18, 18, 12, 34, 12, 26, 22]
    const rank = { offline: 0, unknown: 1, online: 2 } as const
    const sorted = devices.slice().sort((a, b) => rank[a.state.status] - rank[b.state.status]
        || (b.downMs ?? 0) - (a.downMs ?? 0)
        || a.stop.name.localeCompare(b.stop.name, 'ru') || a.state.equipment_id - b.state.equipment_id)
    const offline = sorted.filter((d) => d.state.status === 'offline')

    // По остановкам: всё на связи, часть или ничего.
    const byStop = new Map<number, typeof devices>()
    for (const d of devices) if (d.state.bus_stop_id !== null) byStop.set(d.state.bus_stop_id, [...(byStop.get(d.state.bus_stop_id) ?? []), d])
    const stopRows = [...byStop.entries()].map(([, list]) => {
        const cameras = list.filter((d) => d.state.equipment_type === 'camera')
        const controller = list.find((d) => d.state.equipment_type === 'controller')
        const known = list.filter((d) => d.state.status !== 'unknown')
        const online = known.filter((d) => d.state.status === 'online').length
        const verdict = known.length === 0 ? 'Нет данных' : online === known.length ? 'Всё работает' : online === 0 ? 'Не работает' : 'Частично'
        return { stop: list[0].stop, cameras, controller, verdict }
    })
    const verdictRank: Record<string, number> = { 'Не работает': 0, 'Частично': 1, 'Нет данных': 2, 'Всё работает': 3 }
    stopRows.sort((a, b) => verdictRank[a.verdict] - verdictRank[b.verdict] || a.stop.name.localeCompare(b.stop.name, 'ru'))

    const count = (type: 'camera' | 'controller', status: 'online' | 'offline') => devices.filter((d) => d.state.equipment_type === type && d.state.status === status).length
    const total = (type: 'camera' | 'controller') => devices.filter((d) => d.state.equipment_type === type).length
    const verdictCount = (verdict: string) => stopRows.filter((row) => row.verdict === verdict).length

    const summary: Sheet = {
        name: 'Сводка',
        columnWidths: [46, 30],
        rows: [
            ['Показатель', 'Значение'],
            ['Отчёт сформирован (время Сургута)', localDateTime(at)],
            ['Статусы устройств даны на этот момент', localDateTime(at)],
            ['Камеры в сети', `${count('camera', 'online')} из ${total('camera')}`],
            ['Камеры не в сети', count('camera', 'offline')],
            ['Контроллеры датчиков в сети', `${count('controller', 'online')} из ${total('controller')}`],
            ['Контроллеры датчиков не в сети', count('controller', 'offline')],
            ['Остановки: всё работает', verdictCount('Всё работает')],
            ['Остановки: работает частично', verdictCount('Частично')],
            ['Остановки: не работает ничего', verdictCount('Не работает')],
            ['Период для листа «Отключения»', `${localDateTime(from)} — ${localDateTime(to)}`],
            ['Отключения короче', `${MIN_OUTAGE_MS / 60_000} минут в отчёт не входят`],
        ],
    }

    const outageRows = outages
        .map((outage) => {
            const start = Date.parse(outage.started_at)
            const end = outage.ended_at ? Date.parse(outage.ended_at) : null
            const stop = stopOf(outage.bus_stop_id)
            return { outage, start, end, stop, ms: (end ?? at) - start }
        })
        .sort((a, b) => b.start - a.start)

    return [
        summary,
        {
            name: 'Устройства',
            columnWidths: deviceWidths,
            statusColumns: [0],
            rows: [deviceHeader, ...sorted.map(deviceRow)],
        },
        {
            name: 'Не работает сейчас',
            columnWidths: deviceWidths,
            statusColumns: [0],
            rows: [deviceHeader, ...offline.map(deviceRow)],
        },
        {
            name: 'По остановкам',
            columnWidths: [16, 34, 12, 26, 14, 14, 20],
            statusColumns: [0, 6],
            rows: [
                ['Итог на момент выгрузки', 'Остановка', '№ остановки', 'Микрорайон', 'Камер в сети', 'Камер всего', 'Контроллер датчиков'],
                ...stopRows.map((row) => [
                    row.verdict,
                    row.stop.name,
                    row.stop.number,
                    row.stop.district,
                    row.cameras.filter((d) => d.state.status === 'online').length,
                    row.cameras.length,
                    row.controller ? STATUS_LABEL[row.controller.state.status] : 'Нет',
                ]),
            ],
        },
        {
            name: 'Отключения за период',
            columnWidths: [22, 34, 12, 26, 18, 18, 18, 12],
            rows: [
                ['Устройство', 'Остановка', '№ остановки', 'Микрорайон', 'Пропало', 'Вернулось', 'Длительность', 'Часов'],
                ...outageRows.map((row) => [
                    deviceLabel(row.outage.equipment_type, row.outage.equipment_id),
                    row.stop.name,
                    row.stop.number,
                    row.stop.district,
                    localDateTime(row.start),
                    row.end !== null ? localDateTime(row.end) : 'не вернулось',
                    humanDuration(row.ms),
                    hoursValue(row.ms),
                ]),
            ],
        },
    ]
}
