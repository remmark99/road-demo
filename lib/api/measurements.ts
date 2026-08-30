import { supabase } from '../supabase'

export interface Measurement {
    bus_stop_id?: number
    created_at?: string
    updated_at?: string
    element: number
    address: number
    category: string
    name?: string
    value: number
    alarm: string
}

export interface SensorReading {
    element: number
    label: string
    temperature: number | null
    humidity: number | null
    digitalState: boolean | null
    temperatureAlarm: string | null
    humidityAlarm: string | null
    digitalAlarm: string | null
    temperatureUpdatedAt: string | null
    humidityUpdatedAt: string | null
    digitalUpdatedAt: string | null
}

const SENSOR_LABELS: Record<number, string> = {
    1: 'Датчик DIO1',
    13: 'Датчик 1',
    14: 'Датчик 2',
}

const SENSOR_DESCRIPTIONS: Record<number, string> = {
    1: 'Цифровой вход / Напряжение',
    13: 'Датчик влажности и температуры',
    14: 'Датчик температуры',
}

export interface StopSensorStateRow {
    bus_stop_id: number
    element: number
    address: number
    category: string
    name: string | null
    value: number | null
    alarm: string | null
    updated_at: string | null
}

/**
 * Fetch the latest measurements for all sensors, querying the UPSERTed stop_sensor_states table.
 * If busStopId is provided, filters by bus_stop_id.
 */
export async function fetchLatestMeasurements(busStopId?: number): Promise<SensorReading[]> {
    let query = supabase.from('stop_sensor_states').select('*')
    if (busStopId !== undefined) {
        query = query.eq('bus_stop_id', busStopId)
    }

    const { data, error } = await query

    if (error || !data || data.length === 0) {
        return fetchLatestMeasurementsFallback()
    }

    const rows = data as StopSensorStateRow[]
    const dio1 = rows.find((row) => row.element === 1 && row.category === 'digital input')
        ?? rows.find((row) => row.element === 1)
    const temp13 = rows.find((row) => row.element === 13 && row.category === 'temperature')
    const hum13 = rows.find((row) => row.element === 13 && row.category === 'humidity')
    const temp14 = rows.find((row) => row.element === 14 && row.category === 'temperature')
        ?? rows.find((row) => row.element === 14)

    return [
        {
            element: 1,
            label: SENSOR_LABELS[1],
            temperature: null,
            humidity: null,
            digitalState: dio1 && dio1.value !== null ? Boolean(dio1.value) : null,
            temperatureAlarm: null,
            humidityAlarm: null,
            digitalAlarm: dio1?.alarm ?? null,
            temperatureUpdatedAt: null,
            humidityUpdatedAt: null,
            digitalUpdatedAt: dio1?.updated_at ?? null,
        },
        {
            element: 13,
            label: SENSOR_LABELS[13],
            temperature: temp13?.value ?? null,
            humidity: hum13?.value ?? null,
            digitalState: null,
            temperatureAlarm: temp13?.alarm ?? null,
            humidityAlarm: hum13?.alarm ?? null,
            digitalAlarm: null,
            temperatureUpdatedAt: temp13?.updated_at ?? null,
            humidityUpdatedAt: hum13?.updated_at ?? null,
            digitalUpdatedAt: null,
        },
        {
            element: 14,
            label: SENSOR_LABELS[14],
            temperature: temp14?.value ?? null,
            humidity: null,
            digitalState: null,
            temperatureAlarm: temp14?.alarm ?? null,
            humidityAlarm: null,
            digitalAlarm: null,
            temperatureUpdatedAt: temp14?.updated_at ?? null,
            humidityUpdatedAt: null,
            digitalUpdatedAt: null,
        },
    ]
}

/**
 * Fetch the latest measurements for all sensors.
 * Queries per element+category to guarantee we always get the latest of each.
 */
async function fetchLatestMeasurementsFallback(): Promise<SensorReading[]> {
    async function fetchLatestForElementCategory(
        element: number,
        category: string,
    ): Promise<Measurement | null> {
        const { data } = await supabase
            .from('measurements')
            .select('*')
            .eq('element', element)
            .eq('category', category)
            .order('created_at', { ascending: false })
            .limit(1)

        return data?.[0] ?? null
    }

    const [dio1, temp13, hum13, temp14] = await Promise.all([
        fetchLatestForElementCategory(1, 'digital input'),
        fetchLatestForElementCategory(13, 'temperature'),
        fetchLatestForElementCategory(13, 'humidity'),
        fetchLatestForElementCategory(14, 'temperature'),
    ])

    return [
        {
            element: 1,
            label: SENSOR_LABELS[1],
            temperature: null,
            humidity: null,
            digitalState: dio1 ? Boolean(dio1.value) : null,
            temperatureAlarm: null,
            humidityAlarm: null,
            digitalAlarm: dio1?.alarm ?? null,
            temperatureUpdatedAt: null,
            humidityUpdatedAt: null,
            digitalUpdatedAt: dio1?.created_at ?? null,
        },
        {
            element: 13,
            label: SENSOR_LABELS[13],
            temperature: temp13?.value ?? null,
            humidity: hum13?.value ?? null,
            digitalState: null,
            temperatureAlarm: temp13?.alarm ?? null,
            humidityAlarm: hum13?.alarm ?? null,
            digitalAlarm: null,
            temperatureUpdatedAt: temp13?.created_at ?? null,
            humidityUpdatedAt: hum13?.created_at ?? null,
            digitalUpdatedAt: null,
        },
        {
            element: 14,
            label: SENSOR_LABELS[14],
            temperature: temp14?.value ?? null,
            humidity: null,
            digitalState: null,
            temperatureAlarm: temp14?.alarm ?? null,
            humidityAlarm: null,
            digitalAlarm: null,
            temperatureUpdatedAt: temp14?.created_at ?? null,
            humidityUpdatedAt: null,
            digitalUpdatedAt: null,
        },
    ]
}

export { SENSOR_DESCRIPTIONS }

/**
 * Subscribe to realtime changes on the stop_sensor_states table (and fallback to measurements).
 * Returns an unsubscribe function.
 */
export function subscribeMeasurements(onUpdate: () => void, busStopId?: number) {
    const filter = busStopId !== undefined ? `bus_stop_id=eq.${busStopId}` : undefined

    const channel = supabase
        .channel(`sensor-states-realtime-${busStopId ?? 'all'}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'stop_sensor_states',
                filter,
            },
            () => {
                onUpdate()
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'measurements',
            },
            () => {
                onUpdate()
            }
        )
        .subscribe()

    return () => {
        supabase.removeChannel(channel)
    }
}
