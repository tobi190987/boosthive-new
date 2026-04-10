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

// SVG gradient IDs dürfen keine Leerzeichen oder Sonderzeichen enthalten
function toGradId(title: string) {
  return `grad-${title.replace(/[^a-zA-Z0-9]/g, '-')}`
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
  const gradId = toGradId(title)

  return (
    <Card className="rounded-2xl border-0 bg-slate-50/60 shadow-none dark:border dark:border-border dark:bg-card">
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</CardTitle>
        {description && (
          <p className="text-xs text-slate-400 dark:text-slate-500">{description}</p>
        )}
      </CardHeader>
      <CardContent className="pb-4 pt-1">
        <ResponsiveContainer width="100%" height={200}>
          <ChartComp data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="#e2e8f0"
              className="dark:stroke-slate-800"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              dy={6}
            />
            <YAxis
              reversed={invertY}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}${unit}`}
            />
            <Tooltip
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#0f172a',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                padding: '8px 12px',
              }}
              formatter={(value) => [`${value ?? ''}${unit}`, title]}
              labelStyle={{ color: '#64748b', marginBottom: '2px', fontWeight: 500 }}
            />
            {type === 'area' ? (
              <Area
                type="monotoneX"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{ r: 4, fill: '#ffffff', stroke: color, strokeWidth: 2 }}
              />
            ) : (
              <Line
                type="monotoneX"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#ffffff', stroke: color, strokeWidth: 2 }}
              />
            )}
          </ChartComp>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
