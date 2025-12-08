import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDeriv } from "@/contexts/DerivContext";
import { DERIV_CONFIG } from "@/../../shared/deriv-config";
import { TrendingUp, TrendingDown, Activity, DollarSign, BarChart3, Settings } from "lucide-react";
import AccountSwitcher from "@/components/AccountSwitcher";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function DerivTrading() {
  const { user } = useAuth();
  const {
    isConnected,
    isAuthorized,
    accountInfo,
    balance,
    accountType,
    accounts,
    connect,
    authorize,
    switchAccount,
    initiateOAuth,
    getActiveSymbols,
    subscribeToTicks,
    getProposal,
    buyContract,
  } = useDeriv();

  const [apiToken, setApiToken] = useState("");
  const [symbols, setSymbols] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [currentTick, setCurrentTick] = useState<any>(null);
  const [tickHistory, setTickHistory] = useState<any[]>([]);
  const [stakeAmount, setStakeAmount] = useState("10");
  const [contractType, setContractType] = useState("CALL");
  const [duration, setDuration] = useState("5");
  const [proposal, setProposal] = useState<any>(null);
  const [isLoadingProposal, setIsLoadingProposal] = useState(false);
  const [isPlacingTrade, setIsPlacingTrade] = useState(false);

  // Auto-connect on mount
  useEffect(() => {
    if (!isConnected) {
      connect();
    }
  }, [isConnected, connect]);

  // Auto-authorize if token exists in localStorage
  useEffect(() => {
    if (isConnected && !isAuthorized) {
      const storedToken = localStorage.getItem("deriv_token");
      if (storedToken) {
        authorize(storedToken).catch(() => {
          // Token expired or invalid, clear it
          localStorage.removeItem("deriv_token");
          localStorage.removeItem("deriv_account");
        });
      }
    }
  }, [isConnected, isAuthorized, authorize]);

  // Load active symbols when connected
  useEffect(() => {
    if (isConnected && !isAuthorized) {
      loadSymbols();
    }
  }, [isConnected, isAuthorized]);

  const loadSymbols = async () => {
    try {
      const activeSymbols = await getActiveSymbols();
      setSymbols(activeSymbols || []);
      if (activeSymbols && activeSymbols.length > 0) {
        setSelectedSymbol(activeSymbols[0].symbol);
      }
    } catch (error: any) {
      console.error("Failed to load symbols:", error);
      toast.error("Failed to load market symbols");
    }
  };

  const handleAuthorize = async () => {
    if (!apiToken.trim()) {
      toast.error("Please enter your API token");
      return;
    }

    try {
      await authorize(apiToken);
    } catch (error) {
      // Error already handled in context
    }
  };

  // Subscribe to ticks when symbol changes
  useEffect(() => {
    if (!selectedSymbol || !isConnected) return;

    let unsubscribe: (() => void) | undefined;

    const setupTickSubscription = async () => {
      try {
        unsubscribe = await subscribeToTicks(selectedSymbol, (tick) => {
          setCurrentTick(tick);
          setTickHistory((prev) => [...prev.slice(-50), tick]); // Keep last 50 ticks
        });
      } catch (error: any) {
        console.error("Failed to subscribe to ticks:", error);
      }
    };

    setupTickSubscription();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedSymbol, isConnected, subscribeToTicks]);

  // Get proposal when parameters change
  useEffect(() => {
    if (!isAuthorized || !selectedSymbol) return;

    const fetchProposal = async () => {
      setIsLoadingProposal(true);
      try {
        const proposalParams = {
          proposal: 1,
          amount: parseFloat(stakeAmount),
          basis: "stake",
          contract_type: contractType,
          currency: accountInfo?.currency || "USD",
          duration: parseInt(duration),
          duration_unit: "t", // ticks
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

    // Debounce proposal requests
    const timer = setTimeout(fetchProposal, 500);
    return () => clearTimeout(timer);
  }, [isAuthorized, selectedSymbol, stakeAmount, contractType, duration, getProposal, accountInfo]);

  const handleTrade = async () => {
    if (!isAuthorized) {
      toast.error("Please authorize with your API token first");
      return;
    }

    if (!proposal || !proposal.id) {
      toast.error("Please wait for proposal to load");
      return;
    }

    setIsPlacingTrade(true);
    try {
      const buyParams = {
        buy: proposal.id,
        price: parseFloat(stakeAmount),
      };

      const response = await buyContract(buyParams);

      if (response.buy) {
        toast.success(`Trade placed successfully! Contract ID: ${response.buy.contract_id}`);
        // Optionally refresh balance or show contract details
      }
    } catch (error: any) {
      console.error("Trade failed:", error);
      toast.error(`Trade failed: ${error.message}`);
    } finally {
      setIsPlacingTrade(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <a className="text-xl font-bold text-foreground hover:text-accent transition-colors">
                ←// ProfitDock Trading Interface
              </a>
            </Link>
            <div className="flex items-center gap-4">
              <Badge
                variant={isConnected ? "default" : "outline"}
                className={isConnected ? "bg-green-500" : ""}
              >
                {isConnected ? "Connected" : "Disconnected"}
              </Badge>
              {isAuthorized && (
                <>
                  <AccountSwitcher />
                  {balance !== null && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-accent/10 border border-accent/20">
                      <DollarSign className="w-4 h-4 text-accent" />
                      <span className="font-semibold text-foreground">${balance.toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {!isAuthorized ? (
          <Card className="max-w-2xl mx-auto bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Connect to Deriv</CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter your Deriv API token to start trading
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <Button
                  onClick={initiateOAuth}
                  disabled={!isConnected}
                  className="w-full bg-accent hover:bg-accent-glow text-white"
                  size="lg"
                >
                  {isConnected ? "Login with Deriv OAuth" : "Connecting..."}
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
                  <Label htmlFor="api-token" className="text-foreground">
                    API Token
                  </Label>
                  <Input
                    id="api-token"
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="Enter your Deriv API token"
                    className="bg-input border-border text-foreground"
                  />
                  <p className="text-sm text-muted-foreground">
                    Get your API token from{" "}
                    <a
                      href="https://app.deriv.com/account/api-token"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      Deriv Dashboard
                    </a>
                  </p>
                </div>

                <Button
                  onClick={handleAuthorize}
                  disabled={!isConnected}
                  className="w-full"
                  variant="outline"
                >
                  {isConnected ? "Authorize with Token" : "Connecting..."}
                </Button>
              </div>

              <div className="pt-4 border-t border-border">
                <h3 className="font-semibold text-foreground mb-2">Available Markets</h3>
                <div className="grid grid-cols-2 gap-2">
                  {symbols.slice(0, 6).map((symbol) => (
                    <div
                      key={symbol.symbol}
                      className="p-2 rounded bg-muted/30 border border-border"
                    >
                      <p className="text-sm font-medium text-foreground">{symbol.display_name}</p>
                      <p className="text-xs text-muted-foreground">{symbol.symbol}</p>
                    </div>
                  ))}
                </div>
                {symbols.length > 6 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    +{symbols.length - 6} more markets available
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Market Data */}
            <div className="lg:col-span-2 space-y-6">
              {/* Market Selector */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground">Market</CardTitle>
                    <Activity className="w-5 h-5 text-accent animate-pulse" />
                  </div>
                </CardHeader>
                <CardContent>
                  <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                    <SelectTrigger className="bg-input border-border text-foreground">
                      <SelectValue placeholder="Select market" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {symbols.map((symbol) => (
                        <SelectItem key={symbol.symbol} value={symbol.symbol}>
                          {symbol.display_name} ({symbol.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Current Price */}
              {currentTick && (
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground">Live Price</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-4xl font-bold text-foreground">{currentTick.quote}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {new Date(currentTick.epoch * 1000).toLocaleTimeString()}
                        </p>
                      </div>
                      {tickHistory.length > 1 && (
                        <div className="flex items-center gap-2">
                          {currentTick.quote > tickHistory[tickHistory.length - 2].quote ? (
                            <TrendingUp className="w-8 h-8 text-green-500" />
                          ) : (
                            <TrendingDown className="w-8 h-8 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Simple tick chart */}
                    <div className="mt-6 h-32 flex items-end gap-1">
                      {tickHistory.slice(-30).map((tick, i) => {
                        const maxQuote = Math.max(...tickHistory.slice(-30).map((t) => t.quote));
                        const minQuote = Math.min(...tickHistory.slice(-30).map((t) => t.quote));
                        const range = maxQuote - minQuote || 1;
                        const height = ((tick.quote - minQuote) / range) * 100;

                        return (
                          <div
                            key={i}
                            className="flex-1 bg-accent/50 rounded-t"
                            style={{ height: `${Math.max(height, 5)}%` }}
                          />
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Account Info */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Account Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Account ID</p>
                      <p className="font-semibold text-foreground">{accountInfo?.loginid}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Currency</p>
                      <p className="font-semibold text-foreground">{accountInfo?.currency}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Balance</p>
                      <p className="font-semibold text-accent">${balance?.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-semibold text-foreground truncate">{accountInfo?.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Trading Panel */}
            <div className="space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Place Trade</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Configure your trade parameters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contract-type" className="text-foreground">
                      Contract Type
                    </Label>
                    <Select value={contractType} onValueChange={setContractType}>
                      <SelectTrigger className="bg-input border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="CALL">Rise (Call)</SelectItem>
                        <SelectItem value="PUT">Fall (Put)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="stake" className="text-foreground">
                      Stake Amount ($)
                    </Label>
                    <Input
                      id="stake"
                      type="number"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className="bg-input border-border text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration" className="text-foreground">
                      Duration (ticks)
                    </Label>
                    <Input
                      id="duration"
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="bg-input border-border text-foreground"
                    />
                  </div>

                  <div className="pt-4 border-t border-border">
                    {isLoadingProposal ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">Loading proposal...</p>
                      </div>
                    ) : proposal ? (
                      <>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Potential Payout</span>
                          <span className="font-semibold text-foreground">
                            ${proposal.payout?.toFixed(2) || "0.00"}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Potential Profit</span>
                          <span className="font-semibold text-green-500">
                            ${((proposal.payout || 0) - parseFloat(stakeAmount)).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Ask Price</span>
                          <span className="font-semibold text-foreground">
                            ${proposal.ask_price?.toFixed(2) || "0.00"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">No proposal available</p>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={handleTrade}
                    disabled={!proposal || isLoadingProposal || isPlacingTrade}
                    className="w-full bg-accent hover:bg-accent-glow text-white"
                  >
                    {isPlacingTrade ? "Placing Trade..." : "Place Trade"}
                  </Button>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Quick Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Today's Trades</span>
                    <span className="font-semibold text-foreground">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Win Rate</span>
                    <span className="font-semibold text-green-500">0%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total P/L</span>
                    <span className="font-semibold text-foreground">$0.00</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
