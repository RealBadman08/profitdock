import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useDeriv } from "@/contexts/DerivContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import AccountSwitcher from "@/components/AccountSwitcher";
import DerivChart from "@/components/DerivChart";

export default function DerivTrader() {
  const {
    isConnected,
    isAuthorized,
    accountInfo,
    balance,
    accountType,
    connect,
    authorize,
    initiateOAuth,
    getActiveSymbols,
    subscribeToTicks,
    getProposal,
    buyContract,
  } = useDeriv();

  // State
  const [apiToken, setApiToken] = useState("");
  const [symbols, setSymbols] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("1HZ100V");
  const [currentTick, setCurrentTick] = useState<any>(null);
  const [tickHistory, setTickHistory] = useState<any[]>([]);
  const [stakeAmount, setStakeAmount] = useState(10);
  const [contractType, setContractType] = useState<"CALL" | "PUT">("CALL");
  const [duration, setDuration] = useState(5);
  const [proposal, setProposal] = useState<any>(null);
  const [isLoadingProposal, setIsLoadingProposal] = useState(false);
  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState("continuous");

  // Auto-connect
  useEffect(() => {
    if (!isConnected) {
      connect();
    }
  }, [isConnected, connect]);

  // Auto-authorize if token exists
  useEffect(() => {
    if (isConnected && !isAuthorized) {
      const storedToken = localStorage.getItem("deriv_token");
      if (storedToken) {
        authorize(storedToken).catch(() => {
          localStorage.removeItem("deriv_token");
          localStorage.removeItem("deriv_account");
        });
      }
    }
  }, [isConnected, isAuthorized, authorize]);

  // Load symbols
  useEffect(() => {
    if (isConnected && !isAuthorized) {
      const loadSymbols = async () => {
        try {
          const activeSymbols = await getActiveSymbols();
          setSymbols(activeSymbols);
        } catch (error) {
          console.error("Failed to load symbols:", error);
        }
      };
      loadSymbols();
    }
  }, [isConnected, isAuthorized, getActiveSymbols]);

  // Subscribe to ticks
  useEffect(() => {
    if (!selectedSymbol || !isConnected) return;

    const subscribe = async () => {
      const unsubscribe = await subscribeToTicks(selectedSymbol, (tick: any) => {
        setCurrentTick(tick);
        setTickHistory((prev) => [...prev.slice(-49), tick]);
      });

      return unsubscribe;
    };

    let cleanup: (() => void) | undefined;
    subscribe().then((unsub) => {
      cleanup = unsub;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [selectedSymbol, isConnected, subscribeToTicks]);

  // Get proposal
  useEffect(() => {
    if (!isAuthorized || !selectedSymbol) return;

    const fetchProposal = async () => {
      setIsLoadingProposal(true);
      try {
        const proposalParams = {
          proposal: 1,
          amount: stakeAmount,
          basis: "stake",
          contract_type: contractType,
          currency: accountInfo?.currency || "USD",
          duration: duration,
          duration_unit: "t",
          symbol: selectedSymbol,
        };

        const response = await getProposal(proposalParams);
        setProposal(response.proposal);
      } catch (error: any) {
        console.error("Failed to get proposal:", error);
        setProposal(null);
      } finally {
        setIsLoadingProposal(false);
      }
    };

    const timer = setTimeout(fetchProposal, 500);
    return () => clearTimeout(timer);
  }, [isAuthorized, selectedSymbol, stakeAmount, contractType, duration, getProposal, accountInfo]);

  const recordTradeMutation = trpc.trades.record.useMutation();

  const handleTrade = async () => {
    if (!proposal || !proposal.id) {
      toast.error("Please wait for proposal to load");
      return;
    }

    setIsPlacingTrade(true);
    try {
      const response = await buyContract({
        buy: proposal.id,
        price: stakeAmount,
      });

      if (response.buy) {
        const contractId = response.buy.contract_id;
        toast.success(`Trade placed! Contract ID: ${contractId}`);

        // Record trade in database
        try {
          await recordTradeMutation.mutateAsync({
            contractId,
            symbol: selectedSymbol,
            contractType,
            stake: stakeAmount,
            payout: proposal.payout,
            profit: (proposal.payout || 0) - stakeAmount,
            status: "open",
          });
        } catch (dbError) {
          console.error("Failed to record trade:", dbError);
        }
      }
    } catch (error: any) {
      toast.error(`Trade failed: ${error.message}`);
    } finally {
      setIsPlacingTrade(false);
    }
  };

  const handleAuthorize = async () => {
    if (!apiToken) {
      toast.error("Please enter an API token");
      return;
    }

    try {
      await authorize(apiToken);
      localStorage.setItem("deriv_token", apiToken);
      toast.success("Authorization successful!");
    } catch (error: any) {
      toast.error(`Authorization failed: ${error.message}`);
    }
  };

  const incrementStake = () => setStakeAmount((prev) => prev + 1);
  const decrementStake = () => setStakeAmount((prev) => Math.max(1, prev - 1));

  // Market categories
  const marketCategories = [
    {
      id: "continuous",
      name: "Continuous Indices",
      symbols: symbols.filter((s) => s.market === "synthetic_index" && s.submarket === "random_index"),
    },
    {
      id: "crash_boom",
      name: "Crash/Boom Indices",
      symbols: symbols.filter((s) => s.submarket === "crash_index" || s.submarket === "boom_index"),
    },
    {
      id: "step",
      name: "Step Indices",
      symbols: symbols.filter((s) => s.submarket === "step_index"),
    },
  ];

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 bg-card p-8 rounded-lg border border-border">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Welcome to ProfitDock</h1>
            <p className="text-muted-foreground">Connect to start trading</p>
          </div>

          <div className="space-y-4">
            <Button
              onClick={initiateOAuth}
              disabled={!isConnected}
              className="w-full deriv-button-primary h-12"
            >
              {isConnected ? "Login with Deriv" : "Connecting..."}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or use API token</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-token">API Token</Label>
              <Input
                id="api-token"
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Enter your Deriv API token"
                className="deriv-input"
              />
            </div>

            <Button onClick={handleAuthorize} disabled={!isConnected} variant="outline" className="w-full">
              Authorize with Token
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">d</span>
          </div>
          <span className="font-semibold text-foreground">// ProfitDock Trader</span>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/leaderboard">
            <Button variant="ghost" size="sm" className="text-sm">
              🏆 Leaderboard
            </Button>
          </Link>
          {accountInfo && <AccountSwitcher />}
          {balance !== null && (
            <div className="px-3 py-1.5 bg-secondary rounded text-sm font-medium">
              {accountInfo?.currency} {balance.toFixed(2)}
            </div>
          )}
        </div>
      </header>

      {/* Main Content - 3 Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Markets */}
        <div className="w-64 border-r border-border bg-white flex flex-col">
          <Tabs defaultValue="markets" className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start border-b rounded-none h-12 bg-white p-0">
              <TabsTrigger value="markets" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                Markets
              </TabsTrigger>
              <TabsTrigger value="favorites" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                Favorites
              </TabsTrigger>
            </TabsList>

            <TabsContent value="markets" className="flex-1 mt-0">
              <ScrollArea className="h-full">
                <div className="p-2">
                  {marketCategories.map((category) => (
                    <div key={category.id} className="mb-2">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === category.id ? "" : category.id)}
                        className="w-full flex items-center justify-between p-2 hover:bg-secondary rounded text-sm font-medium"
                      >
                        <span>{category.name}</span>
                        {expandedCategory === category.id ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      {expandedCategory === category.id && (
                        <div className="mt-1 space-y-1">
                          {category.symbols.map((symbol) => (
                            <button
                              key={symbol.symbol}
                              onClick={() => setSelectedSymbol(symbol.symbol)}
                              className={`w-full text-left p-2 rounded text-sm hover:bg-secondary ${selectedSymbol === symbol.symbol ? "bg-secondary font-medium" : ""
                                }`}
                            >
                              {symbol.display_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="favorites" className="flex-1 mt-0">
              <div className="p-4 text-center text-sm text-muted-foreground">
                No favorites yet
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Center - Chart Area */}
        <div className="flex-1 flex flex-col bg-white">
          {/* Symbol Header */}
          <div className="h-14 border-b border-border px-4 flex items-center gap-3">
            <span className="font-semibold text-foreground">
              {symbols.find((s) => s.symbol === selectedSymbol)?.display_name || selectedSymbol}
            </span>
            {currentTick && (
              <>
                <span className="text-lg font-bold">{currentTick.quote?.toFixed(2)}</span>
                <Badge variant={currentTick.quote > (tickHistory[tickHistory.length - 2]?.quote || 0) ? "default" : "destructive"} className="gap-1">
                  {currentTick.quote > (tickHistory[tickHistory.length - 2]?.quote || 0) ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {((currentTick.quote - (tickHistory[tickHistory.length - 2]?.quote || 0)) / (tickHistory[tickHistory.length - 2]?.quote || 1) * 100).toFixed(2)}%
                </Badge>
              </>
            )}
          </div>

          {/* Chart */}
          <div className="flex-1 p-4">
            <DerivChart tickHistory={tickHistory} />
          </div>
        </div>

        {/* Right Panel - Trade */}
        <div className="w-80 border-l border-border bg-white flex flex-col">
          <div className="p-4 space-y-4">
            {/* Trade Type */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Trade type</Label>
              <Tabs value={contractType} onValueChange={(v) => setContractType(v as "CALL" | "PUT")} className="w-full">
                <TabsList className="w-full grid grid-cols-2 h-10">
                  <TabsTrigger value="CALL" className="text-sm">Rise</TabsTrigger>
                  <TabsTrigger value="PUT" className="text-sm">Fall</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Stake */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Stake</Label>
              <div className="flex items-center gap-2">
                <Button
                  onClick={decrementStake}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(Number(e.target.value))}
                  className="deriv-input text-center font-semibold"
                />
                <Button
                  onClick={incrementStake}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {accountInfo?.currency || "USD"}
              </div>
            </div>

            {/* Duration */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Duration</Label>
              <Select value={duration.toString()} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger className="deriv-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20, 25].map((d) => (
                    <SelectItem key={d} value={d.toString()}>
                      {d} ticks
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Proposal Info */}
            {isLoadingProposal ? (
              <div className="p-4 bg-secondary rounded text-center text-sm text-muted-foreground">
                Loading proposal...
              </div>
            ) : proposal ? (
              <div className="p-4 bg-secondary rounded space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payout</span>
                  <span className="font-semibold">{proposal.payout?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Profit</span>
                  <span className="font-semibold text-accent">
                    {((proposal.payout || 0) - stakeAmount).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Buy Button */}
            <Button
              onClick={handleTrade}
              disabled={!proposal || isLoadingProposal || isPlacingTrade}
              className={contractType === "CALL" ? "deriv-button-buy" : "deriv-button-sell"}
            >
              {isPlacingTrade ? "Placing..." : contractType === "CALL" ? "Buy" : "Sell"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
