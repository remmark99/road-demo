"use client"

import { useState, useCallback } from "react"
import { SurgutMap } from "@/components/map/surgut-map"
import { TimelineSlider } from "@/components/map/timeline-slider"
import { useStopHistory } from "@/lib/hooks/use-stop-history"
import { MapReportButton } from "@/components/map/map-report-button"
import { Legend } from "@/components/map/legend"
import { BusStopsStats } from "@/components/map/bus-stops-stats"
import { Navigation } from "@/components/navigation"
import { useModuleAccess } from "@/components/providers/module-context"
import type { MapFocusTarget, RoadStatus, StopEquipmentClass } from "@/lib/types"

export default function MapPage() {
  const { hasModule, loading: modulesLoading } = useModuleAccess()
  const [historyTime, setHistoryTime] = useState<Date | null>(null)
  const { snapshot, loading: historyLoading, error: historyError } = useStopHistory(historyTime, !modulesLoading && hasModule("stops"))
  const [selectedTime, setSelectedTime] = useState<Date>(new Date())
  const [statusOverride, setStatusOverride] = useState<Record<string, RoadStatus>>({})
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null)
  // Выбранная строка разбивки в правой панели («Всего» / «С камерами» / «С датчиками» / «Без оборудования»).
  const [stopClass, setStopClass] = useState<StopEquipmentClass>("all")

  const handleTimeChange = useCallback((time: Date, statuses: Record<string, RoadStatus>, live: boolean) => {
    setSelectedTime(time)
    setHistoryTime(live ? null : time)
    setStatusOverride(statuses)
  }, [])

  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <div className="pt-14 h-screen flex flex-col overflow-hidden">
        <div className="flex-1 flex min-h-0">
          {/* Map area */}
          <div className="flex-1 min-w-0 relative p-2">
            <SurgutMap
              selectedTime={selectedTime}
              historySnapshot={snapshot}
              statusOverride={statusOverride}
              hoveredSegmentId={hoveredSegmentId}
              onHoverSegment={setHoveredSegmentId}
              focusTarget={focusTarget}
              stopClass={stopClass}
            />
            <details className="absolute top-4 right-14 z-20 md:hidden">
              <summary className="cursor-pointer rounded border bg-card px-3 py-2 text-sm shadow">Информация</summary>
              <div className="absolute right-0 mt-2 max-h-[65vh] w-72 overflow-y-auto rounded-lg border bg-background p-3 shadow-lg">
                {hasModule('stops') && <BusStopsStats onFocusStop={setFocusTarget} historySnapshot={snapshot} stopClass={stopClass} onStopClassChange={setStopClass} />}
                <Legend />
                {hasModule('stops') && <MapReportButton />}
              </div>
            </details>
            <div className="absolute bottom-8 left-4 right-4 z-10 max-w-xl">
              {historyTime && (historyError || historyLoading) && <p className="mb-1 rounded border bg-background px-2 py-1 text-xs" role="status">{historyError || 'Загрузка истории…'}</p>}
              <TimelineSlider onTimeChange={handleTimeChange} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="hidden md:block w-72 p-3 border-l border-border overflow-y-auto flex-shrink-0">
            {hasModule('stops') && <BusStopsStats onFocusStop={setFocusTarget} historySnapshot={snapshot} stopClass={stopClass} onStopClassChange={setStopClass} />}
            <Legend />
            {hasModule('stops') && <MapReportButton />}
          </div>
        </div>


      </div>
    </main>
  )
}
