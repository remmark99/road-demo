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
          <div className="flex-1 relative p-4">
            <SurgutMap
              selectedTime={selectedTime}
              historySnapshot={snapshot}
              statusOverride={statusOverride}
              hoveredSegmentId={hoveredSegmentId}
              onHoverSegment={setHoveredSegmentId}
              focusTarget={focusTarget}
              stopClass={stopClass}
            />
          </div>

          {/* Sidebar */}
          <div className="w-80 p-4 border-l border-border overflow-y-auto flex-shrink-0">
            {hasModule('stops') && <BusStopsStats onFocusStop={setFocusTarget} historySnapshot={snapshot} stopClass={stopClass} onStopClassChange={setStopClass} />}
            <Legend />
            {hasModule('stops') && <MapReportButton />}
          </div>
        </div>

        {/* Timeline */}
        <div className="p-4 pr-20 border-t border-border">
          {historyTime && hasModule('stops') && <p className="mb-2 text-xs text-muted-foreground" role="status">
            {historyError || (historyLoading ? 'Загрузка истории связи…' : 'История связи остановок. Фиолетовым — нет данных на выбранное время. Состав объектов на карте — текущий.')}
          </p>}
          <TimelineSlider onTimeChange={handleTimeChange} />
        </div>
      </div>
    </main>
  )
}
