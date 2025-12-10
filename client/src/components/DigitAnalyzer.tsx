import { useEffect, useState } from 'react';
import { getDerivWS } from '@/services/derivWebSocket';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function DigitAnalyzer() {
    // Stores counts for digits 0-9
    const [stats, setStats] = useState<number[]>(new Array(10).fill(0));
    const [lastDigit, setLastDigit] = useState<number | null>(null);
    const [totalTicks, setTotalTicks] = useState(0);
    const ws = getDerivWS();
    const symbol = 'R_100'; // Default to Vol 100

    useEffect(() => {
        // Reset stats
        setStats(new Array(10).fill(0));
        setTotalTicks(0);

        // Subscribe
        ws.subscribeTicks(symbol, (tick) => {
            const digit = Number(tick.quote.toFixed(2).slice(-1));
            setLastDigit(digit);
            setStats(prev => {
                const newStats = [...prev];
                newStats[digit]++;
                return newStats;
            });
            setTotalTicks(p => p + 1);
        });

        return () => {
            ws.unsubscribeTicks();
        };
    }, []);

    const data = stats.map((count, digit) => ({
        digit: digit.toString(),
        count,
        percent: totalTicks > 0 ? (count / totalTicks) * 100 : 0
    }));

    // Find Even/Odd percentages
    const evenCount = stats.reduce((acc, curr, idx) => idx % 2 === 0 ? acc + curr : acc, 0);
    const oddCount = totalTicks - evenCount;
    const evenPercent = totalTicks > 0 ? (evenCount / totalTicks) * 100 : 0;
    const oddPercent = 100 - evenPercent;

    return (
        <Card className="bg-[#1A1A1A] border-gray-800 p-6 text-white">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-[#C026D3]">Digit Analysis</span> (Last {totalTicks} ticks)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Chart Section */}
                <div className="h-64 bg-[#2A2A2A] rounded p-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                            <XAxis dataKey="digit" stroke="#888" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#333', border: 'none' }}
                                cursor={{ fill: '#444' }}
                            />
                            <Bar dataKey="count">
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.digit === lastDigit?.toString() ? '#Facc15' : '#C026D3'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Stats Section */}
                <div className="space-y-6">
                    {/* Even/Odd Bar */}
                    <div>
                        <div className="flex justify-between text-sm mb-2 text-gray-400">
                            <span>Even ({evenPercent.toFixed(1)}%)</span>
                            <span>Odd ({oddPercent.toFixed(1)}%)</span>
                        </div>
                        <div className="flex h-4 rounded-full overflow-hidden">
                            <div style={{ width: `${evenPercent}%` }} className="bg-blue-500 transition-all duration-300"></div>
                            <div style={{ width: `${oddPercent}%` }} className="bg-red-500 transition-all duration-300"></div>
                        </div>
                    </div>

                    {/* Last Digit Display */}
                    <div className="flex items-center justify-center p-4 bg-[#2A2A2A] rounded-lg">
                        <div className="text-center">
                            <p className="text-gray-400 text-sm mb-1">Last Digit</p>
                            <span className="text-6xl font-mono font-bold text-[#Facc15] animate-pulse">
                                {lastDigit !== null ? lastDigit : '-'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
