import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DerivChartProps {
  tickHistory: Array<{ quote: number; epoch: number }>;
}

export default function DerivChart({ tickHistory }: DerivChartProps) {
  const chartData = useMemo(() => {
    return tickHistory.map((tick, index) => ({
      index,
      price: tick.quote,
      time: new Date(tick.epoch * 1000).toLocaleTimeString(),
    }));
  }, [tickHistory]);

  if (tickHistory.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary/30 rounded border border-border">
        <p className="text-muted-foreground">Loading chart data...</p>
      </div>
    );
  }

  const minPrice = Math.min(...tickHistory.map((t) => t.quote));
  const maxPrice = Math.max(...tickHistory.map((t) => t.quote));
  const padding = (maxPrice - minPrice) * 0.1 || 1;

  return (
    <div className="h-full w-full bg-white rounded border border-border">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#999999" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#999999" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="0" stroke="#F5F5F5" vertical={false} />
          <XAxis
            dataKey="index"
            hide
            domain={[0, chartData.length - 1]}
          />
          <YAxis
            domain={[minPrice - padding, maxPrice + padding]}
            hide={false}
            orientation="right"
            tickFormatter={(value) => value.toFixed(2)}
            tick={{ fill: "#999999", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #E6E9E9",
              borderRadius: "4px",
              fontSize: "12px",
            }}
            labelFormatter={(label) => `Tick ${label}`}
            formatter={(value: any) => [value.toFixed(2), "Price"]}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="#666666"
            strokeWidth={2}
            fill="url(#colorPrice)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
