export default function Strategy() {
    return (
        <div className="flex-1 p-8 bg-[#0E0E0E]">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold text-white mb-4">Strategy Builder</h1>
                <p className="text-gray-400 mb-8">Create and backtest your trading strategies</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Visual Builder</h3>
                        <p className="text-gray-400">Drag-and-drop strategy creation</p>
                    </div>

                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Backtesting</h3>
                        <p className="text-gray-400">Test strategies on historical data</p>
                    </div>
                </div>

                <div className="mt-8 bg-[#1A1A1A] p-8 rounded-lg border border-[#333] text-center">
                    <p className="text-gray-400">Coming Soon: Advanced strategy builder</p>
                </div>
            </div>
        </div>
    );
}
