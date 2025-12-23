import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDerivWS, ActiveSymbol, Tick, Proposal, Contract } from '@/services/derivWebSocket';
import NativeChart from '@/components/NativeChart';
import AssetSidebar from '@/components/AssetSidebar';
import ChartToolbar from '@/components/ChartToolbar';
import Link from "wouter";
import ChartHeader from '@/components/ChartHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Loader2, DollarSign, Clock, ChevronUp, ChevronDown, Plus, Minus, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type TradeMode = 'RISE_FALL' | 'TOUCH' | 'DIGITS';

export default function Trading() {
  const { isAuthenticated, currentAccount, displayBalance, freezeBalance, unfreezeBalance } = useAuth();
  const [symbols, setSymbols] = useState<ActiveSymbol[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');

  // Market Data
  const [currentTick, setCurrentTick] = useState<Tick | null>(null);
  const [prevTick, setPrevTick] = useState<number | null>(null); // For tick coloring

  // Trading State
  const [tradeMode, setTradeMode] = useState<TradeMode>('RISE_FALL');
  const [stake, setStake] = useState('10');
  const [duration, setDuration] = useState('5');
  const [durationUnit, setDurationUnit] = useState<'t' | 's' | 'm'>('t');
  const [prediction, setPrediction] = useState(0); // For digits
  const [loadingProposal, setLoadingProposal] = useState(false);

  // Proposals (Dual Stream)
  const [proposalCall, setProposalCall] = useState<Proposal | null>(null);
  const [proposalPut, setProposalPut] = useState<Proposal | null>(null);

  // Execution
  const [buying, setBuying] = useState(false);
  const [openContracts, setOpenContracts] = useState<Contract[]>([]);
  const [positionsOpen, setPositionsOpen] = useState(true);

  const derivWS = getDerivWS();

  // Load active symbols
  useEffect(() => {
    if (isAuthenticated) {
      loadSymbols();
    }
  }, [isAuthenticated]);

  // Subscribe to ticks
  useEffect(() => {
    if (selectedSymbol) {
      derivWS.subscribeTicks(selectedSymbol, (tick) => {
        setPrevTick(prev => tick.quote);
        setCurrentTick(tick);
      });
      return () => derivWS.unsubscribeTicks();
    }
  }, [selectedSymbol]);

  // Subscribe to Portfolio
  useEffect(() => {
    if (isAuthenticated) {
      derivWS.subscribePortfolio(setOpenContracts);
      return () => derivWS.unsubscribePortfolio();
    }
  }, [isAuthenticated]);


  // Dual Proposal Subscription (The "Deriv Smell")
  useEffect(() => {
    if (selectedSymbol && stake && duration && currentAccount) {
      // Clear previous
      setProposalCall(null);
      setProposalPut(null);
      setLoadingProposal(true);
      derivWS.unsubscribeProposal();

      const commonParams = {
        symbol: selectedSymbol,
        duration: parseInt(duration),
        duration_unit: durationUnit,
        basis: 'stake',
        amount: parseFloat(stake),
        currency: currentAccount.currency,
      };

      if (tradeMode === 'RISE_FALL') {
        // Subscribe CALL
        derivWS.subscribeProposal({
          ...commonParams,
          contract_type: 'CALL',
        }, (p) => {
          setProposalCall(p);
          setLoadingProposal(false);
        });

        // Subscribe PUT
        derivWS.subscribeProposal({
          ...commonParams,
          contract_type: 'PUT',
        }, (p) => {
          setProposalPut(p);
          setLoadingProposal(false);
        });
      } else if (tradeMode === 'DIGITS') {
        // Subscribe MATCHES
        derivWS.subscribeProposal({
          ...commonParams,
          contract_type: 'DIGITMATCH',
          barrier: String(prediction),
        }, (p) => {
          setProposalCall(p); // Reuse ProposalCall state for Matches
          setLoadingProposal(false);
        });

        // Subscribe DIFFERS
        derivWS.subscribeProposal({
          ...commonParams,
          contract_type: 'DIGITDIFF',
          barrier: String(prediction),
        }, (p) => {
          setProposalPut(p); // Reuse ProposalPut state for Differs
          setLoadingProposal(false);
        });
      }

      return () => derivWS.unsubscribeProposal();
    }
  }, [selectedSymbol, tradeMode, stake, duration, durationUnit, currentAccount, prediction]);


  async function loadSymbols() {
    try {
      const activeSymbols = await derivWS.getActiveSymbols('full');
      const sortedSymbols = activeSymbols.sort((a, b) => a.display_order - b.display_order);
      setSymbols(sortedSymbols);
      if (!selectedSymbol) {
        const volatility = sortedSymbols.find(s => s.symbol === 'R_100');
        setSelectedSymbol(volatility?.symbol || activeSymbols[0].symbol);
      }
    } catch (e) {
      toast.error('Connection failed. Retrying...');
    } finally {
      setInitializing(false);
    }
  }

  async function handleBuy(proposal: Proposal | null) {
    console.log('🔥 handleBuy called with:', { proposal, currentAccount });

    if (!proposal || !currentAccount) {
      console.warn('⚠️ handleBuy early return:', { hasProposal: !!proposal, hasAccount: !!currentAccount });
      return;
    }

    try {
      console.log('💰 Attempting to buy contract:', { proposalId: proposal.id, price: proposal.ask_price });
      setBuying(true);

      // Freeze balance immediately before purchase
      freezeBalance();

      const result = await derivWS.buyContract(proposal.id, proposal.ask_price);
      console.log('✅ Buy result:', result);

      if (result.buy) {
        const contractId = result.buy.contract_id;
        toast.success('Contract Purchased', {
          description: `Reference ID: ${contractId}`,
          className: "bg-[#0E0E0E] text-white border-green-500"
        });

        // Track the contract until it closes
        derivWS.subscribeProposalOpenContract(contractId, (contract) => {
          if (contract.is_sold) {
            // Contract Finished - UNFREEZE balance now
            unfreezeBalance();

            const profit = contract.profit;
            const isWin = profit > 0;

            toast(isWin ? 'Crushing it! (+)' : 'Contract Sold (-)', {
              description: (
                <div className="flex flex-col gap-1">
                  <div className="font-bold">{isWin ? 'WIN' : 'LOSS'}</div>
                  <div>Profit: <span className={isWin ? "text-green-500" : "text-red-500"}>{profit > 0 ? '+' : ''}{profit.toFixed(2)} USD</span></div>
                  <div className="text-xs text-gray-400">Payout: {contract.payout} USD</div>
                </div>
              ),
              className: isWin ? "bg-[#0E0E0E] text-white border-green-500" : "bg-[#0E0E0E] text-white border-red-500",
              duration: 5000,
            });

            // Stop listening to this contract
            derivWS.unsubscribeProposalOpenContract(contractId);

            // Refresh portfolio
            derivWS.subscribePortfolio(setOpenContracts);
          }
        });
      } else {
        // If buy failed, unfreeze balance
        unfreezeBalance();
        console.error('❌ No buy object in result:', result);
        toast.error('Purchase Failed', { description: 'No contract returned' });
      }
    } catch (error: any) {
      // If error, unfreeze balance
      unfreezeBalance();
      console.error('❌ handleBuy error:', error);
      toast.error('Purchase Failed', { description: error.message || 'Unknown error' });
    } finally {
      setBuying(false);
    }
  }

  async function handleSell(id: number, price: number) {
    try {
      await derivWS.sellContract(id, price);
      // Toast handled by the listener above (is_sold will become true)
    } catch (e) { }
  }


  // Helper for Symbol Groups
  const marketGroups = symbols.reduce((acc, s) => {
    if (!acc[s.market_display_name]) acc[s.market_display_name] = [];
    acc[s.market_display_name].push(s);
    return acc;
  }, {} as Record<string, ActiveSymbol[]>);


  if (initializing && isAuthenticated) {
    return (
      <div className="h-[calc(100vh-48px)] flex items-center justify-center bg-[#0E0E0E]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-[#FF444F] animate-spin" />
          <span className="text-gray-400 animate-pulse">Loading DTrader...</span>
        </div>
      </div>
    );
  }

  // ... (Keep Auth check)

  return (
    <div className="h-full flex flex-col lg:flex-row bg-[#0E1C2F] text-white font-sans overflow-hidden">

      {/* 1. Main Chart Area */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-[#2A3647] relative">

        {/* TOP BAR: Chart Header (Symbol, Price) */}
        <ChartHeader
          symbol={selectedSymbol}
          onSymbolChange={setSelectedSymbol}
          symbols={symbols}
          tick={currentTick}
          prevTick={prevTick}
        />

        {initializing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0E1C2F] z-10">
            <Loader2 className="w-10 h-10 text-[#FF444F] animate-spin mb-4" />
            <span className="text-gray-400 animate-pulse">Loading Markets...</span>
          </div>
        ) : (
          <NativeChart symbol={selectedSymbol} hideControls={true} height={600} />
        )}

        {/* Positions Drawer - Styled for Navy */}
        <div className={cn("absolute bottom-0 left-0 right-0 bg-[#151E2D] border-t border-[#2A3647] transition-all z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]", positionsOpen ? "h-64" : "h-10")}>
          <div className="h-10 flex items-center justify-between px-4 cursor-pointer hover:bg-[#1D2736] transition-colors"
            onClick={() => setPositionsOpen(!positionsOpen)}>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-gray-200 flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", openContracts.length > 0 ? "bg-green-500" : "bg-gray-500")}></span>
                Positions
              </span>
              <span className="bg-[#2A3647] text-gray-300 text-[10px] px-2 py-0.5 rounded border border-[#333]">{openContracts.length}</span>
            </div>
            {positionsOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
          </div>

          {/* ... (Drawer Content) ... */}
          {positionsOpen && (
            <div className="h-[calc(100%-40px)] overflow-y-auto p-2 space-y-2 bg-[#151E2D]">
              {openContracts.length === 0 && <div className="text-gray-500 text-center text-xs mt-8 font-medium">No open positions</div>}
              {openContracts.map(c => (
                <div key={c.contract_id} className="flex items-center justify-between p-3 bg-[#1D2736] rounded-lg hover:bg-[#243042] border border-[#2A3647] group transition-all">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider", c.longcode?.includes('Higher') ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20")}>
                        {c.longcode?.includes('Higher') ? 'CALL' : 'PUT'}
                      </span>
                      <span className="text-[13px] font-bold text-white">{c.display_name}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 font-mono">Ref: {c.contract_id}</div>
                  </div>
                  {/* ... (Sell Logic) ... */}
                  <div className="flex items-center gap-4">
                    <div className="text-right leading-tight">
                      <div className={cn("text-[13px] font-bold", (c.profit || 0) >= 0 ? "text-[#00B981]" : "text-[#FF444F]")}>
                        {(c.profit || 0) >= 0 ? '+' : ''}{(c.profit || 0).toFixed(2)} USD
                      </div>
                      <div className="text-[10px] text-gray-400">Buy: {(c.buy_price || 0).toFixed(2)} USD</div>
                    </div>
                    {!c.is_sold && (
                      <Button size="sm" className="h-7 text-[11px] font-bold bg-[#2A3647] hover:bg-[#38465C] border border-[#444] text-white" onClick={() => handleSell(c.contract_id, c.sell_price!)}>
                        Sell
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Trade Panel (Right Sidebar) - DTrader Replica */}
      <div className="w-[320px] bg-[#151E2D] flex flex-col border-l border-[#2A3647]">

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar content-start">

          {/* Trade Type Switcher */}
          <div className="space-y-1">
            <div className="text-[11px] text-[#9CA1A9] font-bold uppercase tracking-wide px-1">Trade Type</div>
            <div className="bg-[#0E1C2F] p-1 rounded-[4px] flex border border-[#2A3647]">
              <button className={cn("flex-1 py-1.5 text-[13px] font-bold rounded-[3px] transition-all", tradeMode === 'RISE_FALL' ? "bg-[#2A3647] text-white shadow-sm border border-[#38465C]" : "text-[#9CA1A9] hover:text-white hover:bg-[#1A253A]")}
                onClick={() => setTradeMode('RISE_FALL')}>
                Rise/Fall
              </button>
              <button className={cn("flex-1 py-1.5 text-[13px] font-bold rounded-[3px] transition-all", tradeMode === 'DIGITS' ? "bg-[#2A3647] text-white shadow-sm border border-[#38465C]" : "text-[#9CA1A9] hover:text-white hover:bg-[#1A253A]")}
                onClick={() => setTradeMode('DIGITS')}>
                Digits
              </button>
            </div>
          </div>


          {/* Params */}
          <div className="space-y-4">

            {/* Prediction (Digits Only) */}
            {tradeMode === 'DIGITS' && (
              <div className="space-y-1">
                <div className="text-[11px] text-[#9CA1A9] font-bold uppercase tracking-wide px-1">Last Digit Prediction</div>
                <div className="bg-[#1D2736] rounded-[4px] p-2 border border-[#2A3647]">
                  <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1 no-scrollbar">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                      <button
                        key={d}
                        onClick={() => setPrediction(d)}
                        className={cn("w-7 h-9 rounded-[4px] text-sm font-bold transition-all flex-shrink-0 flex items-center justify-center border",
                          prediction === d ? "bg-[#FF444F] border-[#FF444F] text-white shadow-md relative -top-1" : "bg-[#151E2D] border-[#2A3647] text-gray-400 hover:bg-[#243042] hover:border-[#38465C]")}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Duration */}
            <div className="space-y-1">
              <div className="text-[11px] text-[#9CA1A9] font-bold uppercase tracking-wide px-1">Duration</div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    className="bg-[#1D2736] border-[#2A3647] text-white text-[14px] font-bold h-10 focus:border-[#FF444F] focus:ring-0 rounded-[4px] pr-8 text-center placeholder-gray-600"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">TICKS</span>
                </div>
                {/* Simplified Duration Unit */}
                <div className="flex bg-[#1D2736] rounded-[4px] p-1 border border-[#2A3647] h-10 items-center">
                  {(tradeMode === 'DIGITS' ? ['t'] : ['t', 's', 'm']).map(u => (
                    <button key={u}
                      className={cn("w-8 h-8 text-[11px] font-bold rounded-[3px] uppercase transition-colors", durationUnit === u ? "bg-[#2A3647] text-white shadow-sm" : "text-gray-500 hover:text-white")}
                      onClick={() => setDurationUnit(u as any)}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Stake */}
            <div className="space-y-1">
              <div className="text-[11px] text-[#9CA1A9] font-bold uppercase tracking-wide px-1">Stake</div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 bg-[#2A3647] w-10 flex items-center justify-center rounded-l-[4px] border border-[#2A3647] z-10">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                </div>
                <Input
                  type="number"
                  value={stake}
                  onChange={e => setStake(e.target.value)}
                  className="bg-[#1D2736] border-[#2A3647] text-white text-[16px] font-bold h-10 focus:border-[#00a79e] focus:ring-0 rounded-[4px] pl-12 pr-10 text-right"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-1 gap-0.5">
                  <button onClick={() => setStake(String(Math.max(1, +stake - 1)))} className="h-8 w-6 flex items-center justify-center bg-transparent hover:bg-[#2A3647] rounded-md text-gray-400 hover:text-white transition-colors"><Minus className="w-3 h-3" /></button>
                  <button onClick={() => setStake(String(+stake + 1))} className="h-8 w-6 flex items-center justify-center bg-transparent hover:bg-[#2A3647] rounded-md text-gray-400 hover:text-white transition-colors"><Plus className="w-3 h-3" /></button>
                </div>
              </div>
            </div>

            {/* Payout Info (Static for now, simulating Calculate) */}
            <div className="p-3 bg-[#1D2736]/50 rounded border border-dashed border-[#2A3647] flex justify-between items-center">
              <span className="text-xs text-gray-500">Est. Payout</span>
              <span className="text-sm font-bold text-[#00B981]">{(+stake * 1.95).toFixed(2)} USD</span>
            </div>
          </div>

          {/* Advanced info (Barriers etc, hidden for now) */}
        </div>

        {/* DUAL BUTTON FOOTER - The Main Event */}
        <div className="p-4 border-t border-[#2A3647] bg-[#151E2D] space-y-2">
          {/* Button 1 (Call / Matches) */}
          <button
            className={cn("w-full relative group overflow-hidden rounded-lg transition-all",
              !proposalCall || buying ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-0.5 shadow-lg active:translate-y-0")}
            onClick={() => handleBuy(proposalCall)}
            disabled={!proposalCall || buying}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#00B981] to-[#00A575]"></div>
            <div className="relative px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-white/20 p-1.5 rounded">
                  {tradeMode === 'DIGITS' ? <span className="font-bold text-white">M</span> : <TrendingUp className="w-5 h-5 text-white" />}
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white leading-tight">{tradeMode === 'DIGITS' ? 'Matches' : 'Higher'}</div>
                  <div className="text-[10px] text-white/80 font-medium">Win Payout</div>
                </div>
              </div>
              <div className="text-right">
                {!proposalCall ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <>
                    <div className="text-lg font-bold text-white drop-shadow-sm">{proposalCall.payout?.toFixed(2) ?? '0.00'}</div>
                    <div className="text-[10px] text-white/90">
                      {((Math.abs((proposalCall.payout || 0) - +stake) / +stake * 100) || 0).toFixed(1)}% Return
                    </div>
                  </>
                )}
              </div>
            </div>
          </button>

          {/* Button 2 (Put / Differs) */}
          <button
            className={cn("w-full relative group overflow-hidden rounded-lg transition-all",
              !proposalPut || buying ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-0.5 shadow-lg active:translate-y-0")}
            onClick={() => handleBuy(proposalPut)}
            disabled={!proposalPut || buying}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#FF444F] to-[#E63946]"></div>
            <div className="relative px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-white/20 p-1.5 rounded">
                  {tradeMode === 'DIGITS' ? <span className="font-bold text-white">D</span> : <TrendingDown className="w-5 h-5 text-white" />}
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white leading-tight">{tradeMode === 'DIGITS' ? 'Differs' : 'Lower'}</div>
                  <div className="text-[10px] text-white/80 font-medium">Win Payout</div>
                </div>
              </div>
              <div className="text-right">
                {!proposalPut ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <>
                    <div className="text-lg font-bold text-white drop-shadow-sm">{proposalPut.payout?.toFixed(2) ?? '0.00'}</div>
                    <div className="text-[10px] text-white/90">
                      {((Math.abs((proposalPut.payout || 0) - +stake) / +stake * 100) || 0).toFixed(1)}% Return
                    </div>
                  </>
                )}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
