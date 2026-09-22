import { createClient } from '../supabase/client'
import { sessionRequest } from '../request-cache'
import { readReportRows } from '../exports/read-report-rows'
import type { StopDistrict } from '../stop-coverage'

/** Small directory of real boundaries; shares one cached request per session. */
export function fetchStopDistricts(): Promise<StopDistrict[]> {
    return sessionRequest('stop-districts', 60_000, () => readReportRows<StopDistrict>(async (from, to) => {
        const { data, error } = await createClient().from('districts').select('id,name,geom').order('id').range(from, to)
        return { data: data as StopDistrict[] | null, error }
    }))
}
