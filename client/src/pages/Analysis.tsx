export default function Analysis() {
    return (
        <div className="flex-1 p-8 bg-[#0E0E0E]">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold text-white mb-4">Technical Analysis</h1>
                <p className="text-gray-400 mb-8">Advanced market analysis tools and indicators</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Market Trends</h3>
                        <p className="text-gray-400">Real-time trend analysis across all markets</p>
                    </div>

                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Technical Indicators</h3>
                        <p className="text-gray-400">RSI, MACD, Bollinger Bands, and more</p>
                    </div>

                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Chart Patterns</h3>
                        <p className="text-gray-400">Identify support, resistance, and patterns</p>
                    </div>
                </div>

                <div className="mt-8 bg-[#1A1A1A] p-8 rounded-lg border border-[#333] text-center">
                    <p className="text-gray-400">Coming Soon: Full technical analysis dashboard</p>
                </div>
            </div>
        </div>
    );
}
