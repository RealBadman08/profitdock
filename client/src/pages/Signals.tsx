export default function Signals() {
    return (
        <div className="flex-1 p-8 bg-[#0E0E0E]">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold text-white mb-4">Trading Signals</h1>
                <p className="text-gray-400 mb-8">Real-time trading signals and alerts</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Live Signals</h3>
                        <p className="text-gray-400">Get notified of trading opportunities</p>
                    </div>

                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Signal History</h3>
                        <p className="text-gray-400">Review past signal performance</p>
                    </div>

                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Custom Alerts</h3>
                        <p className="text-gray-400">Set price and indicator alerts</p>
                    </div>
                </div>

                <div className="mt-8 bg-[#1A1A1A] p-8 rounded-lg border border-[#333] text-center">
                    <p className="text-gray-400">Coming Soon: AI-powered trading signals</p>
                </div>
            </div>
        </div>
    );
}
