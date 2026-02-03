"use client"

import * as React from "react"
import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Play, Pause, SkipBack, SkipForward, Clock, CalendarIcon } from "lucide-react"
import { generateStatusHistory, roadSegments } from "@/lib/mock-data"
import type { RoadStatus } from "@/lib/types"
import { format, addDays, differenceInHours } from "date-fns"
import { ru } from "date-fns/locale"
import { type DateRange } from "react-day-picker"

interface TimelineSliderProps {
  onTimeChange: (time: Date, statusOverride: Record<string, RoadStatus>) => void
}

export function TimelineSlider({ onTimeChange }: TimelineSliderProps) {
  const [value, setValue] = useState([100])
  const [isPlaying, setIsPlaying] = useState(false)

  const nowRef = useRef(new Date())
  const now = nowRef.current

  // Date range state - defaults to last 24 hours
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    to: now,
  })

  // Calculate hours for history generation based on date range
  const hoursRange = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return 24
    return Math.max(1, differenceInHours(dateRange.to, dateRange.from))
  }, [dateRange])

  const history = useMemo(() => generateStatusHistory(hoursRange), [hoursRange])

  const startTime = useMemo(() => dateRange?.from ?? new Date(now.getTime() - 24 * 60 * 60 * 1000), [dateRange, now])
  const endTime = useMemo(() => dateRange?.to ?? now, [dateRange, now])

  // Calculate the range duration in milliseconds
  const rangeDuration = useMemo(() => {
    return endTime.getTime() - startTime.getTime()
  }, [startTime, endTime])

  const currentTime = useMemo(() => {
    const progress = value[0] / 100
    return new Date(startTime.getTime() + progress * rangeDuration)
  }, [value, startTime, rangeDuration])

  const getStatusAtTime = useCallback((time: Date): Record<string, RoadStatus> => {
    const result: Record<string, RoadStatus> = {}

    for (const segment of roadSegments) {
      const segmentHistory = history
        .filter(h => h.segmentId === segment.id && h.timestamp <= time)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      result[segment.id] = segmentHistory[0]?.status ?? segment.currentStatus
    }

    return result
  }, [history])

  const handleSliderChange = useCallback((newValue: number[]) => {
    setValue(newValue)
    const time = new Date(startTime.getTime() + (newValue[0] / 100) * rangeDuration)
    onTimeChange(time, getStatusAtTime(time))
  }, [startTime, rangeDuration, onTimeChange, getStatusAtTime])

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
      const time = new Date(startTime.getTime() + (value[0] / 100) * rangeDuration)
      onTimeChange(time, getStatusAtTime(time))
    }
  }, [value, isPlaying, startTime, rangeDuration, onTimeChange, getStatusAtTime])

  const formatTime = (date: Date) => {
    return date.toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  // Check if viewing "live" (near the end of the range and end is near current time)
  const isLive = value[0] >= 99 && (now.getTime() - endTime.getTime()) < 60000

  // Handle date range change - reset slider to end
  const handleDateRangeSelect = (range: DateRange | undefined) => {
    setDateRange(range)
    setValue([100]) // Reset to end of range
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-4 mb-4">
        {/* Date Range Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="justify-start text-left font-normal min-w-[250px]"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "dd MMM", { locale: ru })} —{" "}
                    {format(dateRange.to, "dd MMM yyyy", { locale: ru })}
                  </>
                ) : (
                  format(dateRange.from, "dd MMM yyyy", { locale: ru })
                )
              ) : (
                <span>Выберите период</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={handleDateRangeSelect}
              numberOfMonths={2}
              locale={ru}
            />
          </PopoverContent>
        </Popover>

        {/* Playback Controls */}
        <div className="flex items-center gap-1">
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

        {/* Slider */}
        <div className="flex-1">
          <Slider
            value={value}
            onValueChange={handleSliderChange}
            max={100}
            step={0.1}
            className="cursor-pointer"
          />
        </div>

        {/* Current Time Display */}
        <div className="flex items-center gap-2 min-w-[160px] justify-end">
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
        <span>{formatTime(endTime)}</span>
      </div>
    </div>
  )
}
