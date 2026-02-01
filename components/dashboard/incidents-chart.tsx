"use client"

import { useMemo } from "react"
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
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

export function IncidentsChart() {
  const data = useMemo(() => {
    const days = []
    const now = new Date()
    
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      days.push({
        date: date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
        statusChanges: Math.floor(Math.random() * 8 + 2),
        maintenanceEvents: Math.floor(Math.random() * 3),
        alerts: Math.floor(Math.random() * 2),
      })
    }
    
    return days
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>История событий</CardTitle>
        <CardDescription>
          Количество событий по типам за последние 2 недели
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            statusChanges: {
              label: "Изменения статуса",
              color: "#60a5fa",
            },
            maintenanceEvents: {
              label: "Спецтехника",
              color: "#4ade80",
            },
            alerts: {
              label: "Оповещения",
              color: "#ef4444",
            },
          }}
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
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
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="statusChanges"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ fill: "#60a5fa", strokeWidth: 0, r: 3 }}
                name="Изменения статуса"
              />
              <Line
                type="monotone"
                dataKey="maintenanceEvents"
                stroke="#4ade80"
                strokeWidth={2}
                dot={{ fill: "#4ade80", strokeWidth: 0, r: 3 }}
                name="Спецтехника"
              />
              <Line
                type="monotone"
                dataKey="alerts"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: "#ef4444", strokeWidth: 0, r: 3 }}
                name="Оповещения"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
