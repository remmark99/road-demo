import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import {
    createGigaChatCompletion,
    GigaChatConfigError,
    GigaChatConnectionError,
} from "@/lib/gigachat/client"
import { getStopComplexByLocationId } from "@/lib/stop-analytics-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ReportSource = "gigachat" | "template-fallback"

type ReportPeriod = {
    from?: string
    to?: string
}

type ReportMetric = {
    label: string
    value: string
    tone?: "good" | "warning" | "critical" | "neutral"
}

type ReportSection = {
    heading: string
    body: string
    bullets?: string[]
}

type ReportChart = {
    type: "bar"
    title: string
    subtitle?: string
    labels: string[]
    values: number[]
    unit?: string
    tone?: "load" | "peak" | "neutral"
}

type AiReport = {
    ok: true
    source: ReportSource
    title: string
    subtitle: string
    generatedAt: string
    prompt: string
    period: ReportPeriod
    metrics: ReportMetric[]
    charts?: ReportChart[]
    sections: ReportSection[]
    recommendations: string[]
    sourceNote: string
}

type StopLoadWindowRow = {
    location_id: string
    window_start: string
    person_count_avg: number | null
    person_count_max: number | null
    sample_count: number | null
}

const MAX_PROMPT_LENGTH = 1600
const REPORT_MODEL_TIMEOUT_MS = 12_000
const SURGUT_TIME_ZONE = "Asia/Yekaterinburg"
const USER_NUMBER_FORMAT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })
const REPORT_SYSTEM_PROMPT = `Ты помогаешь оформить PDF-отчет платформы городского мониторинга «Вектор Города».
Верни строго JSON без markdown по схеме:
{
  "title": "string",
  "subtitle": "string",
  "metrics": [{"label":"string","value":"string","tone":"good|warning|critical|neutral"}],
  "sections": [{"heading":"string","body":"string","bullets":["string"]}],
  "recommendations": ["string"]
}
Правила:
- Не добавляй новые числа, районы, даты, камеры или live-факты.
- Используй только предоставленный шаблон и запрос пользователя.
- Если запрос не совпадает с шаблоном, адаптируй формулировки, но оставь демо-характер отчета честным.`

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms)
        }),
    ])
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function sanitizePrompt(value: unknown) {
    if (typeof value !== "string") {
        return ""
    }

    return value.replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_LENGTH)
}

function normalizePeriod(value: unknown): ReportPeriod {
    if (!value || typeof value !== "object") {
        return {}
    }

    const candidate = value as { from?: unknown; to?: unknown }
    return {
        from: typeof candidate.from === "string" ? candidate.from.slice(0, 32) : undefined,
        to: typeof candidate.to === "string" ? candidate.to.slice(0, 32) : undefined,
    }
}

function getPeriodLabel(period: ReportPeriod) {
    if (period.from && period.to) {
        return `${period.from} - ${period.to}`
    }

    if (period.from) {
        return `с ${period.from}`
    }

    if (period.to) {
        return `до ${period.to}`
    }

    return "период не задан"
}

function selectTemplate(prompt: string) {
    const normalized = prompt.toLowerCase()

    if (/останов|пассажир|загруж|лежач|курен|собак|урн|павильон/.test(normalized)) {
        return "stops"
    }

    if (/дорог|ям|снег|уборк|подряд|покрыт|реагирован|регламент/.test(normalized)) {
        return "roads"
    }

    return "city"
}

function isWeeklyStopLoadReportPrompt(prompt: string) {
    const normalized = prompt.toLowerCase()
    return (
        /отч[её]т/.test(normalized) &&
        /останов/.test(normalized) &&
        /нагруж|загруж|пассаж|люд/.test(normalized) &&
        /недел|7\s*д/.test(normalized)
    )
}

function getSupabaseDirectClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
        return null
    }

    return createSupabaseClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
}

function toIsoDate(value: Date) {
    return value.toISOString().slice(0, 10)
}

function formatDateRu(value: Date) {
    return value.toLocaleDateString("ru-RU", { timeZone: SURGUT_TIME_ZONE })
}

function formatDateTimeRu(value: string | null | undefined) {
    if (!value) {
        return "нет данных"
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return "нет данных"
    }

    return date.toLocaleString("ru-RU", {
        timeZone: SURGUT_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    })
}

function getReportWeekRange(period: ReportPeriod) {
    const periodTo = period.to ? new Date(`${period.to}T23:59:59+05:00`) : new Date()
    const to = Number.isNaN(periodTo.getTime()) ? new Date() : periodTo
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)

    return { from, to }
}

function getStopName(locationId: string) {
    return getStopComplexByLocationId(locationId)?.stopName || `Остановка ${locationId}`
}

async function buildWeeklyStopLoadReport(prompt: string, period: ReportPeriod): Promise<AiReport> {
    const supabase = getSupabaseDirectClient()
    const generatedAt = new Date().toISOString()
    const { from, to } = getReportWeekRange(period)
    const normalizedPeriod = {
        from: toIsoDate(from),
        to: toIsoDate(to),
    }
    const periodLabel = `${formatDateRu(from)} - ${formatDateRu(to)}`

    if (!supabase) {
        return {
            ...buildTemplateReport(prompt, normalizedPeriod, "template-fallback"),
            title: "Отчёт по нагруженности остановок за неделю",
            subtitle: `Период: ${periodLabel}`,
            sourceNote: "Live-источник не настроен. Сформирован быстрый шаблон без неподтвержденных чисел.",
        }
    }

    let data: StopLoadWindowRow[] | null = null
    let queryError: { message: string } | null = null

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const result = await supabase
            .from("busyness_windows")
            .select("location_id,window_start,person_count_avg,person_count_max,sample_count")
            .gte("window_start", from.toISOString())
            .lte("window_start", to.toISOString())
            .order("window_start", { ascending: false })
            .limit(6000)

        if (!result.error) {
            data = (result.data || []) as StopLoadWindowRow[]
            queryError = null
            break
        }

        queryError = { message: result.error.message }
        if (!/fetch failed|network|timeout/i.test(result.error.message) || attempt === 3) {
            break
        }

        await wait(250 * attempt)
    }

    if (queryError) {
        return {
            ...buildTemplateReport(prompt, normalizedPeriod, "template-fallback"),
            title: "Отчёт по нагруженности остановок за неделю",
            subtitle: `Период: ${periodLabel}`,
            sourceNote: `Live-источник загруженности временно недоступен: ${queryError.message}. Числа не подставлялись.`,
        }
    }

    const rows = data || []
    const grouped = new Map<string, {
        locationId: string
        name: string
        avgSum: number
        avgCount: number
        peak: number
        samples: number
        windows: number
        latest: string
    }>()
    const hourly = new Map<string, { sum: number; count: number }>()

    for (const row of rows) {
        const current = grouped.get(row.location_id) || {
            locationId: row.location_id,
            name: getStopName(row.location_id),
            avgSum: 0,
            avgCount: 0,
            peak: 0,
            samples: 0,
            windows: 0,
            latest: row.window_start,
        }
        const avg = typeof row.person_count_avg === "number" ? row.person_count_avg : null
        const peak = typeof row.person_count_max === "number" ? row.person_count_max : null

        if (avg !== null) {
            current.avgSum += avg
            current.avgCount += 1

            const hourLabel = new Date(row.window_start).toLocaleTimeString("ru-RU", {
                timeZone: SURGUT_TIME_ZONE,
                hour: "2-digit",
                minute: "2-digit",
            }).slice(0, 2)
            const hour = hourly.get(hourLabel) || { sum: 0, count: 0 }
            hour.sum += avg
            hour.count += 1
            hourly.set(hourLabel, hour)
        }
        current.peak = Math.max(current.peak, peak ?? 0)
        current.samples += typeof row.sample_count === "number" ? row.sample_count : 0
        current.windows += 1
        if (row.window_start > current.latest) {
            current.latest = row.window_start
        }
        grouped.set(row.location_id, current)
    }

    const locations = [...grouped.values()]
        .map((row) => ({
            ...row,
            avg: row.avgCount > 0 ? Number((row.avgSum / row.avgCount).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.avg - a.avg || b.peak - a.peak)
    const top = locations.slice(0, 6)
    const leader = top[0]
    const hourlyRows = [...hourly.entries()]
        .map(([hour, value]) => ({
            hour: `${hour}:00`,
            avg: value.count > 0 ? Number((value.sum / value.count).toFixed(1)) : 0,
        }))
        .sort((a, b) => Number(a.hour.slice(0, 2)) - Number(b.hour.slice(0, 2)))
    const peakHour = [...hourlyRows].sort((a, b) => b.avg - a.avg)[0]

    return {
        ok: true,
        source: "template-fallback",
        generatedAt,
        prompt,
        period: normalizedPeriod,
        title: "Отчёт по нагруженности остановок за неделю",
        subtitle: `Live-сводка по пассажирской нагрузке, период: ${periodLabel}`,
        metrics: [
            { label: "Остановок в выборке", value: `${locations.length}`, tone: "neutral" },
            { label: "Окон наблюдения", value: `${rows.length}`, tone: "good" },
            { label: "Лидер нагрузки", value: leader ? leader.name : "нет данных", tone: leader ? "warning" : "neutral" },
            { label: "Средняя у лидера", value: leader ? `${USER_NUMBER_FORMAT.format(leader.avg)} чел.` : "нет данных", tone: leader ? "warning" : "neutral" },
            { label: "Пиковая фиксация", value: leader ? `${leader.peak} чел.` : "нет данных", tone: leader ? "critical" : "neutral" },
            { label: "Пиковый час", value: peakHour ? `${peakHour.hour}, ${USER_NUMBER_FORMAT.format(peakHour.avg)} чел.` : "нет данных", tone: "neutral" },
        ],
        charts: [
            {
                type: "bar",
                title: "Средняя загруженность по остановкам",
                subtitle: "Топ направлений за неделю",
                labels: top.map((row) => row.name),
                values: top.map((row) => row.avg),
                unit: "чел.",
                tone: "load",
            },
            {
                type: "bar",
                title: "Пиковая загруженность по остановкам",
                subtitle: "Максимальная фиксация за неделю",
                labels: top.map((row) => row.name),
                values: top.map((row) => row.peak),
                unit: "чел.",
                tone: "peak",
            },
            {
                type: "bar",
                title: "Профиль нагрузки по часам",
                subtitle: "Среднее значение по всем остановкам",
                labels: hourlyRows.map((row) => row.hour),
                values: hourlyRows.map((row) => row.avg),
                unit: "чел.",
                tone: "neutral",
            },
        ],
        sections: [
            {
                heading: "Краткий вывод",
                body: leader
                    ? `За неделю самая высокая средняя нагрузка наблюдается на направлении «${leader.name}»: ${USER_NUMBER_FORMAT.format(leader.avg)} чел. в среднем и пик ${leader.peak} чел. Последнее окно данных: ${formatDateTimeRu(leader.latest)}.`
                    : "За неделю live-строки загруженности не найдены. Отчёт не подставляет неподтвержденные значения.",
                bullets: top.map((row, index) => `${index + 1}. ${row.name}: средняя ${USER_NUMBER_FORMAT.format(row.avg)} чел., пик ${row.peak} чел., окон ${row.windows}.`),
            },
            {
                heading: "Что важно для управления",
                body: "Нагрузка по остановкам полезна как ранний сигнал для диспетчерского контроля: где растёт очередь, где возможна давка, где нужно сверить расписание, камеры и безопасность.",
                bullets: [
                    "Первые два направления из рейтинга стоит держать в приоритете видеопроверки.",
                    "Пики нагрузки нужно сопоставлять с событиями безопасности и состоянием павильона.",
                    "Если один и тот же лидер повторяется несколько дней, стоит проверить расписание, интервалы и пересадочный поток.",
                ],
            },
        ],
        recommendations: [
            "Использовать рейтинг средней нагрузки для ежедневного диспетчерского списка.",
            "Отдельно проверять остановки с высоким пиком, даже если среднее значение ниже.",
            "Для презентации показывать два графика вместе: средняя нагрузка объясняет устойчивую проблему, пик показывает разовые всплески.",
        ],
        sourceNote: "Отчёт сформирован быстро по live-окнам загруженности остановок. Значения отражают наблюдения камер и не являются подсчётом уникальных пассажиров.",
    }
}

function buildTemplateReport(prompt: string, period: ReportPeriod, source: ReportSource): AiReport {
    const generatedAt = new Date().toISOString()
    const periodLabel = getPeriodLabel(period)
    const template = selectTemplate(prompt)

    const base = {
        ok: true as const,
        source,
        generatedAt,
        prompt,
        period,
        sourceNote: source === "gigachat"
            ? "Отчет оформлен GigaChat на основе демонстрационного шаблона. Live-данные не подставлялись без подтвержденного источника."
            : "GigaChat недоступен или не успел ответить. Сформирован демонстрационный шаблон без неподтвержденных live-фактов.",
    }

    if (template === "stops") {
        return {
            ...base,
            title: "Остановки: загрузка, безопасность, проблемные направления",
            subtitle: `Демо-отчет по запросу пользователя за период: ${periodLabel}`,
            metrics: [
                { label: "Контур наблюдения", value: "30 live-камер", tone: "neutral" },
                { label: "Фокус смены", value: "пики загрузки", tone: "warning" },
                { label: "События риска", value: "безопасность и порядок", tone: "critical" },
            ],
            sections: [
                {
                    heading: "Оперативная картина",
                    body: "Шаблон подсвечивает остановки, где диспетчеру важно сверить текущую загрузку, повторяемость событий безопасности и разницу между live-наблюдениями и плановыми панелями.",
                    bullets: [
                        "Отдельно выделяются направления с устойчивой очередью в часы пик.",
                        "События вроде лежачего человека, курения, собак без людей и оставленных предметов требуют проверки по камере.",
                        "Если live-инструменты недоступны, отчет не подставляет неподтвержденные числа.",
                    ],
                },
                {
                    heading: "Что проверить диспетчеру",
                    body: "Приоритет следует отдавать остановкам с одновременной высокой загрузкой и повторными событиями безопасности.",
                    bullets: [
                        "Сравнить последние окна загруженности с расписанием и погодой.",
                        "Проверить, не совпадают ли события риска с пересадочными узлами.",
                        "Зафиксировать объекты, где нужна выездная проверка павильона или урн.",
                    ],
                },
            ],
            recommendations: [
                "Сформировать короткий список остановок для видеопроверки в ближайшую смену.",
                "Для повторяющихся событий безопасности завести отдельную диспетчерскую задачу.",
                "Проверять выводы отчета по MCP/live-данным перед управленческими решениями.",
            ],
        }
    }

    if (template === "roads") {
        return {
            ...base,
            title: "Дорожное содержание: риски, подрядчики, SLA",
            subtitle: `Демо-отчет по запросу пользователя за период: ${periodLabel}`,
            metrics: [
                { label: "Фокус контроля", value: "регламент реакции", tone: "warning" },
                { label: "Риск сезона", value: "погода и уборка", tone: "critical" },
                { label: "Формат отчета", value: "подрядчики + зоны", tone: "neutral" },
            ],
            sections: [
                {
                    heading: "Зоны внимания",
                    body: "Шаблон группирует дорожные проблемы по типу инцидента, подрядчику и ожидаемому влиянию на норматив реакции.",
                    bullets: [
                        "Отдельно показываются участки, где задержки реакции могут повторяться.",
                        "Погодные факторы рассматриваются как контекст, а не как автоматическое объяснение нарушения.",
                        "Подрядчики сравниваются по управляемым действиям, а не только по количеству обращений.",
                    ],
                },
                {
                    heading: "Управленческий вывод",
                    body: "Главный смысл отчета — быстро отделить операционные задержки от системных рисков маршрутов и подрядных зон.",
                    bullets: [
                        "Проверить подрядные зоны с накоплением просрочек.",
                        "Сверить проблемные участки с погодным окном и графиком уборки.",
                        "Подготовить короткий список SLA-исключений для разбирательства.",
                    ],
                },
            ],
            recommendations: [
                "Попросить подрядчиков подтвердить причины задержек по top-зонам.",
                "Сравнить текущий период с предыдущей неделей перед штрафными выводами.",
                "Отдельно отметить участки, где нужен ручной контроль после осадков.",
            ],
        }
    }

    return {
        ...base,
        title: "Городской executive digest: карта, уведомления, аналитика",
        subtitle: `Демо-отчет по запросу пользователя за период: ${periodLabel}`,
        metrics: [
            { label: "Контур", value: "5 модулей", tone: "neutral" },
            { label: "Главный риск", value: "операционные узкие места", tone: "warning" },
            { label: "Формат", value: "бриф для руководителя", tone: "good" },
        ],
        sections: [
            {
                heading: "Сводка по платформе",
                body: "Шаблон собирает управленческий обзор по карте, уведомлениям и аналитическим панелям без подстановки неподтвержденных live-значений.",
                bullets: [
                    "Карта показывает пространственный контекст объектов и событий.",
                    "Уведомления помогают отделить новые инциденты от накопленной аналитики.",
                    "ИИ-слой формулирует выводы только при наличии подтвержденного источника.",
                ],
            },
            {
                heading: "Как использовать отчет",
                body: "Отчет подходит как короткий бриф перед оперативным совещанием: что требует внимания, где нужны проверки и какие данные стоит запросить дополнительно.",
                bullets: [
                    "Выделить 3-5 тем для оперативной повестки.",
                    "Проверить спорные выводы через профильный модуль.",
                    "Сохранить отчет как артефакт смены или периода.",
                ],
            },
        ],
        recommendations: [
            "Для фактических решений повторить запрос с конкретным модулем и периодом.",
            "Добавить в prompt нужные районы, типы событий и формат выводов.",
            "Использовать fallback-отчет как черновик, а не как подтвержденную статистику.",
        ],
    }
}

function extractJsonObject(text: string) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    const candidate = fenced || text
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")

    if (start < 0 || end <= start) {
        throw new Error("Report response does not contain JSON.")
    }

    return JSON.parse(candidate.slice(start, end + 1)) as Partial<AiReport>
}

function toStringArray(value: unknown, fallback: string[]) {
    if (!Array.isArray(value)) {
        return fallback
    }

    const result = value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 8)

    return result.length > 0 ? result : fallback
}

function normalizeGigaChatReport(value: Partial<AiReport>, fallback: AiReport): AiReport {
    const sections = Array.isArray(value.sections)
        ? value.sections
            .map((section) => ({
                heading: typeof section?.heading === "string" ? section.heading.trim() : "",
                body: typeof section?.body === "string" ? section.body.trim() : "",
                bullets: toStringArray(section?.bullets, []),
            }))
            .filter((section) => section.heading && section.body)
            .slice(0, 5)
        : []

    const metrics = Array.isArray(value.metrics)
        ? value.metrics
            .map((metric) => ({
                label: typeof metric?.label === "string" ? metric.label.trim() : "",
                value: typeof metric?.value === "string" ? metric.value.trim() : "",
                tone: metric?.tone,
            }))
            .filter((metric) => metric.label && metric.value)
            .slice(0, 6)
        : []

    return {
        ...fallback,
        source: "gigachat",
        title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : fallback.title,
        subtitle: typeof value.subtitle === "string" && value.subtitle.trim() ? value.subtitle.trim() : fallback.subtitle,
        metrics: metrics.length > 0 ? metrics : fallback.metrics,
        sections: sections.length > 0 ? sections : fallback.sections,
        recommendations: toStringArray(value.recommendations, fallback.recommendations),
        sourceNote: "Отчет оформлен GigaChat на основе демонстрационного шаблона. Live-данные не подставлялись без подтвержденного источника.",
    }
}

function getSafeErrorSummary(error: unknown) {
    if (error instanceof GigaChatConfigError || error instanceof GigaChatConnectionError) {
        return error.message
    }

    if (error instanceof Error && error.message === "AI report GigaChat timeout") {
        return error.message
    }

    return "GigaChat report generation failed"
}

export async function POST(request: Request) {
    let body: unknown

    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ ok: false, error: "Некорректный JSON запроса." }, { status: 400 })
    }

    const payload = body as { prompt?: unknown; period?: unknown }
    const prompt = sanitizePrompt(payload.prompt)
    const period = normalizePeriod(payload.period)

    if (!prompt) {
        return NextResponse.json({ ok: false, error: "Введите запрос для отчета." }, { status: 400 })
    }

    if (isWeeklyStopLoadReportPrompt(prompt)) {
        try {
            return NextResponse.json(await buildWeeklyStopLoadReport(prompt, period))
        } catch (error) {
            console.warn("Weekly stop load report fallback used.", getSafeErrorSummary(error))
            return NextResponse.json(buildTemplateReport(prompt, period, "template-fallback"))
        }
    }

    const fallbackReport = buildTemplateReport(prompt, period, "template-fallback")
    const baseTemplate = buildTemplateReport(prompt, period, "gigachat")

    try {
        const completion = await withTimeout(
            createGigaChatCompletion({
                temperature: 0.2,
                max_tokens: 1400,
                messages: [
                    { role: "system", content: REPORT_SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: JSON.stringify({
                            userPrompt: prompt,
                            period,
                            template: {
                                title: baseTemplate.title,
                                subtitle: baseTemplate.subtitle,
                                metrics: baseTemplate.metrics,
                                sections: baseTemplate.sections,
                                recommendations: baseTemplate.recommendations,
                            },
                        }),
                    },
                ],
            }),
            REPORT_MODEL_TIMEOUT_MS,
            "AI report GigaChat timeout",
        )
        const content = completion.choices?.[0]?.message?.content || ""
        const parsed = extractJsonObject(content)
        return NextResponse.json(normalizeGigaChatReport(parsed, baseTemplate))
    } catch (error) {
        console.warn("AI report fallback used.", getSafeErrorSummary(error))
        return NextResponse.json(fallbackReport)
    }
}
