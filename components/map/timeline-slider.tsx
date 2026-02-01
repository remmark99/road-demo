"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Play, Pause, SkipBack, SkipForward, Clock } from "lucide-react"
import { generateStatusHistory } from "@/lib/mock-data"
import type { RoadStatus } from "@/lib/types"

interface TimelineSliderProps {
  onTimeChange: (time: Date, statusOverride: Record<string, RoadStatus>) => void
}

export function TimelineSlider({ onTimeChange }: TimelineSliderProps) {
  const [value, setValue] = useState([100])
  const [isPlaying, setIsPlaying] = useState(false)
  
  const history = useMemo(() => generateStatusHistory(24), [])
  
  const nowRef = useRef(new Date())
  const now = nowRef.current
  const startTime = useMemo(() => new Date(now.getTime() - 24 * 60 * 60 * 1000), [now])

  const currentTime = useMemo(() => {
    const progress = value[0] / 100
    return new Date(startTime.getTime() + progress * 24 * 60 * 60 * 1000)
  }, [value, startTime])

  const getStatusAtTime = useCallback((time: Date): Record<string, RoadStatus> => {
    const result: Record<string, RoadStatus> = {}
    
    const segments = ["seg-1", "seg-2"]
    for (const segmentId of segments) {
      const segmentHistory = history
        .filter(h => h.segmentId === segmentId && h.timestamp <= time)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      
      result[segmentId] = segmentHistory[0]?.status ?? "unknown"
    }
    
    return result
  }, [history])

  const handleSliderChange = useCallback((newValue: number[]) => {
    setValue(newValue)
    const time = new Date(startTime.getTime() + (newValue[0] / 100) * 24 * 60 * 60 * 1000)
    onTimeChange(time, getStatusAtTime(time))
  }, [startTime, onTimeChange, getStatusAtTime])

  const skipBackward = () => {
    const newValue = Math.max(0, value[0] - 5)
    handleSliderChange([newValue])
  }

  const skipForward = () => {
    const newValue = Math.min(100, value[0] + 5)
    handleSliderChange([newValue])
  }

  const togglePlay = () => {
    setIsPlaying(!isPlaying)
  }

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying) return
    
    const interval = setInterval(() => {
      setValue(prev => {
        const newValue = Math.min(100, prev[0] + 0.5)
        if (newValue >= 100) {
          setIsPlaying(false)
          return [100]
        }
        return [newValue]
      })
    }, 100)

    return () => clearInterval(interval)
  }, [isPlaying])

  // Sync time change when value changes from auto-play
  useEffect(() => {
    if (isPlaying) {
      const time = new Date(startTime.getTime() + (value[0] / 100) * 24 * 60 * 60 * 1000)
      onTimeChange(time, getStatusAtTime(time))
    }
  }, [value, isPlaying, startTime, onTimeChange, getStatusAtTime])

  const formatTime = (date: Date) => {
    return date.toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const isLive = value[0] >= 99

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={skipBackward}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={togglePlay}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={skipForward}>
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex-1">
          <Slider
            value={value}
            onValueChange={handleSliderChange}
            max={100}
            step={0.1}
            className="cursor-pointer"
          />
        </div>
        
        <div className="flex items-center gap-2 min-w-[180px] justify-end">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-mono">
            {isLive ? (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-road-clean animate-pulse" />
                Сейчас
              </span>
            ) : (
              formatTime(currentTime)
            )}
          </span>
        </div>
      </div>
      
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatTime(startTime)}</span>
        <span>{formatTime(now)}</span>
      </div>
    </div>
  )
}
