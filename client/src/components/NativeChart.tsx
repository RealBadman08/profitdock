import { useEffect, useRef, useState } from 'react';
import * as LightweightCharts from 'lightweight-charts';
import { getDerivWS, Tick } from '@/services/derivWebSocket';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const SYMBOLS = [
    { value: 'R_100', label: 'Volatility 100 (1s)' },
    { value: 'R_10', label: 'Volatility 10 (1s)' },
    { value: 'R_25', label: 'Volatility 25 (1s)' },
    { value: 'R_50', label: 'Volatility 50 (1s)' },
    { value: 'R_75', label: 'Volatility 75 (1s)' },
    { value: 'frxEURUSD', label: 'EUR/USD' },
    { value: 'frxGBPUSD', label: 'GBP/USD' },
    { value: 'cryBTCUSD', label: 'BTC/USD' },
];

export default function NativeChart() {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [chart, setChart] = useState<LightweightCharts.IChartApi | null>(null);
    const [series, setSeries] = useState<LightweightCharts.ISeriesApi<"Area"> | null>(null);
    const [symbol, setSymbol] = useState('R_100');
    const [loading, setLoading] = useState(true);
    const ws = getDerivWS();

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Initialize Chart
        const newChart = LightweightCharts.createChart(chartContainerRef.current, {
            layout: {
                background: { type: LightweightCharts.ColorType.Solid, color: '#1A1A1A' },
                textColor: '#d1d5db',
            },
            grid: {
                vertLines: { color: '#333' },
                horzLines: { color: '#333' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 500,
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
            },
        });

        if (!newChart) {
            console.error("Chart creation failed");
            return;
        }

        const newSeries = newChart.addSeries(LightweightCharts.AreaSeries, {
            lineColor: '#C026D3',
            topColor: 'rgba(192, 38, 211, 0.4)',
            bottomColor: 'rgba(192, 38, 211, 0.0)',
        });

        setChart(newChart);
        setSeries(newSeries);

        // Handle Resize
        const handleResize = () => {
            if (chartContainerRef.current) {
                newChart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            newChart.remove();
        };
    }, []);

    // Fetch Data & Subscribe
    useEffect(() => {
        if (!series || !symbol) return;

        setLoading(true);

        const loadData = async () => {
            try {
                // Subscribe to real-time ticks
                ws.subscribeTicks(symbol, (tick) => {
                    setLoading(false);
                    series.update({
                        time: tick.epoch as LightweightCharts.Time,
                        value: tick.quote
                    });
                });
            } catch (error) {
                console.error("Chart data error:", error);
                setLoading(false);
            }
        };

        loadData();

        return () => {
            ws.unsubscribeTicks();
        };
    }, [symbol, series]);

    return (
        <Card className="bg-[#2A2A2A] border-gray-800 p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <Select value={symbol} onValueChange={setSymbol}>
                        <SelectTrigger className="w-[200px] bg-[#1A1A1A] border-gray-700 text-white">
                            <SelectValue placeholder="Select asset" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#2A2A2A] border-gray-700 text-white">
                            {SYMBOLS.map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {loading && <div className="flex items-center text-xs text-[#C026D3]"><Loader2 className="w-3 h-3 animate-spin mr-1" /> Loading live feed...</div>}
                </div>
            </div>

            <div className="flex-1 min-h-[500px] relative border border-gray-800 rounded bg-[#1A1A1A]" ref={chartContainerRef}>
                {/* Chart renders here */}
            </div>
        </Card>
    );
}
