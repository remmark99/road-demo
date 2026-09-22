import { sessionRequest } from '../request-cache'
import { supabase } from '../supabase'

export interface ControllerAlert {
    id: string
    created_at: string
    module_name: string
    element: number
    address: number
    category: string
    value: number
    alarm: string
    prev_alarm: string | null
    message: string
    clip_path?: string | null
    bus_stop_id?: number | null
}

export interface FetchControllerAlertsOptions {
    countExact?: boolean
    fromInclusive?: string
    toExclusive?: string
    elements?: number[]
    alarms?: string[]
    categories?: string[]
    /** Restrict to the stop whose controller raised the alarm. */
    busStopId?: number
    limit?: number
    offset?: number
}

export interface ControllerAlertsResult {
    alerts: ControllerAlert[]
    total: number
    hasMore: boolean
}

const SENSOR_LABELS: Record<number, string> = {
    1: 'Датчик разбития стекла',
    13: 'Датчик температуры и влажности',
}

export function getSensorLabel(element: number): string {
    return SENSOR_LABELS[element] ?? `Элемент ${element}`
}

export const ALARM_CONFIG: Record<string, { label: string; color: string }> = {
    normal: {
        label: 'Норма',
        color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
    },
    warning: {
        label: 'Предупреждение',
        color: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
    },
    critical: {
        label: 'Критично',
        color: 'text-red-400 bg-red-500/20 border-red-500/30',
    },
}

/**
 * Единый тип события для срабатывания датчика на остановке.
 *
 * Датчик фиксирует отклонение, но не его причину: мокрый пакет, брошенный в
 * стекло, срабатывает так же, как удар. Поэтому событие называется «инцидент»
 * и не утверждает, что это был вандализм.
 */
export const INCIDENT_CATEGORY = 'incident'

/**
 * Категории, под которыми это же событие писалось раньше. Бэкенд пишет
 * INCIDENT_CATEGORY, но записи в БД остаются навсегда, поэтому фильтр и подписи
 * должны понимать и старые значения.
 */
export const INCIDENT_CATEGORY_ALIASES = [INCIDENT_CATEGORY, 'glass_break', 'digital input'] as const

export const CATEGORY_LABELS: Record<string, string> = {
    temperature: 'Температура',
    humidity: 'Влажность',
    'digital input': 'Инцидент',
    'glass_break': 'Инцидент',
    incident: 'Инцидент',
    controller_offline: 'Контроллер не на связи',
    controller_online: 'Контроллер снова на связи',
}

/**
 * Разворачивает «инцидент» в список его исторических категорий: запрос идёт
 * через `in('category', …)`, и без этого кнопка фильтра теряла бы старые записи.
 */
export function expandCategoryFilter(categories: readonly string[]): string[] {
    const expanded = new Set<string>()
    for (const category of categories) {
        if (category === INCIDENT_CATEGORY) {
            for (const alias of INCIDENT_CATEGORY_ALIASES) expanded.add(alias)
        } else {
            expanded.add(category)
        }
    }
    return [...expanded]
}

/**
 * Категории для кнопок фильтра. `glass_break` и `digital input` остаются в
 * CATEGORY_LABELS, чтобы подписать старые записи, но отдельных кнопок у них
 * нет: это то же самое событие, что и `incident`, — кнопка «Инцидент»
 * разворачивается в них через expandCategoryFilter().
 */
export const FILTERABLE_CATEGORIES = [
    'temperature',
    'humidity',
    INCIDENT_CATEGORY,
    'controller_offline',
    'controller_online',
] as const

/**
 * Связь с самим контроллером (backend equipment-monitor), а не показание
 * датчика: element/address = 0, value — длительность простоя в минутах.
 */
export const CONTROLLER_LINK_CATEGORIES = ['controller_offline', 'controller_online'] as const

export function isControllerLinkAlert(alert: Pick<ControllerAlert, 'category'>): boolean {
    return (CONTROLLER_LINK_CATEGORIES as readonly string[]).includes(alert.category)
}

export function getControllerAlertSourceLabel(
    alert: Pick<ControllerAlert, 'category' | 'element'>
): string {
    return isControllerLinkAlert(alert) ? 'Контроллер' : getSensorLabel(alert.element)
}

export function fetchControllerAlerts(options: FetchControllerAlertsOptions = {}): Promise<ControllerAlertsResult> {
    return sessionRequest(`controller-alerts:${JSON.stringify(options)}`, 15_000, () => loadfetchControllerAlerts(options))
}
async function loadfetchControllerAlerts(options: FetchControllerAlertsOptions): Promise<ControllerAlertsResult> {
    const { elements, alarms, categories, busStopId, fromInclusive, toExclusive, limit = 25, offset = 0 } = options

    const build = (withBusStopId: boolean) => {
        let query = supabase
            .from('controller_alerts')
            .select('*', options.countExact === false ? {} : { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - (options.countExact === false ? 0 : 1))

        if (fromInclusive) query = query.gte('created_at', fromInclusive)
        if (toExclusive) query = query.lt('created_at', toExclusive)

        if (elements && elements.length > 0) {
            query = query.in('element', elements)
        }

        if (alarms && alarms.length > 0) {
            query = query.in('alarm', alarms)
        }

        if (categories && categories.length > 0) {
            query = query.in('category', expandCategoryFilter(categories))
        }

        if (withBusStopId && busStopId !== undefined) {
            query = query.eq('bus_stop_id', busStopId)
        }

        return query
    }

    let { data, error, count } = await build(true)

    // `bus_stop_id` arrives with sql/controller_alerts_bus_stop_migration.sql. Before
    // it is applied, drop the filter rather than showing the caller nothing at all.
    if (error && busStopId !== undefined && (error.code === '42703' || error.message?.includes('bus_stop_id'))) {
        console.warn("Колонка 'bus_stop_id' не найдена в controller_alerts. Делаю fallback без фильтра по остановке.")
        ;({ data, error, count } = await build(false))
    }

    if (error) {
        console.error('Error fetching controller alerts:', error)
        return { alerts: [], total: 0, hasMore: false }
    }

    return {
        alerts: (data || []).slice(0, limit),
        total: options.countExact === false ? offset + (data?.length || 0) : count || 0,
        hasMore: options.countExact === false ? (data?.length || 0) > limit : (offset + limit) < (count || 0),
    }
}
