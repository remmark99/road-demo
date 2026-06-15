"use client"

import {
    Bar,
    BarChart,
    CartesianGrid,
    XAxis,
    YAxis,
} from "recharts"
import {
    CalendarClock,
    Hammer,
    Map,
    ShieldAlert,
    Target,
    type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { STOP_EQUIPMENT_PLAN_TARGET } from "@/lib/stop-analytics-config"
import { cn } from "@/lib/utils"

type KpiTone = "normal" | "attention" | "danger"
type DistrictPriority = "Критический" | "Высокий" | "Средний"

interface PlannedDistrictEvent {
    districtName: string
    vandalismEvents: number
    safetyEvents: number
    conditionEvents: number
    priority: DistrictPriority
    nextWindow: string
    focus: string
    action: string
}

const eventForecastConfig = {
    vandalismEvents: { label: "Вандализм", color: "hsl(0, 84%, 60%)" },
    safetyEvents: { label: "Безопасность", color: "hsl(38, 92%, 50%)" },
    conditionEvents: { label: "Состояние", color: "hsl(199, 89%, 48%)" },
} satisfies ChartConfig

const plannedDistrictEvents: PlannedDistrictEvent[] = [
    {
        districtName: "10 микрорайон",
        vandalismEvents: 18,
        safetyEvents: 11,
        conditionEvents: 8,
        priority: "Критический",
        nextWindow: "июль 2026",
        focus: "разбитые стекла, граффити, ночные группы",
        action: "Антивандальный обход, проверка камер после 22:00, заявка на усиление освещения",
    },
    {
        districtName: "24 микрорайон",
        vandalismEvents: 14,
        safetyEvents: 13,
        conditionEvents: 10,
        priority: "Критический",
        nextWindow: "июль 2026",
        focus: "урны, остановочные павильоны, скопления у павильонов",
        action: "Совместный выезд эксплуатации и безопасности с фиксацией повторных точек",
    },
    {
        districtName: "20А микрорайон",
        vandalismEvents: 12,
        safetyEvents: 7,
        conditionEvents: 6,
        priority: "Высокий",
        nextWindow: "август 2026",
        focus: "повреждение конструкций, курение, мусор у павильона",
        action: "Поставить район в еженедельный список осмотра и добавить вечерний контроль",
    },
    {
        districtName: "31 микрорайон",
        vandalismEvents: 9,
        safetyEvents: 8,
        conditionEvents: 5,
        priority: "Высокий",
        nextWindow: "август 2026",
        focus: "конфликты у остановок, оставленные предметы, загрязнение",
        action: "Подготовить сценарии алертов по безопасности и регламент реакции диспетчера",
    },
    {
        districtName: "Старый Сургут",
        vandalismEvents: 7,
        safetyEvents: 5,
        conditionEvents: 4,
        priority: "Средний",
        nextWindow: "сентябрь 2026",
        focus: "точечные повреждения, сезонная нагрузка, туристический поток",
        action: "Добавить район в календарь профилактических осмотров перед пиковыми днями",
    },
    {
        districtName: "Парк За Саймой",
        vandalismEvents: 6,
        safetyEvents: 9,
        conditionEvents: 7,
        priority: "Высокий",
        nextWindow: "сентябрь 2026",
        focus: "вечерняя нагрузка, безопасность пассажиров, состояние урн",
        action: "Согласовать вечерние проверки и отдельную метку риска для остановок у парка",
    },
]

const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

function KpiCard({
    title,
    value,
    caption,
    detail,
    icon: Icon,
    tone = "normal",
}: {
    title: string
    value: string
    caption: string
    detail: string
    icon: LucideIcon
    tone?: KpiTone
}) {
    return (
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="min-w-0 space-y-1">
                    <CardDescription>{title}</CardDescription>
                    <CardTitle
                        className={cn(
                            "font-semibold tabular-nums",
                            value.length > 8 ? "text-2xl leading-tight" : "text-3xl",
                            tone === "attention" && "text-amber-600 dark:text-amber-400",
                            tone === "danger" && "text-red-600 dark:text-red-400",
                        )}
                    >
                        {value}
                    </CardTitle>
                </div>
                <div
                    className={cn(
                        "rounded-md border p-2",
                        tone === "attention" && "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
                        tone === "danger" && "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300",
                        tone === "normal" && "border-primary/20 bg-primary/10 text-primary",
                    )}
                >
                    <Icon className="h-5 w-5" />
                </div>
            </CardHeader>
            <CardContent className="space-y-1">
                <p className="text-sm text-muted-foreground">{caption}</p>
                <p className="text-xs font-medium text-foreground">{detail}</p>
            </CardContent>
        </Card>
    )
}

function getPriorityClass(priority: DistrictPriority) {
    if (priority === "Критический") {
        return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
    }

    if (priority === "Высокий") {
        return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    }

    return "border-primary/30 bg-primary/10 text-primary"
}

export function StopDistrictPlanAnalytics() {
    const districtRows = plannedDistrictEvents
        .map((district) => ({
            ...district,
            totalEvents: district.vandalismEvents + district.safetyEvents + district.conditionEvents,
        }))
        .sort((a, b) => b.totalEvents - a.totalEvents || a.districtName.localeCompare(b.districtName, "ru"))
    const vandalismLeaders = districtRows
        .slice()
        .sort((a, b) => b.vandalismEvents - a.vandalismEvents || a.districtName.localeCompare(b.districtName, "ru"))
    const topVandalismDistrict = vandalismLeaders[0]
    const maxVandalismEvents = topVandalismDistrict?.vandalismEvents ?? 1
    const totalPlannedEvents = districtRows.reduce((sum, district) => sum + district.totalEvents, 0)
    const criticalDistricts = districtRows.filter((district) => district.priority === "Критический").length

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">Районы</h2>
                        <Badge variant="outline" className="gap-1">
                            <CalendarClock className="h-3 w-3" />
                            план событий
                        </Badge>
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Будущие районные события по вандализму, безопасности и состоянию остановок для планирования выездов.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    title="Районов в плане"
                    value={integerFormat.format(districtRows.length)}
                    caption="событийная дорожная карта"
                    detail="районы с будущими сценариями"
                    icon={Map}
                />
                <KpiCard
                    title="Будущих событий"
                    value={integerFormat.format(totalPlannedEvents)}
                    caption="прогноз и план реагирования"
                    detail="вандализм, безопасность, эксплуатация"
                    icon={CalendarClock}
                    tone="attention"
                />
                <KpiCard
                    title="Топ по вандализму"
                    value={topVandalismDistrict?.districtName ?? "Нет данных"}
                    caption="район с максимальным прогнозом"
                    detail={topVandalismDistrict ? `${integerFormat.format(topVandalismDistrict.vandalismEvents)} событий в плане` : "нет плановых событий"}
                    icon={Hammer}
                    tone="danger"
                />
                <KpiCard
                    title="Дооснащение"
                    value={integerFormat.format(STOP_EQUIPMENT_PLAN_TARGET)}
                    caption="остановок планируется дооснастить"
                    detail={`${integerFormat.format(criticalDistricts)} района требуют первоочередного контроля`}
                    icon={Target}
                    tone="attention"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
                <Card className="xl:col-span-7">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldAlert className="h-5 w-5 text-amber-500" />
                            Будущие события по районам
                        </CardTitle>
                        <CardDescription>
                            Плановые сигналы, которые нужно включить в мониторинг и регламенты выезда
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={eventForecastConfig} className="h-[340px] w-full">
                            <BarChart
                                data={districtRows}
                                layout="vertical"
                                margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis
                                    type="number"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    allowDecimals={false}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="districtName"
                                    width={118}
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    interval={0}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="vandalismEvents" stackId="events" fill="var(--color-vandalismEvents)" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="safetyEvents" stackId="events" fill="var(--color-safetyEvents)" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="conditionEvents" stackId="events" fill="var(--color-conditionEvents)" radius={[0, 5, 5, 0]} />
                            </BarChart>
                        </ChartContainer>
                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
                                Вандализм
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                                Безопасность
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />
                                Состояние
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Hammer className="h-5 w-5 text-red-500" />
                            Топ районов по вандализму
                        </CardTitle>
                        <CardDescription>
                            Где в первую очередь планировать антивандальные проверки
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {vandalismLeaders.slice(0, 5).map((district, index) => (
                            <div key={district.districtName} className="rounded-md border p-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Badge variant="outline" className="shrink-0">#{index + 1}</Badge>
                                        <span className="truncate font-medium">{district.districtName}</span>
                                    </div>
                                    <span className="shrink-0 text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                                        {integerFormat.format(district.vandalismEvents)}
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-red-500"
                                        style={{
                                            width: `${Math.max(8, (district.vandalismEvents / maxVandalismEvents) * 100)}%`,
                                        }}
                                    />
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">{district.focus}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">План будущих событий</CardTitle>
                    <CardDescription>
                        Районные сценарии, сроки и действия для диспетчерского и эксплуатационного контуров
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Район</TableHead>
                                <TableHead>Приоритет</TableHead>
                                <TableHead>Период</TableHead>
                                <TableHead>Будущие события</TableHead>
                                <TableHead>Основное действие</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {districtRows.map((district) => (
                                <TableRow key={district.districtName}>
                                    <TableCell className="font-medium">{district.districtName}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={cn("whitespace-nowrap", getPriorityClass(district.priority))}>
                                            {district.priority}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">{district.nextWindow}</TableCell>
                                    <TableCell className="min-w-56 text-sm text-muted-foreground">
                                        Вандализм: {integerFormat.format(district.vandalismEvents)} · безопасность: {integerFormat.format(district.safetyEvents)} · состояние: {integerFormat.format(district.conditionEvents)}
                                    </TableCell>
                                    <TableCell className="min-w-72 text-muted-foreground">{district.action}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
