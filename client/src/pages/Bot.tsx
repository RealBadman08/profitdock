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
  const [contractType, setContractType] = useState<'CALL' | 'PUT' | 'DIGITMATCH' | 'DIGITDIFF' | 'DIGITODD' | 'DIGITEVEN' | 'DIGITOVER' | 'DIGITUNDER'>('CALL');
  const [strategy, setStrategy] = useState<'martingale' | 'dalembert' | 'oscars_grind' | 'winners_row' | 'compound'>('martingale');
  const [stopLoss, setStopLoss] = useState('50');
  const [takeProfit, setTakeProfit] = useState('100');

  // Advanced Settings
  const [prediction, setPrediction] = useState<number>(0);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState('2.0');
  const [maxStake, setMaxStake] = useState('');

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
      prediction: (contractType.startsWith('DIGIT')) ? prediction : undefined,
      martingaleMultiplier: parseFloat(martingaleMultiplier) || 2.0,
      maxStake: parseFloat(maxStake) || undefined,
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

  const handleExport = () => {
    const config = {
      symbol,
      initialStake,
      duration,
      durationUnit,
      contractType,
      strategy,
      stopLoss,
      takeProfit,
      prediction,
      martingaleMultiplier,
      maxStake
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "bot_strategy.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success('Strategy exported');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (event.target.files && event.target.files[0]) {
      fileReader.readAsText(event.target.files[0], "UTF-8");
      fileReader.onload = (e) => {
        if (e.target?.result) {
          try {
            const parsed = JSON.parse(e.target.result as string);
            setSymbol(parsed.symbol || 'R_100');
            setInitialStake(parsed.initialStake || '10');
            setDuration(parsed.duration || '5');
            setDurationUnit(parsed.durationUnit || 't');
            setContractType(parsed.contractType || 'CALL');
            setStrategy(parsed.strategy || 'martingale');
            setStopLoss(parsed.stopLoss || '50');
            setTakeProfit(parsed.takeProfit || '100');
            setPrediction(parsed.prediction || 0);
            setMartingaleMultiplier(parsed.martingaleMultiplier || '2.0');
            setMaxStake(parsed.maxStake || '');
            toast.success('Strategy imported successfully');
          } catch (err) {
            toast.error('Invalid strategy file');
          }
        }
      };
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-[#151717] border-[#262626] p-8 text-center">
          <div className="w-16 h-16 bg-[#FF444F]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Play className="w-8 h-8 text-[#FF444F]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Bot Access Restricted</h2>
          <p className="text-gray-400 mb-8">
            You must be logged in to configure and run automated trading bots.
          </p>
          <Button
            onClick={() => { window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=114155&l=EN&brand=profitdock`; }}
            className="w-full h-12 text-lg font-bold bg-[#FF444F] hover:bg-[#d43e47] text-white"
          >
            Log in to Continue
          </Button>
        </Card>
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
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Button
                      onClick={() => setContractType('CALL')}
                      disabled={isRunning}
                      className={`h-10 ${contractType === 'CALL'
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
                      className={`h-10 ${contractType === 'PUT'
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-white'
                        }`}
                    >
                      <TrendingDown className="w-4 h-4 mr-2" />
                      Fall
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Button
                      onClick={() => setContractType('DIGITMATCH')}
                      disabled={isRunning}
                      className={`h-10 ${contractType === 'DIGITMATCH'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-white'
                        }`}
                    >
                      Digit Match
                    </Button>
                    <Button
                      onClick={() => setContractType('DIGITDIFF')}
                      disabled={isRunning}
                      className={`h-10 ${contractType === 'DIGITDIFF'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-white'
                        }`}
                    >
                      Digit Differs
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => setContractType('DIGITEVEN')}
                      disabled={isRunning}
                      className={`h-10 ${contractType === 'DIGITEVEN'
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-white'
                        }`}
                    >
                      Digit Even
                    </Button>
                    <Button
                      onClick={() => setContractType('DIGITODD')}
                      disabled={isRunning}
                      className={`h-10 ${contractType === 'DIGITODD'
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-white'
                        }`}
                    >
                      Digit Odd
                    </Button>
                  </div>
                </div>

                {/* Prediction (Only for Digit Match/Differs) */}
                {(contractType === 'DIGITMATCH' || contractType === 'DIGITDIFF' || contractType === 'DIGITOVER' || contractType === 'DIGITUNDER') && (
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Last Digit Prediction</label>
                    <Select value={prediction?.toString()} onValueChange={(v) => setPrediction(parseInt(v))} disabled={isRunning}>
                      <SelectTrigger className="bg-[#1A1A1A] border-gray-700 text-white">
                        <SelectValue placeholder="Select Digit" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#2A2A2A] border-gray-700">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                          <SelectItem key={num} value={num.toString()} className="text-white">{num}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}


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
                      <SelectItem value="winners_row" className="text-white">Winner's Row</SelectItem>
                      <SelectItem value="compound" className="text-white">Compound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Advanced Risk Settings */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Martingale Multiplier</label>
                    <Input
                      type="number"
                      value={martingaleMultiplier}
                      onChange={(e) => setMartingaleMultiplier(e.target.value)}
                      disabled={isRunning || strategy !== 'martingale'}
                      className="bg-[#1A1A1A] border-gray-700 text-white"
                      placeholder="2.0"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Max Stake Limit</label>
                    <Input
                      type="number"
                      value={maxStake}
                      onChange={(e) => setMaxStake(e.target.value)}
                      disabled={isRunning}
                      className="bg-[#1A1A1A] border-gray-700 text-white"
                      placeholder="Optional"
                    />
                  </div>
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

                <div className="flex gap-3 mb-4">
                  <Button variant="outline" onClick={handleExport} className="flex-1 border-gray-700 text-white hover:bg-[#3A3A3A]">
                    Export Strategy
                  </Button>
                  <div className="flex-1 relative">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImport}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" className="w-full border-gray-700 text-white hover:bg-[#3A3A3A]">
                      Import Strategy
                    </Button>
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
                        className={`font-semibold ${trade.won ? 'text-green-500' : 'text-red-500'
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
                    className={`text-2xl font-bold ${stats.profit >= 0 ? 'text-green-500' : 'text-red-500'
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
