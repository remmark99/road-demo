"use client"

// Оболочка прототипа: та же раскладка, что у страницы «Аналитика», но в меню только
// новые разделы остановок. Данные условные, вход на сайт не нужен.

import { Suspense, useState, type ComponentType } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { BarChart3, Building2, Cctv, ChevronRight, FlaskConical, LayoutDashboard, ShieldAlert, Thermometer, Trash2, Users2, type LucideIcon } from "lucide-react"

import { Navigation } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { VisionProvider, type VisionInitial, type VisionView } from "@/components/dashboard/stops-v2/kit"
import { V_DISTRICTS, stopById } from "@/lib/mock/stop-analytics-vision-data"
import { StopCardDialog } from "@/components/dashboard/stops-v2/stop-card"

const loading = () => <Skeleton className="h-64 w-full" />
const StopsOverview = dynamic(() => import("@/components/dashboard/stops-v2/overview").then((m) => m.StopsOverview), { loading })
const StopsSafety = dynamic(() => import("@/components/dashboard/stops-v2/safety").then((m) => m.StopsSafety), { loading })
const StopsCleanliness = dynamic(() => import("@/components/dashboard/stops-v2/cleanliness").then((m) => m.StopsCleanliness), { loading })
const StopsEquipment = dynamic(() => import("@/components/dashboard/stops-v2/equipment").then((m) => m.StopsEquipment), { loading })
const StopsSensors = dynamic(() => import("@/components/dashboard/stops-v2/sensors").then((m) => m.StopsSensors), { loading })
const StopsLoad = dynamic(() => import("@/components/dashboard/stops-v2/load").then((m) => m.StopsLoad), { loading })
const StopsDistricts = dynamic(() => import("@/components/dashboard/stops-v2/districts").then((m) => m.StopsDistricts), { loading })

const SECTIONS: { id: VisionView; label: string; icon: LucideIcon; component: ComponentType }[] = [
    { id: "overview", label: "Сводка", icon: LayoutDashboard, component: StopsOverview },
    { id: "safety", label: "События безопасности", icon: ShieldAlert, component: StopsSafety },
    { id: "clean", label: "Чистота", icon: Trash2, component: StopsCleanliness },
    { id: "equipment", label: "Оборудование", icon: Cctv, component: StopsEquipment },
    { id: "sensors", label: "Датчики", icon: Thermometer, component: StopsSensors },
    { id: "load", label: "Загруженность", icon: Users2, component: StopsLoad },
    { id: "districts", label: "Микрорайоны", icon: Building2, component: StopsDistricts },
]

function PreviewContent() {
    const searchParams = useSearchParams()
    const [view, setView] = useState<VisionView>(() => {
        const requested = searchParams.get("view") as VisionView | null
        return SECTIONS.some((section) => section.id === requested) ? (requested as VisionView) : "overview"
    })
    const [expanded, setExpanded] = useState(true)

    // Начальное состояние берётся из адреса: раздел, период, район, остановка.
    const [initial] = useState<VisionInitial>(() => {
        const period = searchParams.get("period")
        const district = searchParams.get("district")
        const stopFilter = Number(searchParams.get("s"))
        const card = Number(searchParams.get("stop"))
        return {
            period: period === "today" || period === "yesterday" || period === "month" ? period : "week",
            districtId: V_DISTRICTS.some((item) => item.id === district) ? district : null,
            stopId: stopById(stopFilter) ? stopFilter : null,
            cardStopId: stopById(card) ? card : null,
        }
    })

    const Active = SECTIONS.find((section) => section.id === view)?.component ?? StopsOverview

    return (
        <VisionProvider view={view} onViewChange={setView} initial={initial}>
            <main className="h-screen w-full bg-background flex flex-col">
                <Navigation />

                <div className="flex-1 pt-14 overflow-hidden">
                    <div className="h-full w-full px-4 md:px-8 py-6 flex flex-col">
                        <div className="mb-4 flex-none">
                            <h1 className="text-2xl font-semibold flex items-center gap-2">
                                <BarChart3 className="h-6 w-6 text-primary" />
                                Аналитика
                            </h1>
                            <p className="text-muted-foreground mt-1">
                                Статистика и мониторинг подключенных модулей
                            </p>
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6">
                            <div className="w-full md:w-64 flex-shrink-0 flex md:flex-col gap-0 pb-2 md:pb-0 min-h-0">
                                <ScrollArea className="flex-1 min-h-0">
                                    <div className="flex md:flex-col gap-6 pr-3 pb-4">
                                        <div className="space-y-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="h-auto w-full justify-start gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                                onClick={() => setExpanded((value) => !value)}
                                                aria-expanded={expanded}
                                                aria-controls="vision-section-stops"
                                            >
                                                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90 text-primary")} />
                                                <span>Остановки</span>
                                            </Button>
                                            {expanded && (
                                                <div id="vision-section-stops" className="flex flex-col gap-1">
                                                    {SECTIONS.map((section) => {
                                                        const Icon = section.icon
                                                        const isActive = section.id === view
                                                        return (
                                                            <Button
                                                                key={section.id}
                                                                variant={isActive ? "default" : "ghost"}
                                                                className={cn(
                                                                    "justify-start gap-3 h-auto min-h-11 py-2.5 w-full whitespace-normal text-left",
                                                                    isActive && "bg-primary text-primary-foreground hover:bg-primary/90",
                                                                )}
                                                                onClick={() => setView(section.id)}
                                                            >
                                                                <Icon className="h-4 w-4" />
                                                                <span>{section.label}</span>
                                                            </Button>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>

                                <div className="hidden md:block mt-4 pt-4 border-t border-border flex-shrink-0">
                                    <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06]">
                                        <div className="flex items-center gap-2 mb-2">
                                            <FlaskConical className="h-5 w-5 text-amber-500" />
                                            <span className="text-sm font-semibold text-foreground">Прототип</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Новый вид аналитики остановок. Цифры условные и нужны только для оценки внешнего вида.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 rounded-lg border overflow-hidden bg-background shadow-sm relative flex flex-col">
                                <div className="relative min-h-0 flex-1">
                                    <div className="w-full h-full absolute inset-0 overflow-auto">
                                        <Active />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <StopCardDialog />
        </VisionProvider>
    )
}

export function StopsVisionPreview() {
    return (
        <Suspense fallback={<main className="min-h-screen bg-background" />}>
            <PreviewContent />
        </Suspense>
    )
}
