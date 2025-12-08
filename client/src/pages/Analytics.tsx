import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useDeriv } from "@/contexts/DerivContext";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  DollarSign,
  Target,
  Percent,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { createChart, ColorType } from "lightweight-charts";

export default function Analytics() {
  const { isConnected, isAuthorized, balance, accountInfo } = useDeriv();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<any>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const newChart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#16181D" },
        textColor: "rgba(255, 255, 255, 0.9)",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.05)" },
        horzLines: { color: "rgba(255, 255, 255, 0.05)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    const candlestickSeries = (newChart as any).addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    // Sample data - replace with real Deriv data
    const sampleData = generateSampleCandleData();
    candlestickSeries.setData(sampleData);

    newChart.timeScale().fitContent();

    setChart(newChart);

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        newChart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      newChart.remove();
    };
  }, []);

  const generateSampleCandleData = () => {
    const data = [];
    let basePrice = 100;
    const now = Math.floor(Date.now() / 1000);

    for (let i = 0; i < 100; i++) {
      const time = now - (100 - i) * 60; // 1-minute candles
      const change = (Math.random() - 0.5) * 2;
      basePrice += change;

      const open = basePrice;
      const close = basePrice + (Math.random() - 0.5) * 1;
      const high = Math.max(open, close) + Math.random() * 0.5;
      const low = Math.min(open, close) - Math.random() * 0.5;

      data.push({
        time,
        open,
        high,
        low,
        close,
      });

      basePrice = close;
    }

    return data;
  };

  // Mock analytics data - replace with real data from database
  const analyticsData = {
    totalTrades: 156,
    winningTrades: 106,
    losingTrades: 50,
    winRate: 68,
    totalProfit: 2450,
    totalLoss: 1200,
    netProfit: 1250,
    avgWin: 23.11,
    avgLoss: 24.0,
    profitFactor: 2.04,
    sharpeRatio: 1.85,
    maxDrawdown: 450,
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <a className="text-xl font-bold text-foreground hover:text-accent transition-colors">
                ← Analytics Dashboard
              </a>
            </Link>
            <div className="flex items-center gap-4">
              <Badge
                variant={isConnected ? "default" : "outline"}
                className={isConnected ? "bg-green-500" : ""}
              >
                {isConnected ? "Connected" : "Disconnected"}
              </Badge>
              {isAuthorized && balance !== null && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-accent/10 border border-accent/20">
                  <DollarSign className="w-4 h-4 text-accent" />
                  <span className="font-semibold text-foreground">${balance.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Performance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Net Profit</p>
                  <p className="text-2xl font-bold text-green-500">
                    ${analyticsData.netProfit.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    +{((analyticsData.netProfit / 10000) * 100).toFixed(1)}% ROI
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Win Rate</p>
                  <p className="text-2xl font-bold text-accent">{analyticsData.winRate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {analyticsData.winningTrades}/{analyticsData.totalTrades} trades
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Target className="w-6 h-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Profit Factor</p>
                  <p className="text-2xl font-bold text-foreground">
                    {analyticsData.profitFactor.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Excellent</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Max Drawdown</p>
                  <p className="text-2xl font-bold text-red-500">
                    ${analyticsData.maxDrawdown.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((analyticsData.maxDrawdown / 10000) * 100).toFixed(1)}% of capital
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart Section */}
        <Card className="bg-card border-border mb-8">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Price Chart & Technical Analysis
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Advanced charting with technical indicators
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div ref={chartContainerRef} className="w-full" />
          </CardContent>
        </Card>

        {/* Detailed Analytics */}
        <Tabs defaultValue="performance" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-card">
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="trades">Trade History</TabsTrigger>
            <TabsTrigger value="risk">Risk Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Profit & Loss Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Profit</span>
                    <span className="font-semibold text-green-500">
                      ${analyticsData.totalProfit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Loss</span>
                    <span className="font-semibold text-red-500">
                      ${analyticsData.totalLoss.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-foreground font-medium">Net Profit</span>
                    <span className="font-bold text-accent">
                      ${analyticsData.netProfit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Average Win</span>
                    <span className="font-semibold text-foreground">
                      ${analyticsData.avgWin.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Average Loss</span>
                    <span className="font-semibold text-foreground">
                      ${analyticsData.avgLoss.toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Trade Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Trades</span>
                    <span className="font-semibold text-foreground">
                      {analyticsData.totalTrades}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Winning Trades</span>
                    <span className="font-semibold text-green-500">
                      {analyticsData.winningTrades}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Losing Trades</span>
                    <span className="font-semibold text-red-500">
                      {analyticsData.losingTrades}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-foreground font-medium">Win Rate</span>
                    <span className="font-bold text-accent">{analyticsData.winRate}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Sharpe Ratio</span>
                    <span className="font-semibold text-foreground">
                      {analyticsData.sharpeRatio.toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trades" className="mt-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Recent Trades</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Your latest trading activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      time: "2 hours ago",
                      symbol: "R_100",
                      type: "CALL",
                      stake: 10,
                      payout: 18.5,
                      result: "Win",
                    },
                    {
                      time: "3 hours ago",
                      symbol: "R_50",
                      type: "PUT",
                      stake: 15,
                      payout: 0,
                      result: "Loss",
                    },
                    {
                      time: "4 hours ago",
                      symbol: "R_100",
                      type: "CALL",
                      stake: 10,
                      payout: 18.5,
                      result: "Win",
                    },
                  ].map((trade, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{trade.symbol}</span>
                          <Badge
                            variant="outline"
                            className={trade.type === "CALL" ? "border-green-500" : "border-red-500"}
                          >
                            {trade.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{trade.time}</p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-semibold ${
                            trade.result === "Win" ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {trade.result === "Win" ? "+" : "-"}$
                          {trade.result === "Win"
                            ? (trade.payout - trade.stake).toFixed(2)
                            : trade.stake.toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Stake: ${trade.stake.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risk" className="mt-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Risk Management Metrics</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Monitor your risk exposure and trading discipline
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Risk/Reward Ratio</span>
                      <Percent className="w-4 h-4 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">1:1.85</p>
                    <p className="text-xs text-muted-foreground mt-1">Optimal range</p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Max Consecutive Losses</span>
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">3</p>
                    <p className="text-xs text-muted-foreground mt-1">Within limits</p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Daily Loss Limit</span>
                      <DollarSign className="w-4 h-4 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">$250</p>
                    <p className="text-xs text-muted-foreground mt-1">Used: $45 (18%)</p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Position Sizing</span>
                      <Target className="w-4 h-4 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">2%</p>
                    <p className="text-xs text-muted-foreground mt-1">Per trade</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
