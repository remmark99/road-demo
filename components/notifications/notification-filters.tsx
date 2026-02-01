"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const filters = [
  { value: "all", label: "Все" },
  { value: "status_change", label: "Статусы" },
  { value: "maintenance", label: "Спецтехника" },
  { value: "alert", label: "Внимание" },
]

interface NotificationFiltersProps {
  value: string
  onChange: (value: string) => void
}

export function NotificationFilters({ value, onChange }: NotificationFiltersProps) {
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList>
        {filters.map(filter => (
          <TabsTrigger key={filter.value} value={filter.value}>
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
