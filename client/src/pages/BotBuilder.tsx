import { useState, useRef } from "react";
import { BotEngine } from "@/services/botEngine";
import BotConfigDialog from "@/components/BotConfigDialog";
import BlocklyWorkspace from "@/components/BlocklyWorkspace";
import { useDeriv } from "@/contexts/DerivContext";
// import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MessageCircle,
  RefreshCw,
  ChevronDown,
  Play,
  Save,
  Upload,
  Download
} from "lucide-react";
import { Link } from "wouter";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function BotBuilder() {
  const { balance, accountType } = useDeriv();
  const [botRunning, setBotRunning] = useState(false);
  const [botStatus, setBotStatus] = useState<'stopped' | 'running' | 'paused'>('stopped');
  const [activeTab, setActiveTab] = useState("summary");
  const [stats, setStats] = useState({
    totalStake: 0,
    totalPayout: 0,
    runs: 0,
    lost: 0,
    won: 0,
    profit: 0,
  });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [profitHistory, setProfitHistory] = useState<{ time: number, profit: number }[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  // const createSession = trpc.botSessions.create.useMutation();
  // const updateSession = trpc.botSessions.update.useMutation();

  // Update profit history when stats change
  const updateProfitHistory = (newStats: typeof stats) => {
    setProfitHistory(prev => [
      ...prev,
      { time: Date.now(), profit: newStats.profit }
    ].slice(-20)); // Keep last 20 data points
  };
  const botEngineRef = useRef<BotEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [botConfig, setBotConfig] = useState({
    market: 'R_100',
    stake: 1,
    duration: 5,
    contractType: 'CALL' as 'CALL' | 'PUT' | 'CALLE' | 'PUTE',
  });

  const handleExport = () => {
    const xml = localStorage.getItem('bot_config');
    if (!xml) {
      alert('No bot configuration to export');
      return;
    }

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profitdock-bot-${Date.now()}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const xml = e.target?.result as string;
      localStorage.setItem('bot_config', xml);
      window.location.reload(); // Reload to load the new bot
    };
    reader.readAsText(file);
  };

  const handleRunBot = async () => {
    if (botRunning) {
      // Stop bot
      botEngineRef.current?.stop();
      setBotRunning(false);
      setBotStatus('stopped');

      // Update final session status locally if needed
      if (currentSessionId) {
        // localStorage logic here if tracking sessions list
        setCurrentSessionId(null);
      }
    } else {
      // Show configuration dialog first
      setShowConfigDialog(true);
    }
  };

  const handlePauseResume = () => {
    if (botStatus === 'paused') {
      botEngineRef.current?.resume();
      setBotStatus('running');
    } else {
      botEngineRef.current?.pause();
      setBotStatus('paused');
    }
  };


  const startBot = async () => {
    const apiToken = localStorage.getItem('deriv_token');
    if (!apiToken) {
      alert('Please login with Deriv first');
      return;
    }

    // Generate a local session ID
    const newSessionId = Date.now();
    setCurrentSessionId(newSessionId);

    const engine = new BotEngine(apiToken);
    engine.setCallbacks(
      (newStats) => {
        setStats(newStats);
        updateProfitHistory(newStats);
        // Stats are local only for now
      },
      (trade) => setTransactions(prev => [trade, ...prev])
    );

    // Generate Code from Blocks
    let generatedCode = '';
    try {
      if (window.Blockly) {
        // Ensure generators are init
        const { initBlocklyGenerators } = await import('@/services/blocklyGenerators');
        initBlocklyGenerators();

        // Generate
        const workspace = Blockly.getMainWorkspace();
        // Note: In React we might need reference. 
        // But Blockly.getMainWorkspace() usually works if only 1 workspace.

        const { javascriptGenerator } = await import('blockly/javascript');
        generatedCode = javascriptGenerator.workspaceToCode(workspace);
        console.log("GENERATED CODE:\n", generatedCode);
      }
    } catch (e) {
      console.error("Code generation failed:", e);
    }

    try {
      // Loop wrapper
      // We wrap the generated code in a loop so it runs continuously
      const robustCode = `
         while(bot.isRunning()) {
             await bot.sleep(1000); // 1s tick check
             // User logic
             ${generatedCode}
         }
      `;

      await engine.start({
        xml: localStorage.getItem('bot_config') || '',
        ...botConfig,
      }, robustCode);

      botEngineRef.current = engine;
      setBotRunning(true);
      setBotStatus('running');
    } catch (error) {
      console.error('Failed to start bot:', error);
      alert('Failed to start bot: ' + (error as Error).message);
    }
  };

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
              <span className="text-cyan-400">PROFIT</span>
              <span className="text-fuchsia-600">DOCK</span>
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
          <a className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium whitespace-nowrap">
            Bot Builder
          </a>
        </Link>
        <Link href="/free-bots">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg font-medium whitespace-nowrap">
            Free Bots
          </a>
        </Link>
      </nav>

      {/* Main Content - Split View */}
      <div className="flex-1 flex">
        {/* Bot Builder Canvas */}
        <div className="flex-1 bg-gray-850 p-4">
          <div className="bg-gray-800 rounded-lg h-full p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-lg">Visual Bot Builder</h2>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button onClick={handleImport} size="sm" variant="outline" className="bg-gray-700 text-white border-gray-600">
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <Button onClick={handleExport} size="sm" variant="outline" className="bg-gray-700 text-white border-gray-600">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>

            {/* Blockly Workspace */}
            <div className="bg-gray-900 rounded-lg h-[calc(100%-60px)]">
              <BlocklyWorkspace
                onWorkspaceChange={(xml) => {
                  // Store bot configuration
                  localStorage.setItem('bot_config', xml);
                }}
                initialXml={localStorage.getItem('bot_config') || undefined}
              />
            </div>
          </div>
        </div>

        {/* Right Sidebar - Blocks Menu & Stats */}
        <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
          {/* Stats Panel Only - Blocks Menu Removed */}


          {/* Stats Panel */}
          <div className="border-t border-gray-700 p-4">
            <div className="flex gap-2 mb-4">
              {["Summary", "Transactions", "Journal"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase())}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded ${activeTab === tab.toLowerCase()
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-650"
                    }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "summary" && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total stake</span>
                  <span className="text-white font-medium">{stats.totalStake.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total payout</span>
                  <span className="text-white font-medium">{stats.totalPayout.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">No. of runs</span>
                  <span className="text-white font-medium">{stats.runs}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Contracts won</span>
                  <span className="text-green-500 font-medium">{stats.won}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Contracts lost</span>
                  <span className="text-red-500 font-medium">{stats.lost}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-gray-700">
                  <span className="text-gray-400 font-semibold">Total profit/loss</span>
                  <span className={`font-bold ${stats.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {stats.profit >= 0 ? '+' : ''}{stats.profit.toFixed(2)} USD
                  </span>
                </div>
              </div>
            )}

            {activeTab === "transactions" && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {transactions.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <p>No transactions yet</p>
                    <p className="text-sm mt-2">Run your bot to see transactions</p>
                  </div>
                ) : (
                  transactions.map((trade, index) => (
                    <div key={index} className="bg-gray-700 rounded p-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-300">{trade.contractType}</span>
                        <span className={trade.result === 'win' ? 'text-green-500' : trade.result === 'loss' ? 'text-red-500' : 'text-yellow-500'}>
                          {trade.result.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-gray-400">Stake: ${trade.stake.toFixed(2)}</span>
                        <span className="text-gray-400">Payout: ${trade.payout.toFixed(2)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            {activeTab === "chart" && (
              <div className="space-y-4">
                {/* Profit/Loss Line Chart */}
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="text-white text-xs font-semibold mb-2">Cumulative Profit</h4>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={profitHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                      <XAxis dataKey="time" hide />
                      <YAxis stroke="#888" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Win/Loss Pie Chart */}
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="text-white text-xs font-semibold mb-2">Win/Loss Distribution</h4>
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Won', value: stats.won },
                          { name: 'Lost', value: stats.lost },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={50}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-4 flex items-center justify-between">
        <Button className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold">
          ⚠ Risk Disclaimer
        </Button>

        <div className="flex items-center gap-4">
          <div className="text-white">
            <span className="text-gray-400">Bot status:</span>{" "}
            <span className={
              botStatus === 'running' ? "text-green-500" :
                botStatus === 'paused' ? "text-yellow-500" :
                  "text-gray-400"
            }>
              {botStatus === 'running' ? 'Running' : botStatus === 'paused' ? 'Paused' : 'Not running'}
            </span>
          </div>
          <div className="flex gap-2">
            {botRunning && (
              <Button
                onClick={handlePauseResume}
                className="px-6 bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                {botStatus === 'paused' ? '▶ Resume' : '⏸ Pause'}
              </Button>
            )}
            <Button
              onClick={handleRunBot}
              className={`px-8 ${botRunning
                ? "bg-red-600 hover:bg-red-700"
                : "bg-green-600 hover:bg-green-700"
                } text-white`}
            >
              {botRunning ? "⏹ Stop" : "▶ Run"}
            </Button>
          </div>
        </div>
      </div>

      {/* Bot Configuration Dialog */}
      <BotConfigDialog
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        onSave={(config) => {
          setBotConfig(config);
          startBot();
        }}
        initialConfig={botConfig}
      />
    </div>
  );
}
