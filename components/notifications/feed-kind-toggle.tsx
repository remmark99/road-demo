"use client"

import { Button } from "@/components/ui/button"
import { FEED_KIND_OPTIONS, type FeedKind } from "@/lib/notifications/feed-kind"

export function FeedKindToggle({ value, onChange }: { value: FeedKind; onChange: (value: FeedKind) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label="Что показывать">
      {FEED_KIND_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          className="h-8 px-3"
          role="radio"
          aria-checked={value === option.value}
          title={option.hint}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
