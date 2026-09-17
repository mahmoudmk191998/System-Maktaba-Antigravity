import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAppStore } from '@/lib/store';
import { formatCurrency, formatNumber } from '@/lib/formatters';

interface SalesChartProps {
  data: { hour: string; orders: number; sales: number }[];
}

export function SalesChart({ data }: SalesChartProps) {
  const { settings } = useAppStore();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium mb-2">الساعة {label}:00</p>
          <div className="space-y-1">
            <p className="text-sm text-success">
              المبيعات: {formatCurrency(payload[0].value, settings.useArabicNumerals)}
            </p>
            <p className="text-sm text-info">
              الطلبات: {formatNumber(payload[1].value, settings.useArabicNumerals)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value) => `${value}:00`}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis
            yAxisId="sales"
            orientation="right"
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value) => `${value / 1000}k`}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis
            yAxisId="orders"
            orientation="left"
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            yAxisId="sales"
            type="monotone"
            dataKey="sales"
            stroke="hsl(var(--success))"
            strokeWidth={2}
            fill="url(#salesGradient)"
          />
          <Area
            yAxisId="orders"
            type="monotone"
            dataKey="orders"
            stroke="hsl(var(--info))"
            strokeWidth={2}
            fill="url(#ordersGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
