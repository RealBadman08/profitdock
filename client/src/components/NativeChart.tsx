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

interface NativeChartProps {
    symbol?: string;
    height?: number;
    hideControls?: boolean;
}

export default function NativeChart({ symbol: externalSymbol, height = 500, hideControls = false }: NativeChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [chart, setChart] = useState<LightweightCharts.IChartApi | null>(null);
    const [series, setSeries] = useState<LightweightCharts.ISeriesApi<"Candlestick"> | null>(null);
    const [internalSymbol, setInternalSymbol] = useState('R_100');
    const [loading, setLoading] = useState(true);
    const ws = getDerivWS();

    const currentSymbol = externalSymbol || internalSymbol;

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Initialize Chart with Deriv Colors
        const newChart = LightweightCharts.createChart(chartContainerRef.current, {
            layout: {
                background: { type: LightweightCharts.ColorType.Solid, color: '#0E1C2F' }, // Deriv background
                textColor: '#D6DADD', // Deriv secondary text
            },
            grid: {
                vertLines: { color: '# 1A2332' }, // Deriv card background
                horzLines: { color: '#1A2332' },
            },
            width: chartContainerRef.current.clientWidth,
            height: height,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#2A3647', // Deriv border
            },
            rightPriceScale: {
                borderColor: '#2A3647',
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
        });

        if (!newChart) {
            console.error("Chart creation failed");
            return;
        }

        // Deriv Official Candlestick Colors
        const newSeries = newChart.addSeries(LightweightCharts.CandlestickSeries, {
            upColor: '#00B981',       // Deriv Green (Rise)
            downColor: '#FF444F',     // Deriv Red (Fall)
            borderUpColor: '#00B981',
            borderDownColor: '#FF444F',
            wickUpColor: '#00B981',
            wickDownColor: '#FF444F',
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
    }, [height]);

    // Fetch Data & Subscribe
    useEffect(() => {
        if (!series || !currentSymbol) return;

        setLoading(true);
        // Clear previous data when symbol changes
        series.setData([]);

        // Subscribe to candles (60s default for now)
        ws.subscribeCandles(currentSymbol, 60, (data) => {
            setLoading(false);

            if (Array.isArray(data)) {
                // History (OHLC array)
                const formatted = data.map(c => ({
                    time: c.epoch as LightweightCharts.Time,
                    open: Number(c.open),
                    high: Number(c.high),
                    low: Number(c.low),
                    close: Number(c.close),
                }));
                // Access series safely
                try {
                    series.setData(formatted);
                } catch (e) { console.error("Chart SetData Error", e); }
            } else {
                // Realtime Update (Single Candle / OHLC Stream)
                // Deriv sends 'ohlc' object for realtime updates
                // Note: 'open_time' vs 'epoch'
                try {
                    // Force type cast numbers just in case
                    const candle = {
                        time: Number(data.epoch) as LightweightCharts.Time,
                        open: Number(data.open),
                        high: Number(data.high),
                        low: Number(data.low),
                        close: Number(data.close),
                    };
                    series.update(candle);
                } catch (e) {
                    // Silent fail on minor update errors
                }
            }
        });

        return () => {
            ws.unsubscribeCandles();
        };
    }, [currentSymbol, series]);

    return (
        <div className="h-full flex flex-col bg-[#0E1C2F]"> {/* Deriv background */}
            {!hideControls && (
                <div className="flex justify-between items-center mb-4 p-4 border-b border-[#2A3647]"> {/* Deriv border */}
                    <div className="flex items-center gap-4">
                        <Select value={internalSymbol} onValueChange={setInternalSymbol}>
                            <SelectTrigger className="w-[200px] bg-[#151E2D] border-[#2A3647] text-white"> {/* Deriv card + border */}
                                <SelectValue placeholder="Select asset" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1A2332] border-[#2A3647] text-white"> {/* Deriv secondary + border */}
                                {SYMBOLS.map(s => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {loading && <div className="flex items-center text-xs text-[#C026D3]"><Loader2 className="w-3 h-3 animate-spin mr-1" /> Loading live feed...</div>}
                        {!ws && <div className="text-xs text-red-500">WebSocket Disconnected</div>}
                    </div>
                </div>
            )}

            <div className="flex-1 relative w-full" ref={chartContainerRef} style={{ minHeight: height }}>
                {/* Chart renders here */}
            </div>
            {/* Loading overlay for chart specific area if needed */}
            {loading && hideControls && (
                <div className="absolute top-4 right-4 flex items-center text-xs text-[#C026D3] z-10 bg-black/50 px-2 py-1 rounded">
                    <Loader2 className="w-3 h-3 animate-spin mr-1" /> Live
                </div>
            )}
        </div>
    );
}
