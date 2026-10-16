/**
 * Какие из доступных модулей включены при первом входе, пока пользователь сам ничего
 * не выбрал. `NEXT_PUBLIC_DEFAULT_ACTIVE_MODULES` — список через запятую (например,
 * `stops`); пусто — включены все доступные, как раньше. Остальные доступные модули
 * пользователь включает сам, выбор хранится в браузере.
 */
export function defaultActiveModules(available: readonly string[], configured: string | undefined): string[] {
    const wanted = (configured || '').split(',').map((module) => module.trim()).filter(Boolean)
    if (wanted.length === 0) return [...available]
    const picked = available.filter((module) => wanted.includes(module))
    return picked.length > 0 ? picked : [...available]
}
