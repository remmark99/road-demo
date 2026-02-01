"use client"

import { useMemo } from "react"
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
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
import { generateSegmentStats } from "@/lib/mock-data"

export function SegmentComparisonChart() {
  const data = useMemo(() => generateSegmentStats(), [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Сравнение участков</CardTitle>
        <CardDescription>
          Процент времени в чистом состоянии по участкам
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            cleanPercentage: {
              label: "Чистое состояние",
              color: "#4ade80",
            },
          }}
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis 
                type="number" 
                domain={[0, 100]}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(value) => `${value}%`}
              />
              <YAxis 
                type="category" 
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={120}
                tickLine={false}
              />
              <ChartTooltip 
                content={<ChartTooltipContent />}
                formatter={(value) => [`${value}%`, "Чистое время"]}
              />
              <Bar 
                dataKey="cleanPercentage" 
                radius={[0, 4, 4, 0]}
                name="Чистое состояние"
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.cleanPercentage >= 70 ? "#4ade80" : entry.cleanPercentage >= 50 ? "#f59e0b" : "#ef4444"} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
