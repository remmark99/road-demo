import { createClient } from '../supabase/client'
import { sessionRequest } from '../request-cache'
import { readReportRows } from '../exports/read-report-rows'
import type { StopDistrict, StopDistrictAssignment } from '../stop-coverage'

/** Справочник микрорайонов; один запрос на сессию. */
export function fetchStopDistricts(): Promise<StopDistrict[]> {
    return sessionRequest('stop-districts', 60_000, () => readReportRows<StopDistrict>(async (from, to) => {
        const { data, error } = await createClient().from('districts').select('id,name').order('id').range(from, to)
        return { data: data as StopDistrict[] | null, error }
    }))
}

/** Микрорайон каждой остановки (bus_stops.district_id). */
export function fetchStopDistrictAssignments(): Promise<StopDistrictAssignment[]> {
    return sessionRequest('stop-district-assignments', 60_000, () => readReportRows<StopDistrictAssignment>(async (from, to) => {
        const { data, error } = await createClient().from('bus_stops').select('id,district_id').order('id').range(from, to)
        return { data: data as StopDistrictAssignment[] | null, error }
    }))
}
