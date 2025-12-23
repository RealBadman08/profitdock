import { useState } from "react";
import { Search, ChevronDown, Star, Info } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ActiveSymbol } from "@/services/derivWebSocket";
import { IconHub } from "./DerivIcons";

interface MarketSelectorProps {
    symbol: string;
    onChange: (symbol: string) => void;
    symbols: ActiveSymbol[];
}

export default function MarketSelector({ symbol, onChange, symbols }: MarketSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState("Derived");

    const selectedSymbolObj = symbols.find(s => s.symbol === symbol);

    // Group symbols (Simplified for now, similar to AssetSidebar logic)
    const filteredSymbols = symbols.filter(s =>
        s.display_name.toLowerCase().includes(search.toLowerCase()) &&
        (activeTab === "Derived" ? s.market === "synthetic_index" : s.market !== "synthetic_index") // Rough filter
    );

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-[#262626] p-2 rounded transition-colors group">
                    <div className="w-8 h-8 flex items-center justify-center bg-gray-700/50 rounded-full group-hover:bg-gray-700">
                        {/* Placeholder Icon based on market */}
                        <IconHub className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex flex-col items-start">
                        <div className="flex items-center gap-1.5">
                            <span className="text-white font-bold text-lg leading-none">
                                {selectedSymbolObj?.display_name || symbol}
                            </span>
                            <ChevronDown className="w-4 h-4 text-white/50 group-hover:text-white" />
                        </div>
                        <span className="text-[10px] text-green-500 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                            Open
                        </span>
                    </div>
                </button>
            </DialogTrigger>
            <DialogContent className="bg-[#151E2D] border-[#2A3647] text-white max-w-2xl p-0 gap-0 overflow-hidden shadow-2xl">
                <DialogHeader className="p-4 border-b border-[#2A3647] bg-[#151E2D]">
                    <DialogTitle className="text-lg font-bold">Markets</DialogTitle>
                </DialogHeader>

                <div className="flex h-[500px]">
                    {/* Tabs Sidebar */}
                    <div className="w-40 bg-[#0E1C2F] border-r border-[#2A3647] py-2 flex flex-col gap-1">
                        {["Derived", "Forex", "Stock Indices", "Cryptocurrencies", "Commodities"].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn("px-4 py-3 text-left text-xs font-bold transition-colors border-l-2",
                                    activeTab === tab ? "bg-[#151E2D] text-white border-[#FF444F]" : "text-gray-400 border-transparent hover:bg-[#151E2D] hover:text-gray-200")}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col bg-[#151E2D]">
                        <div className="p-4 border-b border-[#2A3647]">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <Input
                                    placeholder="Search markets on Deriv"
                                    className="pl-9 bg-[#0E1C2F] border-[#2A3647] text-white h-10 w-full"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start custom-scrollbar">
                            {filteredSymbols.map(s => (
                                <button
                                    key={s.symbol}
                                    onClick={() => {
                                        onChange(s.symbol);
                                        setIsOpen(false);
                                    }}
                                    className={cn("flex items-center gap-3 p-3 rounded hover:bg-[#1D2736] transition-colors text-left border border-transparent hover:border-[#2A3647]",
                                        symbol === s.symbol ? "bg-[#1D2736] border-[#FF444F]" : "")}
                                >
                                    <IconHub className="w-6 h-6 text-gray-400" /> {/* Placeholder */}
                                    <div>
                                        <div className="text-sm font-bold text-white">{s.display_name}</div>
                                        <div className="text-[10px] text-gray-500 font-mono">{s.symbol}</div>
                                    </div>
                                    {symbol === s.symbol && <div className="ml-auto text-[#FF444F] font-bold text-xs">Active</div>}
                                </button>
                            ))}
                            {filteredSymbols.length === 0 && (
                                <div className="col-span-2 text-center text-gray-500 py-10 text-sm">
                                    No markets found for "{activeTab}"
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
