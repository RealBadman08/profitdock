import { ActiveSymbol, Tick } from "@/services/derivWebSocket";
import MarketSelector from "./MarketSelector";
import { ChevronUp, ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartHeaderProps {
    symbol: string;
    onSymbolChange: (symbol: string) => void;
    symbols: ActiveSymbol[];
    tick: Tick | null;
    prevTick: number | null;
}

export default function ChartHeader({ symbol, onSymbolChange, symbols, tick, prevTick }: ChartHeaderProps) {
    const quote = tick?.quote;
    const isUp = quote && prevTick && quote > prevTick;

    // Calculate 24h change (Simulated or use tick day change if available. WS tick doesn't give 24h change directly usually, but we can simulate color)
    const change = 0.45; // Placeholder
    const changeIsUp = true;

    return (
        <div className="h-[60px] bg-[#151E2D] border-b border-[#2A3647] flex items-center justify-between px-4 z-40 relative">
            {/* Left: Market Selector */}
            <div className="flex items-center gap-4">
                <MarketSelector
                    symbol={symbol}
                    onChange={onSymbolChange}
                    symbols={symbols}
                />
            </div>

            {/* Right: Stats */}
            <div className="flex items-center gap-6">
                {/* Quote Display */}
                <div className="flex flex-col items-end">
                    <div className={cn("text-xl font-bold font-mono tracking-tight flex items-center gap-1",
                        isUp ? "text-[#00B981]" : "text-[#FF444F]")}>
                        {quote?.toFixed(tick?.pip_size || 2) || "Loading..."}
                        {isUp !== undefined && (isUp ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />)}
                    </div>
                </div>

                {/* 24h Change Badge (Cosmetic for fidelity) */}
                <div className="hidden md:flex flex-col items-end">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">24h Change</span>
                    <span className={cn("text-sm font-bold", changeIsUp ? "text-[#00B981]" : "text-[#FF444F]")}>
                        {changeIsUp ? "+" : "-"}{change}%
                    </span>
                </div>

                <div className="w-[1px] h-8 bg-[#2A3647] mx-2 hidden md:block"></div>

                {/* Info Icon */}
                <button className="text-gray-400 hover:text-white transition-colors">
                    <Info className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
