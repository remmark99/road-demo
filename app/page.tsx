"use client"

import { useState, useCallback } from "react"
import { SurgutMap } from "@/components/map/surgut-map"
import { TimelineSlider } from "@/components/map/timeline-slider"
import { Legend } from "@/components/map/legend"
import { BusStopsStats } from "@/components/map/bus-stops-stats"
import { Navigation } from "@/components/navigation"
import type { RoadStatus } from "@/lib/types"

export default function MapPage() {
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
            <BusStopsStats />
            <Legend />
          </div>
        </div>

        {/* Timeline */}
        <div className="p-4 border-t border-border">
          <TimelineSlider onTimeChange={handleTimeChange} />
        </div>
      </div>
    </main>
  )
}
