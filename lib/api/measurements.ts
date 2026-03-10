import { supabase } from '../supabase'

export interface Measurement {
    id: number
    created_at: string
    element: number
    address: number
    category: string
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
    1: 'Цифровой вход',
    13: 'Датчик влажности и температуры',
    14: 'Датчик температуры',
}

/**
 * Fetch the latest measurement for a specific element and category.
 */
async function fetchLatestForElementCategory(
    element: number,
    category: string
): Promise<Measurement | null> {
    const { data, error } = await supabase
        .from('measurements')
        .select('*')
        .eq('element', element)
        .eq('category', category)
        .order('created_at', { ascending: false })
        .limit(1)

    if (error) {
        console.error(`Error fetching ${category} for element ${element}:`, error)
        return null
    }

    return data?.[0] ?? null
}

/**
 * Fetch the latest measurements for all sensors.
 * Queries per element+category to guarantee we always get the latest of each.
 */
export async function fetchLatestMeasurements(): Promise<SensorReading[]> {
    const [dio1, temp13, hum13, temp14] = await Promise.all([
        fetchLatestForElementCategory(1, 'digital input'),
        fetchLatestForElementCategory(13, 'temperature'),
        fetchLatestForElementCategory(13, 'humidity'),
        fetchLatestForElementCategory(14, 'temperature'),
    ])

    const readings: SensorReading[] = [
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

    return readings
}

export { SENSOR_DESCRIPTIONS }

/**
 * Subscribe to realtime inserts on the measurements table.
 * Returns an unsubscribe function.
 */
export function subscribeMeasurements(onUpdate: () => void) {
    const channel = supabase
        .channel('measurements-realtime')
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
