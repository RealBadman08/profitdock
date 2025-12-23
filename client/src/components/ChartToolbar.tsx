import { LineChart, BarChart2, BarChart3, TrendingUp } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface ChartToolbarProps {
    onAddIndicator?: (indicator: string) => void;
    chartType?: "area" | "candle" | "ohlc" | "hollow";
    onChartTypeChange?: (type: string) => void;
}

export default function ChartToolbar({ onAddIndicator, chartType = "candle", onChartTypeChange }: ChartToolbarProps) {
    const chartTypes = [
        { id: "area", label: "Area", icon: TrendingUp },
        { id: "candle", label: "Candle", icon: BarChart2 },
        { id: "ohlc", label: "OHLC", icon: BarChart3 },
        { id: "hollow", label: "Hollow", icon: BarChart2 },
    ];

    const indicators = [
        { id: "MA", label: "Moving Average" },
        { id: "RSI", label: "RSI" },
        { id: "MACD", label: "MACD" },
        { id: "BB", label: "Bollinger Bands" },
    ];

    return (
        <div className="flex items-center justify-between px-4 py-2 bg-[#151E2D] border-b border-[#2A3647]">
            {/* Chart Type Selector */}
            <div className="flex items-center gap-1">
                {chartTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                        <button
                            key={type.id}
                            onClick={() => onChartTypeChange?.(type.id)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors",
                                chartType === type.id
                                    ? "bg-[#1A2332] text-white"
                                    : "text-gray-400 hover:text-white hover:bg-[#1A2332]"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            <span>{type.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Indicators */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 mr-2">Indicators:</span>
                {indicators.map((indicator) => (
                    <Button
                        key={indicator.id}
                        onClick={() => onAddIndicator?.(indicator.id)}
                        variant="ghost"
                        size="sm"
                        className="text-xs text-gray-400 hover:text-white hover:bg-[#1A2332] h-7 px-2"
                    >
                        {indicator.label}
                    </Button>
                ))}
            </div>
        </div>
    );
}
