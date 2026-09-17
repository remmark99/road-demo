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
    /** true — контакт разомкнут, стекло разбито. */
    glassBreak: boolean | null
    temperatureAlarm: string | null
    humidityAlarm: string | null
    glassBreakAlarm: string | null
    temperatureUpdatedAt: string | null
    humidityUpdatedAt: string | null
    glassBreakUpdatedAt: string | null
}

/**
 * На остановке установлено ровно два датчика, остальные каналы контроллера —
 * свободные клеммы, и воркер их больше не пишет (SUPPORTED_SENSORS в
 * src/controller/glass_break_worker.py бэкенда).
 */
export const GLASS_BREAK_ELEMENT = 1
export const CLIMATE_ELEMENT = 13

const SENSOR_LABELS: Record<number, string> = {
    [GLASS_BREAK_ELEMENT]: 'Датчик разбития стекла',
    [CLIMATE_ELEMENT]: 'Датчик температуры и влажности',
}

const SENSOR_DESCRIPTIONS: Record<number, string> = {
    [GLASS_BREAK_ELEMENT]: 'Сухой контакт на стекле павильона',
    [CLIMATE_ELEMENT]: 'Температура и влажность воздуха',
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

/** Один канал контроллера, приведённый к общему виду для обеих таблиц. */
interface Channel {
    value: number | null
    alarm: string | null
    at: string | null
}

function buildReadings(
    glass: Channel | null,
    temperature: Channel | null,
    humidity: Channel | null,
): SensorReading[] {
    return [
        {
            element: GLASS_BREAK_ELEMENT,
            label: SENSOR_LABELS[GLASS_BREAK_ELEMENT],
            temperature: null,
            humidity: null,
            // Контроллер отдаёт 1 на сработавшем контакте — так же это читает воркер.
            glassBreak: glass && glass.value !== null ? glass.value > 0.5 : null,
            temperatureAlarm: null,
            humidityAlarm: null,
            glassBreakAlarm: glass?.alarm ?? null,
            temperatureUpdatedAt: null,
            humidityUpdatedAt: null,
            glassBreakUpdatedAt: glass?.at ?? null,
        },
        {
            element: CLIMATE_ELEMENT,
            label: SENSOR_LABELS[CLIMATE_ELEMENT],
            temperature: temperature?.value ?? null,
            humidity: humidity?.value ?? null,
            glassBreak: null,
            temperatureAlarm: temperature?.alarm ?? null,
            humidityAlarm: humidity?.alarm ?? null,
            glassBreakAlarm: null,
            temperatureUpdatedAt: temperature?.at ?? null,
            humidityUpdatedAt: humidity?.at ?? null,
            glassBreakUpdatedAt: null,
        },
    ]
}

function fromState(row: StopSensorStateRow | undefined): Channel | null {
    return row ? { value: row.value, alarm: row.alarm, at: row.updated_at } : null
}

function fromMeasurement(row: Measurement | null): Channel | null {
    return row ? { value: row.value ?? null, alarm: row.alarm ?? null, at: row.created_at ?? null } : null
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
        // The legacy `measurements` table has no bus_stop_id, so falling back to it
        // for a specific stop would return another stop's readings.
        if (busStopId !== undefined) return []
        return fetchLatestMeasurementsFallback()
    }

    const rows = data as StopSensorStateRow[]

    return buildReadings(
        fromState(
            rows.find((row) => row.element === GLASS_BREAK_ELEMENT && row.category === 'digital input')
            ?? rows.find((row) => row.element === GLASS_BREAK_ELEMENT),
        ),
        fromState(rows.find((row) => row.element === CLIMATE_ELEMENT && row.category === 'temperature')),
        fromState(rows.find((row) => row.element === CLIMATE_ELEMENT && row.category === 'humidity')),
    )
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

    const [glass, temperature, humidity] = await Promise.all([
        fetchLatestForElementCategory(GLASS_BREAK_ELEMENT, 'digital input'),
        fetchLatestForElementCategory(CLIMATE_ELEMENT, 'temperature'),
        fetchLatestForElementCategory(CLIMATE_ELEMENT, 'humidity'),
    ])

    return buildReadings(
        fromMeasurement(glass),
        fromMeasurement(temperature),
        fromMeasurement(humidity),
    )
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
