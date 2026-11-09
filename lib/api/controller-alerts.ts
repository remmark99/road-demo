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
    metadata?: { glass_episode?: {
        status: 'open' | 'closed'
        started_at: string
        last_seen_at: string
        last_checked_at?: string
        ended_at?: string
        first_evidence: GlassEvidence[]
        latest_evidence: GlassEvidence[]
        closed_evidence?: GlassEvidence[]
    } }
}

export interface GlassEvidence {
    camera_index: number
    before?: { timestamp: number; url: string }
    after: { timestamp: number; url: string }
    /** Модель назвала эту камеру среди тех, где видно повреждение (glass_monitor.py). */
    damaged?: boolean
}

export interface FetchControllerAlertsOptions {
    countExact?: boolean
    fromInclusive?: string
    toExclusive?: string
    elements?: number[]
    alarms?: string[]
    categories?: string[]
    /** Categories to leave out (used by the «События» feed mode). */
    excludeCategories?: string[]
    /** Restrict to the stop whose controller raised the alarm. */
    busStopId?: number
    /** Restrict to several stops — the stop filter on the notifications page. */
    busStopIds?: number[]
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

/**
 * Подпись типа события — кнопка фильтра, бейдж в строке, колонка в Excel.
 *
 * Срабатывание контакта называется по датчику, а не по причине: «Датчик
 * стекла» говорит оператору, что именно сработало, и ничего не утверждает о
 * том, был ли это удар. Причину он определяет по снимку.
 */
export const CATEGORY_LABELS: Record<string, string> = {
    temperature: 'Температура',
    humidity: 'Влажность',
    'digital input': 'Датчик стекла',
    'glass_break': 'Датчик стекла',
    incident: 'Датчик стекла',
    controller_offline: 'Контроллер не на связи',
    controller_online: 'Контроллер снова на связи',
}

/**
 * Короткая подпись для бейджа в строке — там рядом уже стоит значок связи, а
 * полное «Контроллер не на связи» в колонку не помещается.
 */
export const CATEGORY_BADGE_LABELS: Record<string, string> = {
    ...CATEGORY_LABELS,
    controller_offline: 'Не на связи',
    controller_online: 'Снова на связи',
}

/** Цвет бейджа типа события, пока отклонение действует. */
export const CATEGORY_COLORS: Record<string, string> = {
    temperature: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
    humidity: 'text-sky-400 bg-sky-500/20 border-sky-500/30',
    'digital input': 'text-red-400 bg-red-500/20 border-red-500/30',
    'glass_break': 'text-red-400 bg-red-500/20 border-red-500/30',
    incident: 'text-red-400 bg-red-500/20 border-red-500/30',
    controller_offline: 'text-red-400 bg-red-500/20 border-red-500/30',
    controller_online: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
}

/** Цвет бейджа, когда событие — возврат в норму (alarm = normal). */
export const RECOVERY_COLOR = 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30'

/**
 * Возврат в норму: температура снова в пределах, контакт стекла отпущен,
 * контроллер снова на связи. Срабатывание — любой другой `alarm`: контроллер
 * пишет `critical` / `warning`, функция подтверждения стекла — `alarm`.
 */
export function isRecoveryAlert(alert: Pick<ControllerAlert, 'alarm'>): boolean {
    return alert.alarm === 'normal'
}

export function getCategoryColor(alert: Pick<ControllerAlert, 'category' | 'alarm'>): string {
    if (isRecoveryAlert(alert)) return RECOVERY_COLOR
    return CATEGORY_COLORS[alert.category] ?? 'text-muted-foreground bg-muted'
}

/** Срабатывание датчика стекла: подтверждённый эпизод или голый сигнал контакта. */
export function isGlassAlert(alert: Pick<ControllerAlert, 'category'>): boolean {
    return (INCIDENT_CATEGORY_ALIASES as readonly string[]).includes(alert.category)
}

export function getCategoryUnit(category: string): string {
    if ((CONTROLLER_LINK_CATEGORIES as readonly string[]).includes(category)) return 'мин'
    if (category === 'temperature') return '°C'
    if (category === 'humidity') return '%'
    return ''
}

/**
 * Единицы измерения, которые не считаются латиницей.
 *
 * Сообщение контроллера с латинскими буквами заменяется нашим: контроллер
 * подписывает свои каналы как «DIO1». Но «°C» — это единица измерения в нашем
 * собственном сообщении о пороге температуры, и без этой поправки оператор
 * вместо значения и порога увидел бы общую фразу.
 */
export function withoutUnits(value: string): string {
    return value.replace(/°\s?C/g, '°')
}

function formatValue(value: number, unit: string): string {
    return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`
}

/**
 * Что случилось — одной фразой для оператора.
 *
 * Бэкенд (пороги климата, мониторинг связи, подтверждение стекла) пишет
 * готовый русский текст — он и показывается. Записи самого контроллера и
 * старые строки с латиницей получают фразу по категории: сработал датчик
 * стекла, температура такая-то за пределами допустимого, и так далее.
 */
export function controllerAlertMessage(alert: Pick<ControllerAlert, 'category' | 'alarm' | 'value' | 'message'>): string {
    const raw = (alert.message ?? '').trim()
    const climate = alert.category === 'temperature' || alert.category === 'humidity'
    // «Зафиксировано срабатывание: Влажность (элемент 13, адрес 1)» — так поллер
    // писал тревогу контроллера до 09.11.2026: без показания. Значение в строке
    // есть, так что текст собирается заново.
    const informative = !climate || /\d+[.,]\d|\d+\s?(°|%)/.test(raw)
    if (raw && informative && /[А-Яа-яЁё]/.test(raw) && !/[A-Za-z]/.test(withoutUnits(raw))) return raw

    const recovered = isRecoveryAlert(alert)
    const value = Number.isFinite(alert.value) ? formatValue(alert.value, getCategoryUnit(alert.category)) : null
    switch (alert.category) {
        case 'temperature':
            return recovered
                ? `Температура вернулась в норму${value ? `: ${value}` : ''}`
                : `Температура вне допустимых пределов${value ? `: ${value}` : ''}`
        case 'humidity':
            return recovered
                ? `Влажность вернулась в норму${value ? `: ${value}` : ''}`
                : `Влажность вне допустимых пределов${value ? `: ${value}` : ''}`
        case 'controller_offline':
            return `Контроллер остановки не на связи${value ? ` ${value}` : ''}`
        case 'controller_online':
            return `Контроллер остановки снова на связи${value ? `. Не отвечал ${value}` : ''}`
        default:
            if ((INCIDENT_CATEGORY_ALIASES as readonly string[]).includes(alert.category)) {
                return recovered ? 'Датчик разбития стекла вернулся в норму' : 'Сработал датчик разбития стекла'
            }
            return `${CATEGORY_LABELS[alert.category] ?? 'Событие датчика'}${value ? `: ${value}` : ''}`
    }
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
    const { elements, alarms, categories, excludeCategories, busStopId, busStopIds, fromInclusive, toExclusive, limit = 25, offset = 0 } = options
    const stopFilter = busStopId !== undefined || (busStopIds !== undefined && busStopIds.length > 0)

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

        if (excludeCategories && excludeCategories.length > 0) {
            // NOT IN alone would also drop rows without a category.
            query = query.or(`category.is.null,category.not.in.(${expandCategoryFilter(excludeCategories).join(',')})`)
        }

        if (withBusStopId && busStopId !== undefined) {
            query = query.eq('bus_stop_id', busStopId)
        }
        if (withBusStopId && busStopIds !== undefined && busStopIds.length > 0) {
            query = query.in('bus_stop_id', busStopIds)
        }

        return query
    }

    let { data, error, count } = await build(true)

    // `bus_stop_id` arrives with sql/controller_alerts_bus_stop_migration.sql. Before
    // it is applied, drop the filter rather than showing the caller nothing at all.
    if (error && stopFilter && (error.code === '42703' || error.message?.includes('bus_stop_id'))) {
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
