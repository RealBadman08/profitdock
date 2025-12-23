import { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDerivWS, Tick } from '@/services/derivWebSocket';
import { Loader2, TrendingUp, TrendingDown, Target } from 'lucide-react';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const SYMBOLS = [
    { value: 'R_100', label: 'Volatility 100 (1s)' },
    { value: 'R_10', label: 'Volatility 10 (1s)' },
    { value: 'R_25', label: 'Volatility 25 (1s)' },
    { value: 'R_50', label: 'Volatility 50 (1s)' },
    { value: 'R_75', label: 'Volatility 75 (1s)' },
];

export default function DigitDiffer() {
    const [symbol, setSymbol] = useState('R_100');
    const [ticks, setTicks] = useState<number[]>([]);
    const [stats, setStats] = useState<number[]>(Array(10).fill(0));
    const [loading, setLoading] = useState(true);
    const [prediction, setPrediction] = useState<number | null>(null);

    const ws = getDerivWS();

    useEffect(() => {
        setTicks([]);
        setStats(Array(10).fill(0));
        setLoading(true);

        const handleTick = (tick: Tick) => {
            setLoading(false);
            const digit = parseInt(tick.quote.toFixed(tick.quote.toString().split('.')[1]?.length || 0).slice(-1));

            setTicks(prev => {
                const newTicks = [...prev, digit];
                if (newTicks.length > 1000) newTicks.shift(); // Keep last 1000
                return newTicks;
            });
        };

        ws.subscribeTicks(symbol, handleTick);

        return () => {
            ws.unsubscribeTicks();
        };
    }, [symbol]);

    // Recalculate stats whenever ticks change (throttled conceptually by React batching)
    useEffect(() => {
        if (ticks.length === 0) return;

        const counts = Array(10).fill(0);
        // Analyze last 100 ticks for short term trends
        const recentTicks = ticks.slice(-100);
        recentTicks.forEach(d => counts[d]++);

        const total = recentTicks.length;
        const newStats = counts.map(c => (c / total) * 100);
        setStats(newStats);

        // Simple Prediction: Least frequent digit is good for "Differs"
        // Most frequent is good for "Matches"
        const min = Math.min(...counts);
        const leastFrequent = counts.indexOf(min);
        setPrediction(leastFrequent);

    }, [ticks]);

    return (
        <div className="space-y-6">
            {/* Header / Control */}
            <div className="flex justify-between items-center bg-[#2A2A2A] p-4 rounded-xl border border-gray-800">
                <div className="flex items-center gap-4">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2">
                        <Target className="w-5 h-5 text-[#C026D3]" />
                        Digit Analyzer
                    </h2>
                    <Select value={symbol} onValueChange={setSymbol}>
                        <SelectTrigger className="w-[180px] bg-[#1A1A1A] border-gray-700 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#2A2A2A] border-gray-700 text-white">
                            {SYMBOLS.map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {loading && <div className="flex items-center text-xs text-[#C026D3]"><Loader2 className="w-3 h-3 animate-spin mr-1" /> Gathering data...</div>}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {stats.map((percentage, digit) => (
                    <Card key={digit} className={`bg-[#2A2A2A] border-gray-800 p-4 flex flex-col items-center justify-center relative overflow-hidden transition-all ${digit === prediction ? 'ring-2 ring-green-500 bg-green-500/10' : ''}`}>
                        {/* Progress Bar Background */}
                        <div
                            className="absolute bottom-0 left-0 right-0 bg-[#C026D3]/20 transition-all duration-300"
                            style={{ height: `${percentage}%` }}
                        />

                        <span className="text-4xl font-bold text-white z-10 mb-2">{digit}</span>
                        <span className="text-sm text-gray-400 z-10">{percentage.toFixed(1)}%</span>

                        {digit === prediction && (
                            <span className="absolute top-2 right-2 text-green-500 text-xs font-bold px-2 py-0.5 bg-green-500/20 rounded-full">
                                LDP
                            </span>
                        )}
                    </Card>
                ))}
            </div>

            {/* Analysis Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-[#2A2A2A] border-gray-800 p-6">
                    <h3 className="text-gray-400 text-sm font-semibold mb-4 uppercase">Matches Strategy</h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Most Frequent (Last 100)</p>
                            <p className="text-2xl font-bold text-green-500">
                                {stats.indexOf(Math.max(...stats))}
                            </p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-green-500/50" />
                    </div>
                    <p className="text-xs text-gray-500 mt-4">
                        Best for "Matches" contracts. Statistically appearing most often.
                    </p>
                </Card>

                <Card className="bg-[#2A2A2A] border-gray-800 p-6">
                    <h3 className="text-gray-400 text-sm font-semibold mb-4 uppercase">Differs Strategy</h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Least Frequent (Last 100)</p>
                            <p className="text-2xl font-bold text-blue-500">
                                {stats.indexOf(Math.min(...stats))}
                            </p>
                        </div>
                        <Target className="w-8 h-8 text-blue-500/50" />
                    </div>
                    <p className="text-xs text-gray-500 mt-4">
                        Best for "Differs" contracts. Statistically appearing least often (LDP).
                    </p>
                </Card>
            </div>

            {/* Ticker Tape */}
            <div className="bg-[#2A2A2A] p-4 rounded-xl border border-gray-800 overflow-hidden">
                <div className="flex gap-2 justify-end">
                    {ticks.slice(-20).reverse().map((digit, i) => (
                        <div key={i} className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm ${i === 0 ? 'bg-[#C026D3] text-white scale-110' : 'bg-[#1A1A1A] text-gray-500'}`}>
                            {digit}
                        </div>
                    ))}
                    <div className="flex items-center text-xs text-gray-600 uppercase font-semibold ml-2">History</div>
                </div>
            </div>
        </div>
    );
}
