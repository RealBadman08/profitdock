export default function Tools() {
    return (
        <div className="flex-1 p-8 bg-[#0E0E0E]">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold text-white mb-4">Trading Tools</h1>
                <p className="text-gray-400 mb-8">Essential calculators and utilities for traders</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Profit Calculator</h3>
                        <p className="text-gray-400">Calculate potential profits and losses</p>
                    </div>

                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Risk Manager</h3>
                        <p className="text-gray-400">Manage position sizing and risk</p>
                    </div>

                    <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                        <h3 className="text-xl font-semibold text-white mb-2">Economic Calendar</h3>
                        <p className="text-gray-400">Track important market events</p>
                    </div>
                </div>

                <div className="mt-8 bg-[#1A1A1A] p-8 rounded-lg border border-[#333] text-center">
                    <p className="text-gray-400">Coming Soon: More trading utilities</p>
                </div>
            </div>
        </div>
    );
}
