// «Все / События / Техника» на странице уведомлений: техника — это связь
// оборудования (камера или контроллер не в сети / снова в сети), события — всё остальное.

export type FeedKind = 'all' | 'events' | 'equipment'

export const FEED_KIND_OPTIONS: { value: FeedKind; label: string; hint: string }[] = [
    { value: 'all', label: 'Все', hint: 'События и состояние техники' },
    { value: 'events', label: 'События', hint: 'Только происшествия, без «не в сети / снова в сети»' },
    { value: 'equipment', label: 'Техника', hint: 'Только «не в сети / снова в сети»' },
]

/**
 * Типы тревог камер для запроса. Пустой результат значит «ничего не показывать»:
 * fetchAlerts без типов вернул бы всё подряд.
 */
export function feedKindTypes(types: readonly string[], kind: FeedKind, equipmentTypes: readonly string[]): string[] {
    if (kind === 'all') return [...types]
    const equipment = new Set(equipmentTypes)
    return types.filter((type) => (kind === 'equipment') === equipment.has(type))
}

export interface ControllerKindFilter {
    categories?: string[]
    excludeCategories?: string[]
    empty: boolean
}

/** Фильтр категорий controller_alerts для выбранного режима поверх выбранных категорий. */
export function controllerKindFilter(
    selected: readonly string[],
    kind: FeedKind,
    linkCategories: readonly string[],
): ControllerKindFilter {
    if (kind === 'all') return { categories: selected.length > 0 ? [...selected] : undefined, empty: false }
    const link = new Set(linkCategories)
    if (kind === 'equipment') {
        const categories = selected.length > 0 ? selected.filter((c) => link.has(c)) : [...linkCategories]
        return { categories, empty: categories.length === 0 }
    }
    if (selected.length === 0) return { excludeCategories: [...linkCategories], empty: false }
    const categories = selected.filter((c) => !link.has(c))
    return { categories, empty: categories.length === 0 }
}
