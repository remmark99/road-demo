"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { type DateRange } from "react-day-picker"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { CalendarIcon, Filter } from "lucide-react"

export type TimeRange = "today" | "yesterday" | "week" | "month" | "custom"

export interface TimeRangeResult {
    preset: TimeRange
    customRange?: DateRange
}

const TIME_RANGE_OPTIONS = [
    { value: "today", label: "Сегодня" },
    { value: "yesterday", label: "Вчера" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
]

interface TimeRangeFilterProps {
    value: TimeRangeResult
    onChange: (value: TimeRangeResult) => void
    children?: React.ReactNode
}

export function TimeRangeFilter({ value, onChange, children }: TimeRangeFilterProps) {
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined)

    const handlePresetChange = (preset: string) => {
        setPendingRange(undefined)
        onChange({ preset: preset as TimeRange, customRange: undefined })
    }

    const handleDateRangeSelect = (range: DateRange | undefined) => {
        setPendingRange(range)
    }

    const handleApply = () => {
        if (pendingRange?.from) {
            onChange({
                preset: "custom",
                customRange: {
                    from: pendingRange.from,
                    to: pendingRange.to ?? pendingRange.from,
                },
            })
        }
        setPendingRange(undefined)
        setCalendarOpen(false)
    }

    const handleCalendarOpenChange = (open: boolean) => {
        setCalendarOpen(open)
        if (!open) {
            setPendingRange(undefined)
        }
    }

    const isCustom = value.preset === "custom" && value.customRange?.from

    return (
        <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
                value={isCustom ? "" : value.preset}
                onValueChange={handlePresetChange}
            >
                <SelectTrigger className={`w-[160px] ${isCustom ? "text-muted-foreground" : ""}`}>
                    <SelectValue placeholder="Свой период" />
                </SelectTrigger>
                <SelectContent>
                    {TIME_RANGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Popover open={calendarOpen} onOpenChange={handleCalendarOpenChange}>
                <PopoverTrigger asChild>
                    <Button
                        variant={isCustom ? "default" : "outline"}
                        className={`gap-2 font-normal ${isCustom
                            ? "bg-primary/10 text-primary hover:bg-primary/20 border-primary/30"
                            : ""
                            }`}
                        size="sm"
                    >
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {isCustom && value.customRange?.from ? (
                            value.customRange.to ? (
                                <>
                                    {format(value.customRange.from, "dd.MM", { locale: ru })}
                                    {" — "}
                                    {format(value.customRange.to, "dd.MM", { locale: ru })}
                                </>
                            ) : (
                                format(value.customRange.from, "dd.MM.yyyy", { locale: ru })
                            )
                        ) : (
                            "Период"
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="range"
                        selected={pendingRange ?? value.customRange}
                        onSelect={handleDateRangeSelect}
                        numberOfMonths={2}
                        locale={ru}
                        disabled={(date) => date > new Date()}
                    />
                    <div className="flex items-center justify-between border-t px-4 py-3">
                        <p className="text-xs text-muted-foreground">
                            {pendingRange?.from
                                ? pendingRange.to
                                    ? `${format(pendingRange.from, "dd.MM.yy", { locale: ru })} — ${format(pendingRange.to, "dd.MM.yy", { locale: ru })}`
                                    : `С ${format(pendingRange.from, "dd.MM.yy", { locale: ru })}`
                                : "Выберите даты"}
                        </p>
                        <Button
                            size="sm"
                            disabled={!pendingRange?.from}
                            onClick={handleApply}
                        >
                            Применить
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>

            {children}
        </div>
    )
}

// --- Utility: filter date-string data by TimeRangeResult ---

function localDateStr(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export function filterByTimeRangeResult<T extends { date: string }>(
    data: T[],
    result: TimeRangeResult
): T[] {
    if (result.preset === "custom" && result.customRange?.from) {
        const fromStr = localDateStr(result.customRange.from)
        const toStr = result.customRange.to
            ? localDateStr(result.customRange.to)
            : fromStr
        return data.filter(d => d.date >= fromStr && d.date <= toStr)
    }

    const now = new Date()
    const todayStr = localDateStr(now)
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayStr = localDateStr(yesterday)

    switch (result.preset) {
        case "today":
            return data.filter(d => d.date === todayStr)
        case "yesterday":
            return data.filter(d => d.date === yesterdayStr)
        case "week": {
            const weekAgo = new Date(now)
            weekAgo.setDate(now.getDate() - 7)
            const weekAgoStr = localDateStr(weekAgo)
            return data.filter(d => d.date >= weekAgoStr)
        }
        case "month":
            return data
        default:
            return data
    }
}

// --- Utility: filter day-number data by TimeRangeResult ---

export function filterByDayResult<T extends { day: number }>(
    data: T[],
    result: TimeRangeResult
): T[] {
    if (result.preset === "custom" && result.customRange?.from) {
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const from = new Date(result.customRange.from)
        from.setHours(0, 0, 0, 0)
        const to = result.customRange.to
            ? new Date(result.customRange.to)
            : new Date(result.customRange.from)
        to.setHours(0, 0, 0, 0)

        // day 0 = today, day 1 = yesterday, etc.
        const dayFrom = Math.round((now.getTime() - to.getTime()) / (1000 * 60 * 60 * 24))
        const dayTo = Math.round((now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))

        return data.filter(d => d.day >= Math.max(0, dayFrom) && d.day <= dayTo)
    }

    switch (result.preset) {
        case "today":
            return data.filter(d => d.day === 0)
        case "yesterday":
            return data.filter(d => d.day === 1)
        case "week":
            return data.filter(d => d.day < 7)
        case "month":
            return data
        default:
            return data
    }
}
