import { useState } from "react";
import { Search, Star, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Asset {
    symbol: string;
    label: string;
    price?: number;
    change?: number;
}

interface AssetCategory {
    name: string;
    icon: string;
    assets: Asset[];
}

const ASSET_CATEGORIES: AssetCategory[] = [
    {
        name: "Derived Indices",
        icon: "📊",
        assets: [
            { symbol: "R_100", label: "Volatility 100 (1s) Index" },
            { symbol: "R_75", label: "Volatility 75 (1s) Index" },
            { symbol: "R_50", label: "Volatility 50 (1s) Index" },
            { symbol: "R_25", label: "Volatility 25 (1s) Index" },
            { symbol: "R_10", label: "Volatility 10 (1s) Index" },
        ],
    },
    {
        name: "Forex",
        icon: "💱",
        assets: [
            { symbol: "frxEURUSD", label: "EUR/USD" },
            { symbol: "frxGBPUSD", label: "GBP/USD" },
            { symbol: "frxUSDJPY", label: "USD/JPY" },
            { symbol: "frxAUDUSD", label: "AUD/USD" },
        ],
    },
    {
        name: "Cryptocurrencies",
        icon: "₿",
        assets: [
            { symbol: "cryBTCUSD", label: "BTC/USD" },
            { symbol: "cryETHUSD", label: "ETH/USD" },
        ],
    },
];

interface AssetSidebarProps {
    selectedSymbol: string;
    onSelectSymbol: (symbol: string) => void;
}

export default function AssetSidebar({ selectedSymbol, onSelectSymbol }: AssetSidebarProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedCategories, setExpandedCategories] = useState<string[]>(["Derived Indices"]);
    const [favorites, setFavorites] = useState<string[]>([]);

    const toggleCategory = (categoryName: string) => {
        setExpandedCategories((prev) =>
            prev.includes(categoryName)
                ? prev.filter((c) => c !== categoryName)
                : [...prev, categoryName]
        );
    };

    const toggleFavorite = (symbol: string) => {
        setFavorites((prev) =>
            prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
        );
    };

    const filteredCategories = ASSET_CATEGORIES.map((category) => ({
        ...category,
        assets: category.assets.filter((asset) =>
            asset.label.toLowerCase().includes(searchQuery.toLowerCase())
        ),
    })).filter((category) => category.assets.length > 0);

    return (
        <div className="w-64 h-full bg-[#151E2D] border-r border-[#2A3647] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-[#2A3647]">
                <h2 className="text-white font-semibold mb-3">Markets</h2>

                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search markets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#1A2332] border border-[#2A3647] rounded-md pl-10 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#00B981]"
                    />
                </div>
            </div>

            {/* Asset Categories */}
            <div className="flex-1 overflow-y-auto">
                {filteredCategories.map((category) => (
                    <div key={category.name} className="border-b border-[#2A3647]">
                        {/* Category Header */}
                        <button
                            onClick={() => toggleCategory(category.name)}
                            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1A2332] transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-lg">{category.icon}</span>
                                <span className="text-sm font-medium text-white">{category.name}</span>
                                <span className="text-xs text-gray-500">({category.assets.length})</span>
                            </div>
                            {expandedCategories.includes(category.name) ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                        </button>

                        {/* Category Assets */}
                        {expandedCategories.includes(category.name) && (
                            <div className="bg-[#0E1C2F]">
                                {category.assets.map((asset) => (
                                    <button
                                        key={asset.symbol}
                                        onClick={() => onSelectSymbol(asset.symbol)}
                                        className={cn(
                                            "w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[#1A2332] transition-colors group",
                                            selectedSymbol === asset.symbol && "bg-[#1A2332] border-l-2 border-[#00B981]"
                                        )}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-white truncate">{asset.label}</div>
                                            <div className="text-xs text-gray-500">{asset.symbol}</div>
                                        </div>

                                        {/* Favorite Star */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleFavorite(asset.symbol);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Star
                                                className={cn(
                                                    "w-4 h-4",
                                                    favorites.includes(asset.symbol)
                                                        ? "fill-yellow-500 text-yellow-500"
                                                        : "text-gray-400 hover:text-yellow-500"
                                                )}
                                            />
                                        </button>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Favorites Section (if any) */}
            {favorites.length > 0 && (
                <div className="border-t border-[#2A3647] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white mb-2">
                        <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                        Favorites ({favorites.length})
                    </div>
                </div>
            )}
        </div>
    );
}
