// Кэш процесса, общий для всех маршрутов и для прогрева в instrumentation.ts.
// Next собирает прогрев и каждый маршрут отдельно: у переменной модуля в каждой сборке своя
// копия, и прогретое в одной копии маршруты не видели. Поэтому всё общее лежит в globalThis.
interface Entry { at: number; ttl: number; value: unknown; pending: Promise<unknown> | null }

const shared = globalThis as unknown as { __vectorSharedCache?: Map<string, Entry>; __vectorSharedState?: Map<string, unknown> }
const cache = (shared.__vectorSharedCache ??= new Map<string, Entry>())
const states = (shared.__vectorSharedState ??= new Map<string, unknown>())

/** Одно на процесс изменяемое состояние (например, накопительный кэш) под своим именем. */
export function sharedState<T>(name: string, create: () => T): T {
    if (!states.has(name)) states.set(name, create())
    return states.get(name) as T
}

/**
 * Значение из общего кэша или его сборка. Одновременные запросы одного ключа ждут одну сборку.
 * force — пересобрать, даже если значение свежее (прогрев); пока идёт пересборка,
 * остальные получают прежнее значение без ожидания.
 */
export function sharedCached<T>(key: string, ttlMs: number, build: () => Promise<T>, force = false): Promise<T> {
    const now = Date.now()
    const entry = cache.get(key)
    const fresh = entry !== undefined && entry.value !== undefined && now - entry.at < entry.ttl
    if (fresh && !force) return Promise.resolve(entry.value as T)
    if (entry?.pending) return (fresh ? Promise.resolve(entry.value) : entry.pending) as Promise<T>
    const current: Entry = entry ?? { at: 0, ttl: ttlMs, value: undefined, pending: null }
    current.pending = build().then((value) => {
        current.at = Date.now()
        current.ttl = ttlMs
        current.value = value
        return value
    }).finally(() => {
        current.pending = null
        // Сборка не удалась и прежнего значения нет — запись не держим.
        if (current.value === undefined) cache.delete(key)
        for (const [otherKey, other] of cache) if (!other.pending && Date.now() - other.at >= other.ttl) cache.delete(otherKey)
    })
    cache.set(key, current)
    return current.pending as Promise<T>
}
