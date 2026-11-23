/**
 * Фильтрация разделов интерфейса по лицензии.
 *
 * Зачем отдельный файл: `lib/license.ts` импортирует `fs`, `path` и `crypto`, то
 * есть пригоден только на сервере. Фильтрация же нужна в клиентском компоненте
 * (`components/providers/module-context.tsx`), поэтому здесь не должно быть ни одной
 * зависимости — ни node, ни react.
 *
 * Лицензируется МОДУЛЬ, а не отдельные возможности внутри него: куплены
 * «Остановки» — работает всё, что в них входит, и какие детекции там под капотом,
 * лицензию не касается. Поэтому словарь один и тот же на три стороны:
 *
 *   `profiles.modules` и `hasModule(...)` здесь,
 *   `license_modules` / `licenses.modules` в реестре вендора,
 *   `require_module(MODULE_STOPS)` в воркерах бэкенда.
 *
 * Расхождение любой из трёх означает, что купленный модуль либо не работает, либо
 * не виден оператору.
 */

/** Что ответил `/api/license`. */
export type LicenseState =
    /** Лицензия действительна, `modules` получены. */
    | 'ok'
    /** Определённый отказ: файла нет, подпись не сошлась, срок истёк. */
    | 'invalid'
    /** Спросить не удалось: сеть, 5xx, неразборный ответ. */
    | 'unknown'

/**
 * Оставить разделы, которые разрешает лицензия.
 *
 * `licenseModules === null` означает «спросить не удалось» — тогда ничего не
 * фильтруем. Транзиентный сбой `/api/license` не должен гасить оператору интерфейс:
 * конвейер в этот момент всё равно живёт по своей проверке лицензии, а пустой экран
 * без объяснения — это звонок в поддержку.
 *
 * Пустой массив, наоборот, означает определённый отказ, и разделы скрываются. Раньше
 * оба случая сводились к `!res.ok`, то есть отсутствие лицензии давало полный доступ.
 */
export function filterModulesByLicense(
    userModules: readonly string[],
    licenseModules: readonly string[] | null,
): string[] {
    if (licenseModules === null) return [...userModules]

    const granted = new Set(licenseModules)
    return userModules.filter(section => granted.has(section))
}

/**
 * Временный демо-доступ: модули из `LICENSE_DEMO_MODULES` (через запятую) добавляются
 * к модулям подписанной лицензии, пока переменная задана на сервере. Нужен, чтобы
 * показать заказчику непроданные модули без перевыпуска license.key; убирается
 * удалением переменной. Работает только поверх действующей лицензии.
 */
export function withDemoModules(
    licenseModules: readonly string[],
    demoModules: string | undefined,
): { modules: string[]; demo: string[] } {
    const licensed = new Set(licenseModules)
    const demo = Array.from(new Set(
        (demoModules || '').split(',').map((module) => module.trim()).filter(Boolean),
    )).filter((module) => !licensed.has(module))
    return { modules: [...licenseModules, ...demo], demo }
}

/**
 * Названия модулей: идентификатор → слово, которым модуль называется в лицензии,
 * прайсе, админке и интерфейсе оператора.
 *
 * Это единственная такая таблица — панель вендора (`lib/licenses/resources.ts`)
 * берёт словарь отсюда, чтобы лицензия, счёт и выдача доступов не расходились в
 * названиях. Детекции пайплайна остановок перечислены ниже только потому, что
 * лицензии, выпущенные до перехода на модули, называют их напрямую; модулями они
 * не являются и в каталог выдачи не попадают.
 */
export const MODULE_LABELS: Record<string, string> = {
    stops: 'Остановочные павильоны',
    roads: 'Состояние дорог',
    shore: 'Безопасный берег',
    transport: 'Общественный транспорт',
    parks: 'Безопасный парк',
    asr: 'Мониторинг ТКО',
    smoking: 'Курение',
    lying_person: 'Лежащий человек',
    bin_fullness: 'Наполнение урн',
    dogs_without_people: 'Собаки без сопровождающих',
    abandoned_object: 'Оставленные предметы',
    busyness: 'Загруженность остановок',
    stage2_verification: 'Проверка событий',
}

/** Модули, которые продаются лицензией, в порядке прайс-листа от 01.10.2026. */
export const LICENSE_MODULES = ['stops', 'roads', 'shore', 'transport', 'parks', 'asr'] as const

export interface ModuleOption {
    id: string
    name: string
}

/** Каталог выдачи: продаваемые модули в порядке прайса. */
export function moduleCatalog(): ModuleOption[] {
    return LICENSE_MODULES.map((id) => ({ id, name: MODULE_LABELS[id] }))
}

/**
 * Что админ вправе выдать — только модули из лицензии.
 *
 * `licenseModules === null` означает «спросить не удалось», и тогда список не
 * фильтруется — тот же принцип, что в `filterModulesByLicense`: транзиентный сбой
 * не должен отбирать у админа возможность работать. Пустой массив, наоборот,
 * означает определённый отказ (лицензии нет, подпись не сошлась, срок вышел) —
 * выдавать нечего.
 *
 * Отсечка по лицензии есть и на сервере (`/api/admin/users`): интерфейс можно
 * обойти запросом, API — нет.
 */
export function licensedCatalog(licenseModules: readonly string[] | null): ModuleOption[] {
    if (licenseModules === null) return moduleCatalog()
    const granted = new Set(licenseModules)
    return moduleCatalog().filter((module) => granted.has(module.id))
}

/** Название модуля; для незнакомого идентификатора возвращает его как есть. */
export function moduleName(id: string): string {
    return MODULE_LABELS[id] || id
}

/** Перечисление по-русски: «Остановочные павильоны и Состояние дорог». */
export function moduleNames(ids: readonly string[]): string {
    const names = ids.map(moduleName)
    if (names.length <= 1) return names.join('')
    if (names.length === 2) return names.join(' и ')
    return names.slice(0, -1).join(', ') + ' и ' + names[names.length - 1]
}

/**
 * Разбор запрошенных доступов против лицензии.
 *
 *   `allowed`        — можно записать в `profiles.modules`;
 *   `outsideLicense` — модуль платформы, но не куплен: выдать нельзя;
 *   `unknown`        — не модуль вообще (опечатка, детекция пайплайна, мусор).
 *
 * Разделение нужно ради понятного отказа: «не входит в лицензию» — это разговор с
 * заказчиком о допродаже, «неизвестный модуль» — ошибка в запросе.
 */
export function partitionModules(
    requested: readonly string[],
    licenseModules: readonly string[] | null,
): { allowed: string[]; outsideLicense: string[]; unknown: string[] } {
    const catalog = new Set<string>(LICENSE_MODULES)
    const licensed = licenseModules === null ? null : new Set(licenseModules)
    const allowed: string[] = []
    const outsideLicense: string[] = []
    const unknown: string[] = []

    for (const id of Array.from(new Set(requested))) {
        if (!catalog.has(id)) unknown.push(id)
        else if (licensed === null || licensed.has(id)) allowed.push(id)
        else outsideLicense.push(id)
    }

    return { allowed, outsideLicense, unknown }
}
