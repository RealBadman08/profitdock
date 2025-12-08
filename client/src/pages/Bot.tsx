import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BotRunner, BotConfig, BotStats } from '@/services/botRunner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Play, Pause, Square, TrendingUp, TrendingDown } from 'lucide-react';

export default function Bot() {
  const { isAuthenticated, currentAccount } = useAuth();
  const [botRunner, setBotRunner] = useState<BotRunner | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Bot configuration
  const [symbol, setSymbol] = useState('R_100');
  const [initialStake, setInitialStake] = useState('10');
  const [duration, setDuration] = useState('5');
  const [durationUnit, setDurationUnit] = useState<'t' | 's' | 'm'>('t');
  const [contractType, setContractType] = useState<'CALL' | 'PUT'>('CALL');
  const [strategy, setStrategy] = useState<'martingale' | 'dalembert' | 'oscars_grind'>('martingale');
  const [stopLoss, setStopLoss] = useState('50');
  const [takeProfit, setTakeProfit] = useState('100');

  // Bot stats
  const [stats, setStats] = useState<BotStats>({
    runs: 0,
    won: 0,
    lost: 0,
    totalStake: 0,
    totalPayout: 0,
    profit: 0,
  });

  // Recent trades
  const [trades, setTrades] = useState<any[]>([]);

  function handleStart() {
    if (!currentAccount) {
      toast.error('Please login first');
      return;
    }

    const config: BotConfig = {
      symbol,
      initialStake: parseFloat(initialStake),
      duration: parseInt(duration),
      durationUnit,
      contractType,
      strategy,
      stopLoss: parseFloat(stopLoss) || undefined,
      takeProfit: parseFloat(takeProfit) || undefined,
      currency: currentAccount.currency,
    };

    const runner = new BotRunner(config);
    
    runner.setCallbacks(
      (newStats) => setStats(newStats),
      (trade) => setTrades((prev) => [trade, ...prev].slice(0, 10))
    );

    setBotRunner(runner);
    setIsRunning(true);
    setIsPaused(false);

    runner.start().then(() => {
      setIsRunning(false);
      setIsPaused(false);
      toast.success('Bot finished running');
    });

    toast.success('Bot started!');
  }

  function handlePause() {
    if (botRunner) {
      botRunner.pause();
      setIsPaused(true);
      toast.info('Bot paused');
    }
  }

  function handleResume() {
    if (botRunner) {
      botRunner.resume();
      setIsPaused(false);
      toast.info('Bot resumed');
    }
  }

  function handleStop() {
    if (botRunner) {
      botRunner.stop();
      setIsRunning(false);
      setIsPaused(false);
      toast.success('Bot stopped');
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Please Login</h2>
          <p className="text-gray-400">You need to login to use the bot</p>
        </div>
      </div>
    );
  }

  const winRate = stats.runs > 0 ? (stats.won / stats.runs) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#1A1A1A] p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Trading Bot</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bot Configuration */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-[#2A2A2A] border-gray-800 p-6">
              <h3 className="text-white font-semibold mb-4">Bot Configuration</h3>

              <div className="space-y-4">
                {/* Symbol */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Market Symbol</label>
                  <Select value={symbol} onValueChange={setSymbol} disabled={isRunning}>
                    <SelectTrigger className="bg-[#1A1A1A] border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#2A2A2A] border-gray-700">
                      <SelectItem value="R_100" className="text-white">Volatility 100 Index</SelectItem>
                      <SelectItem value="R_50" className="text-white">Volatility 50 Index</SelectItem>
                      <SelectItem value="R_25" className="text-white">Volatility 25 Index</SelectItem>
                      <SelectItem value="R_10" className="text-white">Volatility 10 Index</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Contract Type */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Contract Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => setContractType('CALL')}
                      disabled={isRunning}
                      className={`h-10 ${
                        contractType === 'CALL'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-white'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Rise
                    </Button>
                    <Button
                      onClick={() => setContractType('PUT')}
                      disabled={isRunning}
                      className={`h-10 ${
                        contractType === 'PUT'
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-white'
                      }`}
                    >
                      <TrendingDown className="w-4 h-4 mr-2" />
                      Fall
                    </Button>
                  </div>
                </div>

                {/* Initial Stake */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Initial Stake</label>
                  <Input
                    type="number"
                    value={initialStake}
                    onChange={(e) => setInitialStake(e.target.value)}
                    disabled={isRunning}
                    className="bg-[#1A1A1A] border-gray-700 text-white"
                    min="1"
                  />
                </div>

                {/* Duration */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Duration</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      disabled={isRunning}
                      className="bg-[#1A1A1A] border-gray-700 text-white flex-1"
                      min="1"
                    />
                    <Select value={durationUnit} onValueChange={(v: any) => setDurationUnit(v)} disabled={isRunning}>
                      <SelectTrigger className="w-32 bg-[#1A1A1A] border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#2A2A2A] border-gray-700">
                        <SelectItem value="t" className="text-white">Ticks</SelectItem>
                        <SelectItem value="s" className="text-white">Seconds</SelectItem>
                        <SelectItem value="m" className="text-white">Minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Strategy */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Strategy</label>
                  <Select value={strategy} onValueChange={(v: any) => setStrategy(v)} disabled={isRunning}>
                    <SelectTrigger className="bg-[#1A1A1A] border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#2A2A2A] border-gray-700">
                      <SelectItem value="martingale" className="text-white">Martingale</SelectItem>
                      <SelectItem value="dalembert" className="text-white">D'Alembert</SelectItem>
                      <SelectItem value="oscars_grind" className="text-white">Oscar's Grind</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Stop Loss / Take Profit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Stop Loss</label>
                    <Input
                      type="number"
                      value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                      disabled={isRunning}
                      className="bg-[#1A1A1A] border-gray-700 text-white"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Take Profit</label>
                    <Input
                      type="number"
                      value={takeProfit}
                      onChange={(e) => setTakeProfit(e.target.value)}
                      disabled={isRunning}
                      className="bg-[#1A1A1A] border-gray-700 text-white"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                {/* Control Buttons */}
                <div className="flex gap-3 pt-4">
                  {!isRunning ? (
                    <Button
                      onClick={handleStart}
                      className="flex-1 h-12 bg-[#C026D3] hover:bg-[#A021B3] text-white font-semibold"
                    >
                      <Play className="w-5 h-5 mr-2" />
                      Start Bot
                    </Button>
                  ) : (
                    <>
                      {!isPaused ? (
                        <Button
                          onClick={handlePause}
                          className="flex-1 h-12 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold"
                        >
                          <Pause className="w-5 h-5 mr-2" />
                          Pause
                        </Button>
                      ) : (
                        <Button
                          onClick={handleResume}
                          className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white font-semibold"
                        >
                          <Play className="w-5 h-5 mr-2" />
                          Resume
                        </Button>
                      )}
                      <Button
                        onClick={handleStop}
                        className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white font-semibold"
                      >
                        <Square className="w-5 h-5 mr-2" />
                        Stop
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>

            {/* Recent Trades */}
            <Card className="bg-[#2A2A2A] border-gray-800 p-6">
              <h3 className="text-white font-semibold mb-4">Recent Trades</h3>
              
              {trades.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No trades yet</p>
              ) : (
                <div className="space-y-2">
                  {trades.map((trade, index) => (
                    <div
                      key={index}
                      className="bg-[#1A1A1A] rounded-lg p-3 flex justify-between items-center"
                    >
                      <div>
                        <p className="text-white text-sm">Contract #{trade.contractId}</p>
                        <p className="text-gray-400 text-xs">Stake: ${trade.stake.toFixed(2)}</p>
                      </div>
                      <span
                        className={`font-semibold ${
                          trade.won ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        {trade.won ? '+' : ''}${trade.profit.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Bot Stats */}
          <div className="space-y-6">
            <Card className="bg-[#2A2A2A] border-gray-800 p-6">
              <h3 className="text-white font-semibold mb-4">Bot Statistics</h3>

              <div className="space-y-4">
                <div>
                  <p className="text-gray-400 text-sm">Total Runs</p>
                  <p className="text-2xl font-bold text-white">{stats.runs}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-sm">Won</p>
                    <p className="text-xl font-semibold text-green-500">{stats.won}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Lost</p>
                    <p className="text-xl font-semibold text-red-500">{stats.lost}</p>
                  </div>
                </div>

                <div>
                  <p className="text-gray-400 text-sm">Win Rate</p>
                  <p className="text-2xl font-bold text-white">{winRate.toFixed(1)}%</p>
                </div>

                <div>
                  <p className="text-gray-400 text-sm">Total Profit/Loss</p>
                  <p
                    className={`text-2xl font-bold ${
                      stats.profit >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    ${stats.profit.toFixed(2)}
                  </p>
                </div>

                <div>
                  <p className="text-gray-400 text-sm">Total Stake</p>
                  <p className="text-xl font-semibold text-white">${stats.totalStake.toFixed(2)}</p>
                </div>

                <div>
                  <p className="text-gray-400 text-sm">Total Payout</p>
                  <p className="text-xl font-semibold text-white">${stats.totalPayout.toFixed(2)}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
