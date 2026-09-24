import type { StopActivityResponse } from './api/stop-activity'

export interface StopDistrict { id: number; name: string }
export interface StopDistrictAssignment { id: number; district_id: number | null }

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
    return { unassigned, rows: [...rows.values()].sort((a, b) => a.districtName.localeCompare(b.districtName, 'ru', { numeric: true })) }
}
