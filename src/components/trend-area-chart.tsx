'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DataPoint {
  label: string
  value: number
}

interface TrendAreaChartProps {
  title: string
  description?: string
  data: DataPoint[]
  /** "area" (default) or "line" */
  type?: 'area' | 'line'
  color?: string
  /** Set true to invert Y axis (lower = better, e.g. search position) */
  invertY?: boolean
  unit?: string
}

export function TrendAreaChart({
  title,
  description,
  data,
  type = 'area',
  color = '#3b82f6',
  invertY = false,
  unit = '',
}: TrendAreaChartProps) {
  const ChartComp = type === 'line' ? LineChart : AreaChart

  return (
    <Card className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <ChartComp data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-5" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'currentColor', className: 'text-slate-400' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              reversed={invertY}
              tick={{ fontSize: 11, fill: 'currentColor', className: 'text-slate-400' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}${unit}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '12px',
                fontSize: '12px',
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value) => [`${value ?? ''}${unit}`, title]}
              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
            />
            {type === 'area' ? (
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#grad-${title})`}
                dot={false}
                activeDot={{ r: 4, fill: color }}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: color }}
              />
            )}
          </ChartComp>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
