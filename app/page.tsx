"use client"

import { useState } from "react"
import { SurgutMap } from "@/components/map/surgut-map"
import { TimelineSlider } from "@/components/map/timeline-slider"
import { Legend } from "@/components/map/legend"
import { Navigation } from "@/components/navigation"
import type { RoadStatus } from "@/lib/types"

export default function MapPage() {
  const [selectedTime, setSelectedTime] = useState<Date>(new Date())
  const [statusOverride, setStatusOverride] = useState<Record<string, RoadStatus>>({})

  const handleTimeChange = (time: Date, statuses: Record<string, RoadStatus>) => {
    setSelectedTime(time)
    setStatusOverride(statuses)
  }

  return (
    <main className="min-h-screen bg-background">
      <Navigation />
      
      <div className="pt-14 h-screen flex flex-col">
        <div className="flex-1 flex">
          {/* Map area */}
          <div className="flex-1 relative p-4">
            <SurgutMap 
              selectedTime={selectedTime} 
              statusOverride={statusOverride}
            />
          </div>
          
          {/* Sidebar */}
          <div className="w-72 p-4 border-l border-border overflow-y-auto">
            <Legend statusOverride={statusOverride} />
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
