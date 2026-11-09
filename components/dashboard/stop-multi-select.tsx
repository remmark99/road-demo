"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import { MapPin, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type StopOptionId = string | number

export interface StopOption<T extends StopOptionId> {
    id: T
    label: string
    detail?: string | null
}

interface StopMultiSelectProps<T extends StopOptionId> {
    options: readonly StopOption<T>[]
    /** Selected ids. Every id selected means "all stops". */
    selected: readonly T[]
    onChange: (next: T[]) => void
    icon?: ReactNode
    disabled?: boolean
    className?: string
}

function normalize(text: string) {
    return text.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/g, " ").trim()
}

/**
 * Stop filter for the analytics screens. Built for a city's worth of stops:
 * the list scrolls inside a popover capped to the space left on screen,
 * a search box narrows it by name and direction, and a row's «только»
 * button selects that stop alone.
 */
export function StopMultiSelect<T extends StopOptionId>({
    options,
    selected,
    onChange,
    icon,
    disabled,
    className,
}: StopMultiSelectProps<T>) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    const searchRef = useRef<HTMLInputElement>(null)

    const selectedSet = useMemo(() => new Set<T>(selected), [selected])
    const total = options.length
    const selectedCount = options.reduce((count, option) => count + (selectedSet.has(option.id) ? 1 : 0), 0)
    const allSelected = total > 0 && selectedCount === total

    const searchable = useMemo(
        () => options.map((option) => ({ option, haystack: normalize(`${option.label} ${option.detail ?? ""}`) })),
        [options]
    )
    const needle = normalize(query)
    const visible = needle
        ? searchable.filter((entry) => needle.split(" ").every((word) => entry.haystack.includes(word))).map((entry) => entry.option)
        : options
    const visibleSelected = visible.filter((option) => selectedSet.has(option.id)).length
    const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length

    const commit = (next: Set<T>) => {
        // Keep the options' order so callers get a stable array.
        onChange(options.filter((option) => next.has(option.id)).map((option) => option.id))
    }

    const toggle = (id: T) => {
        const next = new Set(selectedSet)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        commit(next)
    }

    const only = (id: T) => commit(new Set([id]))

    const setVisible = (checked: boolean) => {
        const next = new Set(selectedSet)
        for (const option of visible) {
            if (checked) next.add(option.id)
            else next.delete(option.id)
        }
        commit(next)
    }

    const singleLabel = selectedCount === 1 ? options.find((option) => selectedSet.has(option.id))?.label : null
    const triggerLabel = total === 0
        ? "Нет остановок"
        : allSelected
            ? "Все остановки"
            : selectedCount === 0
                ? "Не выбрано"
                : singleLabel ?? `${selectedCount} из ${total}`

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next)
                if (!next) setQuery("")
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn("max-w-[16rem] gap-2", className)}
                    disabled={disabled || total === 0}
                    title={singleLabel ?? undefined}
                >
                    {icon ?? <MapPin className="h-4 w-4" />}
                    <span className="truncate">{triggerLabel}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                collisionPadding={12}
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    searchRef.current?.focus()
                }}
                className="flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0 max-h-[min(30rem,var(--radix-popover-content-available-height))]"
            >
                <div className="border-b p-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Escape" && query) {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setQuery("")
                                }
                            }}
                            placeholder="Поиск остановки или направления"
                            aria-label="Поиск остановки"
                            className="h-9 w-full rounded-md border bg-transparent pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => {
                                    setQuery("")
                                    searchRef.current?.focus()
                                }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Очистить поиск"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm font-medium">
                        <Checkbox
                            checked={allVisibleSelected}
                            disabled={visible.length === 0}
                            onCheckedChange={() => setVisible(!allVisibleSelected)}
                        />
                        {needle ? `Найденные (${visible.length})` : "Все остановки"}
                    </label>
                    {selectedCount > 0 && !needle && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => commit(new Set())}>
                            Сбросить
                        </Button>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1" role="listbox" aria-multiselectable>
                    {visible.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">Ничего не найдено</div>
                    ) : (
                        visible.map((option) => {
                            const checked = selectedSet.has(option.id)
                            return (
                                <div
                                    key={String(option.id)}
                                    role="option"
                                    aria-selected={checked}
                                    className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/70"
                                >
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                                        <Checkbox className="mt-0.5" checked={checked} onCheckedChange={() => toggle(option.id)} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm leading-5">{option.label}</span>
                                            {option.detail && (
                                                <span className="block truncate text-xs text-muted-foreground">{option.detail}</span>
                                            )}
                                        </span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => only(option.id)}
                                        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                                    >
                                        только
                                    </button>
                                </div>
                            )
                        })
                    )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                        Выбрано {selectedCount} из {total}
                    </span>
                    <Button size="sm" className="h-7 px-3 text-xs" onClick={() => setOpen(false)}>
                        Готово
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}
