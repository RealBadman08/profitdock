import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { botTemplates } from "@/data/botTemplates";
import { useLocation } from "wouter";
import {
  Menu,
  MessageCircle,
  RefreshCw,
  ChevronDown,
  Download,
  Play
} from "lucide-react";
import { Link } from "wouter";

export default function FreeBots() {
  const { balance, isDemo } = useAuth();
  const accountType = isDemo ? 'demo' : 'real';
  const [, setLocation] = useLocation();

  const loadTemplate = (xml: string) => {
    localStorage.setItem('bot_config', xml);
    setLocation('/bot-builder');
  };

  const freeBots = [
    {
      id: 1,
      name: "Martingale Strategy",
      description: "Classic martingale bot that doubles stake after losses",
      winRate: "65%",
      trades: 1250,
    },
    {
      id: 2,
      name: "Trend Following",
      description: "Follows market trends with moving averages",
      winRate: "58%",
      trades: 890,
    },
    {
      id: 3,
      name: "RSI Oscillator",
      description: "Uses RSI indicator for overbought/oversold signals",
      winRate: "62%",
      trades: 1100,
    },
    {
      id: 4,
      name: "Breakout Hunter",
      description: "Identifies and trades price breakouts",
      winRate: "70%",
      trades: 650,
    },
    {
      id: 5,
      name: "Scalping Bot",
      description: "Quick trades for small consistent profits",
      winRate: "55%",
      trades: 2340,
    },
    {
      id: 6,
      name: "Grid Trading",
      description: "Places buy/sell orders at regular intervals",
      winRate: "60%",
      trades: 980,
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
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg font-medium whitespace-nowrap">
            Dashboard
          </a>
        </Link>
        <Link href="/bot-builder">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg font-medium whitespace-nowrap">
            Bot Builder
          </a>
        </Link>
        <Link href="/free-bots">
          <a className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium whitespace-nowrap">
            Free Bots
          </a>
        </Link>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h2 className="text-white text-2xl font-bold mb-2">Free Bot Templates</h2>
            <p className="text-gray-400">Pre-configured trading bots ready to use</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {freeBots.map((bot) => (
              <div
                key={bot.id}
                className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="mb-4">
                  <h3 className="text-white font-semibold text-lg mb-2">{bot.name}</h3>
                  <p className="text-gray-400 text-sm">{bot.description}</p>
                </div>

                <div className="flex gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-gray-400">Win Rate:</span>
                    <span className="text-green-500 font-semibold ml-2">{bot.winRate}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Trades:</span>
                    <span className="text-white font-semibold ml-2">{bot.trades}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => {
                      const template = botTemplates.find(t => t.name === bot.name);
                      if (template) loadTemplate(template.xml);
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Load
                  </Button>
                  <Button variant="outline" className="bg-gray-700 text-white border-gray-600 hover:bg-gray-650">
                    <Play className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
