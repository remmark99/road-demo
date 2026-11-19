"use client"
// Новая аналитика остановок во вкладке «Аналитика»: те же разделы, что в прототипе,
// но на живых данных из базы (lib/stop-analytics-vision/live-data.ts).
import { Component, useEffect, useState, type ComponentType, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { VisionProvider, readVisionInitial, type VisionInitial, type VisionView } from "@/components/dashboard/stops-v2/kit"
import { StopCardDialog } from "@/components/dashboard/stops-v2/stop-card"
import { ensureLiveVisionData } from "@/lib/stop-analytics-vision/live-data"

const loading = () => <Skeleton className="h-64 w-full" />
const SECTIONS: Record<VisionView, ComponentType> = {
    overview: dynamic(() => import("./overview").then((m) => m.StopsOverview), { loading }),
    safety: dynamic(() => import("./safety").then((m) => m.StopsSafety), { loading }),
    clean: dynamic(() => import("./cleanliness").then((m) => m.StopsCleanliness), { loading }),
    equipment: dynamic(() => import("./equipment").then((m) => m.StopsEquipment), { loading }),
    sensors: dynamic(() => import("./sensors").then((m) => m.StopsSensors), { loading }),
    load: dynamic(() => import("./load").then((m) => m.StopsLoad), { loading }),
    districts: dynamic(() => import("./districts").then((m) => m.StopsDistricts), { loading }),
}

/** Сбой одного раздела не должен ронять всю вкладку «Аналитика». */
class SectionBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() {
        return { failed: true }
    }
    componentDidCatch(error: unknown) {
        console.error("Раздел аналитики остановок упал:", error)
    }
    componentDidUpdate(previous: { resetKey: string }) {
        if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
    }
    render() {
        return this.state.failed
            ? <div className="p-8 text-sm text-muted-foreground">Раздел не смог показать данные. Откройте другой раздел или обновите страницу.</div>
            : this.props.children
    }
}

export function LiveStopsVision({ view, onViewChange, viewToUrl }: {
    view: VisionView
    onViewChange: (view: VisionView) => void
    /** Как раздел записывается в ?view= адреса страницы. */
    viewToUrl: (view: VisionView) => string
}) {
    const searchParams = useSearchParams()
    const [state, setState] = useState<"loading" | "ready" | "error">("loading")
    const [attempt, setAttempt] = useState(0)
    const [initial, setInitial] = useState<VisionInitial | null>(null)

    useEffect(() => {
        let cancelled = false
        setState("loading")
        ensureLiveVisionData().then(() => {
            if (cancelled) return
            setInitial(readVisionInitial(searchParams))
            setState("ready")
        }).catch(() => { if (!cancelled) setState("error") })
        return () => { cancelled = true }
        // Адрес читаем один раз при загрузке данных.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt])

    if (state === "loading" || !initial) {
        return state === "error" ? (
            <div className="p-8 text-sm text-muted-foreground space-y-3">
                <p>Не удалось загрузить данные аналитики.</p>
                <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>Повторить</Button>
            </div>
        ) : (
            <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загружаю данные остановок за два месяца…
            </div>
        )
    }

    const Active = SECTIONS[view]
    return (
        <VisionProvider view={view} onViewChange={onViewChange} initial={initial} viewToUrl={viewToUrl}>
            <SectionBoundary resetKey={view}>
                <Active />
                <StopCardDialog />
            </SectionBoundary>
        </VisionProvider>
    )
}
