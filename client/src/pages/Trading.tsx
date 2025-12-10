import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDerivWS, ActiveSymbol, Tick, Proposal, Contract } from '@/services/derivWebSocket';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Loader2, DollarSign, Clock } from 'lucide-react';

export default function Trading() {
  const { isAuthenticated, currentAccount, balance, isDemo } = useAuth();
  const [symbols, setSymbols] = useState<ActiveSymbol[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [currentTick, setCurrentTick] = useState<Tick | null>(null);
  const [contractType, setContractType] = useState<'CALL' | 'PUT' | 'TOUCH' | 'NO_TOUCH' | 'EXPIRYRANGE' | 'EXPIRYMISS' | 'DIGITMATCH' | 'DIGITDIFF' | 'DIGITODD' | 'DIGITEVEN' | 'DIGITOVER' | 'DIGITUNDER'>('CALL');
  const [stake, setStake] = useState('10');
  const [duration, setDuration] = useState('5');
  const [durationUnit, setDurationUnit] = useState<'t' | 's' | 'm'>('t');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [buying, setBuying] = useState(false);
  const [openContracts, setOpenContracts] = useState<Contract[]>([]);
  const [barrier, setBarrier] = useState('+0.5');
  const [lastDigitPrediction, setLastDigitPrediction] = useState('0');

  const derivWS = getDerivWS();

  // Load active symbols on mount
  useEffect(() => {
    if (isAuthenticated) {
      loadSymbols();
    }
  }, [isAuthenticated]);

  // Subscribe to ticks when symbol changes
  useEffect(() => {
    if (selectedSymbol) {
      derivWS.subscribeTicks(selectedSymbol, (tick) => {
        setCurrentTick(tick);
      });

      return () => {
        derivWS.unsubscribeTicks();
      };
    }
  }, [selectedSymbol]);

  // Subscribe to portfolio
  useEffect(() => {
    if (isAuthenticated) {
      derivWS.subscribePortfolio((contracts) => {
        setOpenContracts(contracts);
      });

      return () => {
        derivWS.unsubscribePortfolio();
      };
    }
  }, [isAuthenticated]);

  // Proposal Subscription
  useEffect(() => {
    if (selectedSymbol && stake && duration && currentAccount) {
      setLoadingProposal(true);

      // Cleanup previous subscription
      derivWS.unsubscribeProposal();

      // Determine barrier value based on contract type
      let finalBarrier: string | undefined = undefined;

      if (['TOUCH', 'NO_TOUCH', 'EXPIRYRANGE', 'EXPIRYMISS'].includes(contractType)) {
        finalBarrier = barrier;
      } else if (['DIGITMATCH', 'DIGITDIFF'].includes(contractType)) {
        finalBarrier = lastDigitPrediction;
      }

      // Subscribe to new proposal
      derivWS.subscribeProposal({
        contract_type: contractType,
        symbol: selectedSymbol,
        duration: parseInt(duration),
        duration_unit: durationUnit,
        basis: 'stake',
        amount: parseFloat(stake),
        currency: currentAccount.currency,
        barrier: finalBarrier
      }, (newProposal) => {
        setProposal(newProposal);
        setLoadingProposal(false);
      });

      return () => {
        derivWS.unsubscribeProposal();
      };
    }
  }, [selectedSymbol, contractType, stake, duration, durationUnit, currentAccount, barrier, lastDigitPrediction]);

  async function loadSymbols() {
    try {
      const activeSymbols = await derivWS.getActiveSymbols('full');
      // Sort by display order
      const sortedSymbols = activeSymbols.sort((a, b) => a.display_order - b.display_order);
      setSymbols(sortedSymbols);

      // Select first volatility index by default if none selected
      if (!selectedSymbol) {
        const volatilitySymbol = sortedSymbols.find(s => s.market === 'synthetic_index');
        if (volatilitySymbol) {
          setSelectedSymbol(volatilitySymbol.symbol);
        }
      }
    } catch (error) {
      console.error('Failed to load symbols:', error);
      toast.error('Failed to load markets');
    }
  }

  async function handleBuy() {
    if (!proposal || !currentAccount) return;

    try {
      setBuying(true);
      const result = await derivWS.buyContract(proposal.id, proposal.ask_price);

      if (result.buy) {
        toast.success(`Contract ${result.buy.contract_id} purchased!`);
        // No need to refresh proposal manually, subscription handles it
      }
    } catch (error: any) {
      console.error('Failed to buy contract:', error);
      toast.error(error.message || 'Failed to purchase contract');
    } finally {
      setBuying(false);
    }
  }

  async function handleSell(contractId: number, price: number) {
    try {
      const result = await derivWS.sellContract(contractId, price);

      if (result.sell) {
        toast.success(`Contract sold! Profit: ${result.sell.sold_for}`);
      }
    } catch (error: any) {
      console.error('Failed to sell contract:', error);
      toast.error(error.message || 'Failed to sell contract');
    }
  }

  if (!isAuthenticated) {
    // Redirect to login page
    window.location.href = '/login';
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Redirecting to Login...</h2>
          <p className="text-gray-400">Please wait</p>
        </div>
      </div>
    );
  }

  const selectedSymbolData = symbols.find(s => s.symbol === selectedSymbol);
  const marketGroups = symbols.reduce((groups, symbol) => {
    const market = symbol.market_display_name;
    if (!groups[market]) {
      groups[market] = [];
    }
    groups[market].push(symbol);
    return groups;
  }, {} as Record<string, ActiveSymbol[]>);

  return (
    <div className="min-h-screen bg-[#1A1A1A] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trading Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Market Selector */}
            <div className="bg-[#2A2A2A] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white font-semibold mb-4">Select Market</h3>
              <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                <SelectTrigger className="bg-[#1A1A1A] border-gray-700 text-white">
                  <SelectValue placeholder="Choose a market" />
                </SelectTrigger>
                <SelectContent className="bg-[#2A2A2A] border-gray-700 max-h-[400px]">
                  {Object.entries(marketGroups).map(([market, marketSymbols]) => (
                    <div key={market}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 bg-[#333]">
                        {market}
                      </div>
                      {marketSymbols.map((symbol) => (
                        <SelectItem
                          key={symbol.symbol}
                          value={symbol.symbol}
                          className="text-white hover:bg-[#3A3A3A] pl-6"
                        >
                          {symbol.display_name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Current Price */}
            {currentTick && (
              <div className="bg-[#2A2A2A] rounded-xl p-6 border border-gray-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Current Price</p>
                    <p className={`text-3xl font-bold ${proposal?.spot && currentTick.quote > proposal.spot ? 'text-green-500' :
                      proposal?.spot && currentTick.quote < proposal.spot ? 'text-red-500' : 'text-white'
                      }`}>
                      {currentTick.quote.toFixed(selectedSymbolData?.symbol.includes('JPY') ? 3 : 5)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-sm mb-1">Market</p>
                    <p className="text-white font-medium">{selectedSymbolData?.display_name}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Trading Form */}
            <div className="bg-[#2A2A2A] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white font-semibold mb-4">Place Trade</h3>

              <div className="space-y-4">
                {/* Contract Type */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Contract Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { type: 'CALL', label: 'Rise', icon: TrendingUp },
                      { type: 'PUT', label: 'Fall', icon: TrendingDown },
                      { type: 'DIGITMATCH', label: 'Matches', icon: DollarSign },
                      { type: 'DIGITDIFF', label: 'Differs', icon: DollarSign },
                      { type: 'DIGITODD', label: 'Odd', icon: DollarSign },
                      { type: 'DIGITEVEN', label: 'Even', icon: DollarSign },
                      { type: 'DIGITOVER', label: 'Over', icon: TrendingUp },
                      { type: 'DIGITUNDER', label: 'Under', icon: TrendingDown },
                    ].map(({ type, label, icon: Icon }) => (
                      <Button
                        key={type}
                        onClick={() => setContractType(type as any)}
                        variant={contractType === type ? 'default' : 'outline'}
                        className={`h-10 ${contractType === type
                          ? 'bg-[#C026D3] hover:bg-[#A021B3] text-white'
                          : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-gray-300 border-gray-700'
                          }`}
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Stake */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Stake Amount</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="number"
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      className="bg-[#1A1A1A] border-gray-700 text-white pl-10"
                      min="0.35"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Duration</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        type="number"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="bg-[#1A1A1A] border-gray-700 text-white pl-10"
                        min="1"
                      />
                    </div>
                    <Select value={durationUnit} onValueChange={(v: any) => setDurationUnit(v)}>
                      <SelectTrigger className="w-32 bg-[#1A1A1A] border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#2A2A2A] border-gray-700">
                        <SelectItem value="t" className="text-white">Ticks</SelectItem>
                        <SelectItem value="s" className="text-white">Seconds</SelectItem>
                        <SelectItem value="m" className="text-white">Minutes</SelectItem>
                        <SelectItem value="h" className="text-white">Hours</SelectItem>
                        <SelectItem value="d" className="text-white">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Barrier Input */}
                {(contractType === 'TOUCH' || contractType === 'NO_TOUCH' || contractType === 'EXPIRYRANGE' || contractType === 'EXPIRYMISS') && (
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Barrier Offset</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">+/-</span>
                      <Input
                        type="text"
                        value={barrier}
                        onChange={(e) => setBarrier(e.target.value)}
                        className="bg-[#1A1A1A] border-gray-700 text-white pl-10"
                      />
                    </div>
                  </div>
                )}

                {/* Last Digit Prediction (for Matches/Differs) */}
                {(contractType === 'DIGITMATCH' || contractType === 'DIGITDIFF') && (
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Last Digit Prediction</label>
                    <Select value={lastDigitPrediction} onValueChange={setLastDigitPrediction}>
                      <SelectTrigger className="bg-[#1A1A1A] border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#2A2A2A] border-gray-700">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                          <SelectItem key={d} value={d.toString()} className="text-white">{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Proposal Info */}
                {loadingProposal ? (
                  <div className="bg-[#1A1A1A] rounded-lg p-4 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-[#C026D3]" />
                    <span className="text-gray-400 ml-2">Calculating...</span>
                  </div>
                ) : proposal && (
                  <div className="bg-[#1A1A1A] rounded-lg p-4 space-y-2 animate-in fade-in duration-200">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Payout</span>
                      <span className="text-white font-semibold">${proposal.payout.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Profit</span>
                      <span className="text-green-500 font-semibold text-lg">
                        ${(proposal.payout - proposal.ask_price).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Return</span>
                      <span className="text-green-500 font-semibold">
                        {((proposal.payout - proposal.ask_price) / proposal.ask_price * 100).toFixed(2)}%
                      </span>
                    </div>
                    {proposal.spot && (
                      <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
                        <span className="text-gray-400">Enter Spot</span>
                        <span className="text-white">{proposal.spot}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Buy Button */}
                <Button
                  onClick={handleBuy}
                  disabled={!proposal || buying}
                  className="w-full h-14 bg-[#C026D3] hover:bg-[#A021B3] text-white font-bold text-lg shadow-lg shadow-purple-500/20"
                >
                  {buying ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Purchasing...
                    </>
                  ) : (
                    `BUY CONTRACT`
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Open Positions */}
          <div className="space-y-6">
            <div className="bg-[#2A2A2A] rounded-xl p-6 border border-gray-800 h-full flex flex-col">
              <h3 className="text-white font-semibold mb-4">Open Positions</h3>

              {openContracts.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <p>No open positions</p>
                </div>
              ) : (
                <div className="space-y-3 flex-1 overflow-auto max-h-[600px]">
                  {openContracts.map((contract) => (
                    <div
                      key={contract.contract_id}
                      className="bg-[#1A1A1A] rounded-lg p-4 border border-gray-800 relative group hover:border-[#C026D3] transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${contract.is_sold ? (contract.profit >= 0 ? 'bg-green-500' : 'bg-red-500') : 'bg-yellow-500 animate-pulse'
                            }`} />
                          <p className="text-white text-sm font-medium">#{contract.contract_id}</p>
                        </div>
                        <span
                          className={`text-sm font-bold ${contract.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}
                        >
                          {contract.profit >= 0 ? '+' : ''}{contract.profit.toFixed(2)}
                        </span>
                      </div>

                      <p className="text-gray-400 text-xs mb-3 line-clamp-2">{contract.longcode}</p>

                      <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
                        <span>Buy: {contract.buy_price}</span>
                        <span>Payout: {contract.payout}</span>
                      </div>

                      {!contract.is_sold && contract.sell_price && (
                        <Button
                          onClick={() => handleSell(contract.contract_id, contract.sell_price!)}
                          size="sm"
                          className="w-full bg-red-600 hover:bg-red-700 h-8 text-xs mt-2"
                        >
                          Sell at {contract.sell_price}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
