import { useState } from "react";
import { useDeriv } from "@/contexts/DerivContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Smartphone, 
  Rocket, 
  Crown, 
  Bot, 
  TrendingUp,
  Search,
  RefreshCw,
  MessageCircle,
  Menu,
  ChevronDown,
  Upload
} from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { balance, accountType, isAuthorized, accountInfo } = useDeriv();
  const [searchQuery, setSearchQuery] = useState("");

  const botCategories = [
    {
      id: "load-bot",
      title: "Load Bot",
      icon: Smartphone,
      description: "Upload your custom bot configuration",
      color: "bg-blue-500",
    },
    {
      id: "speed-bot",
      title: "Speed Bot",
      icon: Rocket,
      description: "Fast execution trading bots",
      color: "bg-orange-500",
    },
    {
      id: "premium-bots",
      title: "Premium Bots",
      icon: Crown,
      description: "Advanced premium strategies",
      color: "bg-yellow-500",
    },
    {
      id: "free-bots",
      title: "Free Bots",
      icon: Bot,
      description: "Pre-built free bot templates",
      color: "bg-teal-500",
    },
    {
      id: "analysis-tool",
      title: "Analysis Tool",
      icon: TrendingUp,
      description: "Market analysis and insights",
      color: "bg-purple-500",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="text-white">
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">
              <span className="text-cyan-400">MKUL</span>
              <span className="text-red-500">IMA</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-white">
              <MessageCircle className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white">
              <RefreshCw className="h-5 w-5" />
            </Button>
            
            {/* Account balance and type */}
            <div className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {accountType === 'real' ? 'R' : 'D'}
                </span>
              </div>
              <span className="text-white font-semibold">
                {balance?.toFixed(2) || '0.00'} USD
              </span>
              <ChevronDown className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-gray-800 px-4 py-2 flex gap-6 overflow-x-auto">
        <Link href="/dashboard">
          <a className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium whitespace-nowrap">
            Dashboard
          </a>
        </Link>
        <Link href="/bot-builder">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg font-medium whitespace-nowrap">
            Bot Builder
          </a>
        </Link>
        <Link href="/free-bots">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg font-medium whitespace-nowrap">
            Free Bots
          </a>
        </Link>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6">
        {/* Search Bar */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex gap-2">
            <Button variant="outline" className="bg-gray-800 text-white border-gray-700">
              All
            </Button>
            <div className="flex-1 relative">
              <Input
                type="text"
                placeholder="Search for a bot..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white pl-4 pr-12"
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-cyan-400"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Upload className="h-4 w-4 mr-2" />
              Upload Bot
            </Button>
          </div>
        </div>

        {/* Bot Categories Grid */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {botCategories.map((category) => {
            const Icon = category.icon;
            return (
              <div
                key={category.id}
                className="bg-gray-800 rounded-xl p-8 hover:bg-gray-750 transition-colors cursor-pointer border border-gray-700 hover:border-gray-600"
              >
                <div className="flex flex-col items-center text-center gap-4">
                  <div className={`${category.color} w-20 h-20 rounded-2xl flex items-center justify-center`}>
                    <Icon className="h-10 w-10 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-1">
                      {category.title}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      {category.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notification Badge */}
        <div className="fixed bottom-20 right-6 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
          4
        </div>
      </main>

      {/* Bottom Bar */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-4 flex items-center justify-between">
        <Button className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold">
          ⚠ Risk Disclaimer
        </Button>
        
        <div className="flex items-center gap-4">
          <div className="text-white">
            <span className="text-gray-400">Bot status:</span> Not running
          </div>
          <Button className="bg-green-600 hover:bg-green-700 text-white px-8">
            ▶ Run
          </Button>
        </div>
      </div>
    </div>
  );
}
