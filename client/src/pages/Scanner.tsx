import { useEffect, useState } from 'react';
import { getDerivWS } from '@/services/derivWebSocket';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, TrendingUp, TrendingDown, Activity } from 'lucide-react';

export default function Scanner() {
    const [symbols, setSymbols] = useState<any[]>([]);
    const [filteredSymbols, setFilteredSymbols] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSymbols = async () => {
            try {
                const ws = getDerivWS();
                const activeSymbols = await ws.getActiveSymbols('full'); // Fetch full details to get current stats if available, though ticks are better

                // Filter for interesting markets (e.g. Volatility Indices, Forex)
                const interesting = activeSymbols.filter(s =>
                    s.market === 'synthetic_index' || s.market === 'forex'
                );

                // Initial state without price/change
                const initialData = interesting.map(s => ({
                    ...s,
                    change: '0.00',
                    volume: 0,
                    price: '---',
                    rawPrice: 0
                }));

                setSymbols(initialData);
                setFilteredSymbols(initialData);

                // Subscribe to ticks for the first 20 symbols to avoid overloading connection
                // In a production app, we would use a more efficient stream or pagination
                const symbolsToTrack = initialData.slice(0, 20).map(s => s.symbol);

                symbolsToTrack.forEach(symbol => {
                    ws.subscribeTicks(symbol, (tick) => {
                        setSymbols(prev => {
                            const idx = prev.findIndex(p => p.symbol === symbol);
                            if (idx === -1) return prev;

                            const oldItem = prev[idx];
                            const newPrice = tick.quote;
                            // Calculate simple change from previous tick (or open if we had it)
                            // For true 24h change we need candles, but tick change is "live" enough for scanner feeling
                            let changePercent = oldItem.rawPrice ? ((newPrice - oldItem.rawPrice) / oldItem.rawPrice * 100).toFixed(4) : '0.00';

                            const updated = [...prev];
                            updated[idx] = {
                                ...oldItem,
                                price: newPrice.toFixed(4),
                                rawPrice: newPrice,
                                change: changePercent,
                                volume: oldItem.volume + 1 // Increment "activity"
                            };
                            return updated;
                        });
                    });
                });

            } catch (err) {
                console.error("Failed to load symbols", err);
            } finally {
                setLoading(false);
            }
        };

        fetchSymbols();

        return () => {
            // Cleanup subscriptions would go here, strict mode checks needed
            const ws = getDerivWS();
            ws.unsubscribeTicks();
        };
    }, []);

    useEffect(() => {
        const lower = search.toLowerCase();
        const filtered = symbols.filter(s =>
            s.symbol.toLowerCase().includes(lower) ||
            s.display_name.toLowerCase().includes(lower)
        );
        setFilteredSymbols(filtered);
    }, [search, symbols]);

    return (
        <div className="min-h-screen bg-[#1A1A1A] p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Market Scanner</h1>
                        <p className="text-gray-400">Real-time opportunities across all markets</p>
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                            placeholder="Search markets..."
                            className="pl-9 bg-[#2A2A2A] border-gray-700 text-white"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-20 text-gray-500">Scanning markets...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredSymbols.map((item) => (
                            <Card key={item.symbol} className="bg-[#2A2A2A] border-gray-800 p-4 hover:border-[#C026D3] transition-colors cursor-pointer">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-white font-semibold">{item.display_name}</h3>
                                        <p className="text-gray-500 text-xs">{item.market_display_name}</p>
                                    </div>
                                    <div className={`flex items-center text-sm font-bold ${parseFloat(item.change) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {parseFloat(item.change) >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                                        {item.change}%
                                    </div>
                                </div>

                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-gray-500 text-xs mb-1">Price</p>
                                        <p className="text-xl font-bold text-white">${item.price}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-gray-500 text-xs mb-1">Volume</p>
                                        <p className="text-gray-300 text-sm">{item.volume.toLocaleString()}</p>
                                    </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-gray-700 flex justify-between items-center">
                                    <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-1 rounded">Buy Signal</span>
                                    <Activity className="w-4 h-4 text-gray-500" />
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
