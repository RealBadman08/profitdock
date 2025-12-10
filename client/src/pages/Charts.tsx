import NativeChart from '@/components/NativeChart';
import DigitAnalyzer from '@/components/DigitAnalyzer';

export default function Charts() {
    return (
        <div className="h-[calc(100vh-64px)] bg-[#1A1A1A] text-white flex flex-col md:flex-row overflow-hidden">
            {/* Main Chart Area */}
            <div className="flex-1 flex flex-col border-r border-gray-800">
                <div className="p-4 border-b border-gray-800 bg-[#2A2A2A]">
                    <h1 className="text-xl font-bold">Chart</h1>
                </div>
                <div className="flex-1 p-2 bg-[#1A1A1A] relative">
                    <NativeChart />
                </div>
            </div>

            {/* Analysis Sidebar */}
            <div className="w-full md:w-[400px] flex flex-col bg-[#1A1A1A] overflow-y-auto">
                <div className="p-4 border-b border-gray-800 bg-[#2A2A2A]">
                    <h1 className="text-xl font-bold">Digit Analysis</h1>
                </div>
                <div className="p-4">
                    <DigitAnalyzer />
                </div>
            </div>
        </div>
    );
}
