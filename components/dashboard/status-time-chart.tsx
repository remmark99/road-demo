"use client"

import { useMemo } from "react"
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { generateChartData } from "@/lib/mock-data"

export function StatusTimeChart() {
  const data = useMemo(() => generateChartData(7), [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Состояние участков по дням</CardTitle>
        <CardDescription>
          Время (в часах) в каждом статусе за последние 7 дней
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            cleanHours: {
              label: "Чистый",
              color: "#4ade80",
            },
            dirtyHours: {
              label: "Загрязнён",
              color: "#ef4444",
            },
            warningHours: {
              label: "Внимание",
              color: "#f59e0b",
            },
          }}
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(value) => `${value}ч`}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="cleanHours"
                stackId="1"
                stroke="#4ade80"
                fill="#4ade80"
                fillOpacity={0.6}
                name="Чистый"
              />
              <Area
                type="monotone"
                dataKey="warningHours"
                stackId="1"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.6}
                name="Внимание"
              />
              <Area
                type="monotone"
                dataKey="dirtyHours"
                stackId="1"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.6}
                name="Загрязнён"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
