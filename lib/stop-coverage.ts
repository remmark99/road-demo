import type { StopActivityResponse } from './api/stop-activity'

export interface StopDistrict { id: number; name: string }
export interface StopDistrictAssignment { id: number; district_id: number | null }

/**
 * Остановки, у которых хотя бы одна камера сейчас онлайн, по таблице equipment_state.
 * Несколько камер одной остановки считаются один раз; каждая сторона дороги — своя остановка.
 */
export function onlineVideoStops(
    states: { equipment_type: string; status: string; bus_stop_id: number | null }[],
    districtNameByStop: (stopId: number) => string | undefined,
) {
    const stopIds = new Set<number>()
    for (const state of states) {
        if (state.equipment_type === 'camera' && state.status === 'online' && state.bus_stop_id !== null) stopIds.add(state.bus_stop_id)
    }
    const byDistrict = new Map<string, number>()
    for (const stopId of stopIds) {
        const district = districtNameByStop(stopId)
        if (district) byDistrict.set(district, (byDistrict.get(district) ?? 0) + 1)
    }
    return { total: stopIds.size, byDistrict }
}

const SHORT_NAMES: Record<string, string> = { 'Центральный': 'Центр.', 'Железнодорожников': 'Ж/д', 'Квартал А': 'Кв. А' }

/** Подпись под столбцом: «14-й микрорайон» → «14», «микрорайон 11а» → «11а», «6-й квартал» → «6 кв.». Полное имя — в подсказке. */
export function districtShortName(name: string) {
    const quarter = name.match(/^(\d+)-й квартал$/i)
    if (quarter) return `${quarter[1]} кв.`
    const short = name
        .replace(/^(\d+)-й микрорайон$/i, '$1')
        .replace(/^микрорайон\s+/i, '')
        .replace(/\s+микрорайон$/i, '')
    return SHORT_NAMES[short] ?? short
}

/**
 * Покрытие по микрорайонам из bus_stops.district_id (ставится в БД триггером).
 * Все микрорайоны попадают в результат, в том числе без остановок и без оборудования.
 */
export function stopDistrictCoverage(stopIds: number[], assignments: StopDistrictAssignment[], districts: StopDistrict[], activity: StopActivityResponse | null) {
    const districtByStop = new Map(assignments.map(a => [a.id, a.district_id]))
    const rows = new Map(districts.map(d => [d.id, { districtId: d.id, districtName: d.name, shortName: districtShortName(d.name), total: 0, equipped: 0, coveragePct: 0 }]))
    let unassigned = 0
    for (const id of stopIds) {
        const row = rows.get(districtByStop.get(id) ?? -1)
        if (!row) { unassigned++; continue }
        row.total++
        if (activity?.stops[id]?.has_equipment) row.equipped++
    }
    for (const row of rows.values()) row.coveragePct = row.total ? 100 * row.equipped / row.total : 0
    return { unassigned, rows: [...rows.values()].sort((a, b) => b.coveragePct - a.coveragePct || a.districtName.localeCompare(b.districtName, 'ru', { numeric: true })) }
}
