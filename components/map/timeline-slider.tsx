"use client"

import * as React from "react"
import { useState, useMemo, useEffect } from "react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Play, Pause, SkipBack, SkipForward, Clock, CalendarIcon } from "lucide-react"


import type { RoadStatus } from "@/lib/types"

import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { type DateRange } from "react-day-picker"

interface TimelineSliderProps {
  onTimeChange: (time: Date, statusOverride: Record<string, RoadStatus>, live: boolean) => void
}

export function TimelineSlider({ onTimeChange }: TimelineSliderProps) {
  const [value, setValue] = useState([100])
  const [isPlaying, setIsPlaying] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  // A rolling week by default. Calendar selections include the entire last day.
  const startTime = useMemo(() => (dateRange?.from ? new Date(`${format(dateRange.from, "yyyy-MM-dd")}T00:00:00+05:00`) : undefined) ?? new Date(now.getTime() - 7 * 86400_000), [dateRange, now])
  const endTime = useMemo(() => dateRange?.to
    ? new Date(Math.min((Date.parse(`${format(dateRange.to, "yyyy-MM-dd")}T00:00:00+05:00`) + 86400_000) - 1, now.getTime()))
    : now, [dateRange, now])
  const rangeDuration = Math.max(0, endTime.getTime() - startTime.getTime())
  const currentTime = useMemo(() => new Date(startTime.getTime() + value[0] / 100 * rangeDuration), [startTime, value, rangeDuration])
  const isLive = value[0] === 100 && endTime.getTime() === now.getTime()
  useEffect(() => { onTimeChange(currentTime, {}, isLive) }, [currentTime, isLive, onTimeChange])
  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => setValue(prev => [Math.min(100, prev[0] + 0.5)]), 500)
    return () => clearInterval(timer)
  }, [isPlaying])
  useEffect(() => { if (value[0] === 100) setIsPlaying(false) }, [value])
  const handleSliderChange = (next: number[]) => { setIsPlaying(false); setValue(next) }
  const skipBackward = () => handleSliderChange([Math.max(0, value[0] - 5)])
  const skipForward = () => handleSliderChange([Math.min(100, value[0] + 5)])
  const togglePlay = () => { if (value[0] === 100) setValue([0]); setIsPlaying(v => !v) }
  const handleDateRangeSelect = (range: DateRange | undefined) => { setDateRange(range); setValue([100]); setIsPlaying(false) }
  const formatTime = (date: Date) => date.toLocaleString("ru-RU", {
    timeZone: "Asia/Yekaterinburg", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })

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
                <span>Последние 7 дней</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              disabled={{ after: now }}
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
            aria-label="История связи остановок"
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
        <span>{formatTime(startTime)} · местное время (UTC+5)</span>
        <span>{formatTime(endTime)}</span>
      </div>
    </div>
  )
}
