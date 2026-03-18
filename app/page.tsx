"use client"

import { useState, useCallback } from "react"
import { SurgutMap } from "@/components/map/surgut-map"
import { TimelineSlider } from "@/components/map/timeline-slider"
import { Legend } from "@/components/map/legend"
import { BusStopsStats } from "@/components/map/bus-stops-stats"
import { Navigation } from "@/components/navigation"
import { useModuleAccess } from "@/components/providers/module-context"
import { Skeleton } from "@/components/ui/skeleton"
import type { RoadStatus } from "@/lib/types"

export default function MapPage() {
  const { hasModule, loading: modulesLoading } = useModuleAccess()
  const [selectedTime, setSelectedTime] = useState<Date>(new Date())
  const [statusOverride, setStatusOverride] = useState<Record<string, RoadStatus>>({})
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null)

  const handleTimeChange = useCallback((time: Date, statuses: Record<string, RoadStatus>) => {
    setSelectedTime(time)
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
              statusOverride={statusOverride}
              hoveredSegmentId={hoveredSegmentId}
              onHoverSegment={setHoveredSegmentId}
            />
          </div>

          {/* Sidebar */}
          <div className="w-80 p-4 border-l border-border overflow-y-auto flex-shrink-0">
            {hasModule('stops') && <BusStopsStats />}
            <Legend />
          </div>
        </div>

        {/* Timeline */}
        {modulesLoading ? (
          <div className="p-4 border-t border-border">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-4 mb-4">
                <Skeleton className="h-9 w-[250px]" />
                <div className="flex items-center gap-1">
                  <Skeleton className="h-9 w-9 rounded-md" />
                  <Skeleton className="h-9 w-9 rounded-md" />
                  <Skeleton className="h-9 w-9 rounded-md" />
                </div>
                <div className="flex-1">
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
                <Skeleton className="h-4 w-[160px]" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </div>
        ) : hasModule('roads') && (
          <div className="p-4 border-t border-border">
            <TimelineSlider onTimeChange={handleTimeChange} />
          </div>
        )}
      </div>
    </main>
  )
}
