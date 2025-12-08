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
  const [contractType, setContractType] = useState<'CALL' | 'PUT'>('CALL');
  const [stake, setStake] = useState('10');
  const [duration, setDuration] = useState('5');
  const [durationUnit, setDurationUnit] = useState<'t' | 's' | 'm'>('t');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [buying, setBuying] = useState(false);
  const [openContracts, setOpenContracts] = useState<Contract[]>([]);

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

  // Get proposal when parameters change
  useEffect(() => {
    if (selectedSymbol && stake && duration && currentAccount) {
      getProposalPrice();
    }
  }, [selectedSymbol, contractType, stake, duration, durationUnit]);

  async function loadSymbols() {
    try {
      const activeSymbols = await derivWS.getActiveSymbols();
      setSymbols(activeSymbols);
      
      // Select first volatility index by default
      const volatilitySymbol = activeSymbols.find(s => s.market === 'synthetic_index');
      if (volatilitySymbol) {
        setSelectedSymbol(volatilitySymbol.symbol);
      }
    } catch (error) {
      console.error('Failed to load symbols:', error);
      toast.error('Failed to load markets');
    }
  }

  async function getProposalPrice() {
    if (!currentAccount) return;

    try {
      setLoadingProposal(true);
      const proposalData = await derivWS.getProposal({
        contract_type: contractType,
        symbol: selectedSymbol,
        duration: parseInt(duration),
        duration_unit: durationUnit,
        basis: 'stake',
        amount: parseFloat(stake),
        currency: currentAccount.currency,
      });
      setProposal(proposalData);
    } catch (error: any) {
      console.error('Failed to get proposal:', error);
      setProposal(null);
    } finally {
      setLoadingProposal(false);
    }
  }

  async function handleBuy() {
    if (!proposal || !currentAccount) return;

    try {
      setBuying(true);
      const result = await derivWS.buyContract(proposal.id, proposal.ask_price);
      
      if (result.buy) {
        toast.success(`Contract purchased! ID: ${result.buy.contract_id}`);
        // Refresh proposal
        await getProposalPrice();
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
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Please Login</h2>
          <p className="text-gray-400">You need to login to access trading</p>
        </div>
      </div>
    );
  }

  const selectedSymbolData = symbols.find(s => s.symbol === selectedSymbol);

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
                <SelectContent className="bg-[#2A2A2A] border-gray-700">
                  {symbols.map((symbol) => (
                    <SelectItem 
                      key={symbol.symbol} 
                      value={symbol.symbol}
                      className="text-white hover:bg-[#3A3A3A]"
                    >
                      {symbol.display_name} ({symbol.symbol})
                    </SelectItem>
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
                    <p className="text-3xl font-bold text-white">
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
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => setContractType('CALL')}
                      className={`h-12 ${
                        contractType === 'CALL'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-white'
                      }`}
                    >
                      <TrendingUp className="w-5 h-5 mr-2" />
                      Rise
                    </Button>
                    <Button
                      onClick={() => setContractType('PUT')}
                      className={`h-12 ${
                        contractType === 'PUT'
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-[#1A1A1A] hover:bg-[#3A3A3A] text-white'
                      }`}
                    >
                      <TrendingDown className="w-5 h-5 mr-2" />
                      Fall
                    </Button>
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
                      min="1"
                      step="1"
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
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Proposal Info */}
                {loadingProposal ? (
                  <div className="bg-[#1A1A1A] rounded-lg p-4 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-[#C026D3]" />
                    <span className="text-gray-400 ml-2">Calculating...</span>
                  </div>
                ) : proposal ? (
                  <div className="bg-[#1A1A1A] rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Payout</span>
                      <span className="text-white font-semibold">${proposal.payout.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Profit</span>
                      <span className="text-green-500 font-semibold">
                        ${(proposal.payout - proposal.ask_price).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Buy Button */}
                <Button
                  onClick={handleBuy}
                  disabled={!proposal || buying}
                  className="w-full h-12 bg-[#C026D3] hover:bg-[#A021B3] text-white font-semibold"
                >
                  {buying ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Purchasing...
                    </>
                  ) : (
                    `Buy ${contractType === 'CALL' ? 'Rise' : 'Fall'}`
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Open Positions */}
          <div className="space-y-6">
            <div className="bg-[#2A2A2A] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white font-semibold mb-4">Open Positions</h3>
              
              {openContracts.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No open positions</p>
              ) : (
                <div className="space-y-3">
                  {openContracts.map((contract) => (
                    <div
                      key={contract.contract_id}
                      className="bg-[#1A1A1A] rounded-lg p-4 border border-gray-800"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-white text-sm font-medium">
                          Contract #{contract.contract_id}
                        </p>
                        <span
                          className={`text-sm font-semibold ${
                            contract.profit >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}
                        >
                          ${contract.profit.toFixed(2)}
                        </span>
                      </div>
                      
                      <p className="text-gray-400 text-xs mb-3">{contract.longcode}</p>
                      
                      {!contract.is_sold && contract.sell_price && (
                        <Button
                          onClick={() => handleSell(contract.contract_id, contract.sell_price!)}
                          size="sm"
                          className="w-full bg-red-600 hover:bg-red-700"
                        >
                          Sell
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
