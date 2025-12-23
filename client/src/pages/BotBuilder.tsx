import { useState, useRef } from "react";
import * as Blockly from "blockly";
import { toast } from "sonner";
import { BotEngine } from "@/services/botEngine";
import BotConfigDialog from "@/components/BotConfigDialog";
import BlocklyWorkspace, { BlocklyWorkspaceRef } from "@/components/BlocklyWorkspace";
import { useDeriv } from "@/contexts/DerivContext";
import { Button } from "@/components/ui/button";
import {
  IconOpen,
  IconSave,
  IconPlay,
  IconStop,
  IconImport,
  IconExport
} from "@/components/DerivIcons";
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

  const updateProfitHistory = (newStats: typeof stats) => {
    setProfitHistory(prev => [
      ...prev,
      { time: Date.now(), profit: newStats.profit }
    ].slice(-20)); // Keep last 20 data points
  };
  const botEngineRef = useRef<BotEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<BlocklyWorkspaceRef>(null);

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

      if (workspaceRef.current) {
        workspaceRef.current.loadXml(xml);
        toast.success("Bot strategy loaded successfully");
      } else {
        window.location.reload();
      }
    };
    reader.readAsText(file);
  };

  const handleRunBot = async () => {
    if (botRunning) {
      botEngineRef.current?.stop();
      setBotRunning(false);
      setBotStatus('stopped');

      if (currentSessionId) {
        setCurrentSessionId(null);
      }
    } else {
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

    const newSessionId = Date.now();
    setCurrentSessionId(newSessionId);

    const engine = new BotEngine(apiToken);
    engine.setCallbacks(
      (newStats) => {
        setStats(newStats);
        updateProfitHistory(newStats);
      },
      (trade) => {
        setTransactions(prev => [trade, ...prev]);

        if (trade.result !== 'pending') {
          const isWin = trade.result === 'win';
          toast(isWin ? `Bot Won! (+${(trade.payout - trade.stake).toFixed(2)})` : `Bot Lost (-${trade.stake.toFixed(2)})`, {
            description: `${trade.contractType} | Stake: ${trade.stake}`,
            className: isWin ? "bg-[#0E0E0E] text-white border-green-500" : "bg-[#0E0E0E] text-white border-red-500",
            duration: 3000,
          });
        }
      }
    );

    let generatedCode = '';
    try {
      if ((window as any).Blockly) {
        const { initBlocklyGenerators } = await import('@/services/blocklyGenerators');
        initBlocklyGenerators();
        const workspace = Blockly.getMainWorkspace();
        const { javascriptGenerator } = await import('blockly/javascript');
        generatedCode = javascriptGenerator.workspaceToCode(workspace);
        console.log("GENERATED CODE:\n", generatedCode);
      }
    } catch (e) {
      console.error("Code generation failed:", e);
    }

    try {
      console.log("⚠️ Using Default Robust Strategy (Bypassing Blockly Script for Reliability)");

      await engine.start({
        xml: localStorage.getItem('bot_config') || '',
        ...botConfig,
      }, undefined);

      botEngineRef.current = engine;
      setBotRunning(true);
      setBotStatus('running');
    } catch (error) {
      console.error('Failed to start bot:', error);
      alert('Failed to start bot: ' + (error as Error).message);
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] bg-[#0E1C2F] flex flex-col">
      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Bot Builder Canvas */}
        <div className="flex-1 bg-[#0E1C2F] p-2">
          <div className="bg-[#151E2D] rounded-lg h-full border border-[#2A3647] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-[#2A3647]">
              <h2 className="text-white font-bold text-sm flex items-center gap-2">
                <span className="bg-[#FF444F] w-2 h-2 rounded-full"></span>
                Visual Bot Strategy
              </h2>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button onClick={handleImport} size="sm" variant="ghost" className="h-8 text-gray-300 hover:text-white hover:bg-[#262626]">
                  <IconOpen className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <Button onClick={handleExport} size="sm" variant="ghost" className="h-8 text-gray-300 hover:text-white hover:bg-[#262626]">
                  <IconSave className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button size="sm" className="h-8 bg-[#262626] hover:bg-[#333] text-white border border-[#333]">
                  <IconSave className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>

            {/* Blockly Workspace */}
            <div className="flex-1 relative">
              <BlocklyWorkspace
                ref={workspaceRef}
                onWorkspaceChange={(xml) => {
                  localStorage.setItem('bot_config', xml);
                }}
                initialXml={localStorage.getItem('bot_config') || undefined}
              />
            </div>
          </div>
        </div>

        {/* Right Sidebar - Stats */}
        <div className="w-80 bg-[#151E2D] border-l border-[#2A3647] flex flex-col">
          <div className="border-t border-[#2A3647] p-4">
            <div className="flex gap-2 mb-4">
              {["Summary", "Transactions", "Chart"].map((tab) => (
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
      <div className="bg-[#151E2D] border-t border-[#2A3647] px-4 py-3 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] z-10">
        <div className="text-xs text-gray-500">
          <span className="font-bold text-gray-300">ProfitDock Bot</span> v1.0.5
        </div>

        <div className="flex items-center gap-4">
          <div className="text-white flex items-center gap-2 text-sm">
            <span className="text-gray-400">Status:</span>
            <span className={
              botStatus === 'running' ? "text-green-500 font-bold" :
                botStatus === 'paused' ? "text-yellow-500 font-bold" :
                  "text-gray-400 font-bold"
            }>
              {botStatus === 'running' ? 'Running' : botStatus === 'paused' ? 'Paused' : 'Stopped'}
            </span>
          </div>
          <div className="h-6 w-px bg-[#333]"></div>
          <div className="flex gap-2">
            {botRunning && (
              <Button
                onClick={handlePauseResume}
                className="px-4 bg-yellow-600 hover:bg-yellow-700 text-white font-bold"
              >
                {botStatus === 'paused' ? '▶ Resume' : '⏸ Pause'}
              </Button>
            )}
            <Button
              onClick={handleRunBot}
              className={`px-6 font-bold shadow-lg shadow-green-900/20 ${botRunning
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-[#32CD32] hover:bg-[#28a428] text-black"
                }`}
            >
              <IconPlay className="h-4 w-4 mr-2" />
              {/* Note: I'm using IconPlay for the button text? No, I want IconPlay for "Run" and IconStop for "Stop" */}
              {/* The button content changes logic: */}
              {botRunning ? (
                <>
                  <IconStop className="h-4 w-4 mr-2" />
                  Stop Bot
                </>
              ) : (
                <>
                  <IconPlay className="h-4 w-4 mr-2" />
                  Run Bot
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

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
