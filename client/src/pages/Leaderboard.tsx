import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, TrendingUp, Target, Award } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Leaderboard() {
  const { data: leaderboard, isLoading, refetch } = trpc.leaderboard.get.useQuery();
  const { data: myStats } = trpc.leaderboard.myStats.useQuery();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);

    return () => clearInterval(interval);
  }, [refetch]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/trade">
            <Button variant="ghost" size="sm">
              ← Back to Trading
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Leaderboard</span>
          </div>
        </div>
      </header>

      <div className="container py-8">
        {/* My Stats Card */}
        {myStats && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5" />
                Your Stats
              </CardTitle>
              <CardDescription>Your current trading performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{myStats.totalTrades}</div>
                  <div className="text-sm text-muted-foreground">Total Trades</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-accent">{myStats.wonTrades}</div>
                  <div className="text-sm text-muted-foreground">Wins</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{myStats.winRate.toFixed(2)}%</div>
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${myStats.totalProfit >= 0 ? "text-accent" : "text-destructive"}`}>
                    ${myStats.totalProfit.toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Profit</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard Table */}
        <Card>
          <CardHeader>
            <CardTitle>Top Traders</CardTitle>
            <CardDescription>Rankings updated in real-time based on total profit</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading leaderboard...</div>
            ) : !leaderboard || leaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No traders yet. Be the first to trade!
              </div>
            ) : (
              <Table>
                <TableCaption>Top 100 traders by total profit</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Trader</TableHead>
                    <TableHead className="text-center">Total Trades</TableHead>
                    <TableHead className="text-center">Wins</TableHead>
                    <TableHead className="text-center">Win Rate</TableHead>
                    <TableHead className="text-right">Total Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((trader, index) => (
                    <TableRow key={trader.id} className={myStats?.userId === trader.userId ? "bg-secondary" : ""}>
                      <TableCell className="font-medium">
                        {index === 0 && <Trophy className="w-4 h-4 inline mr-1 text-yellow-500" />}
                        {index === 1 && <Trophy className="w-4 h-4 inline mr-1 text-gray-400" />}
                        {index === 2 && <Trophy className="w-4 h-4 inline mr-1 text-orange-600" />}
                        #{index + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {trader.username}
                        {myStats?.userId === trader.userId && (
                          <Badge variant="outline" className="ml-2">
                            You
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{trader.totalTrades}</TableCell>
                      <TableCell className="text-center">{trader.wonTrades}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={trader.winRate >= 50 ? "default" : "secondary"}>
                          {trader.winRate.toFixed(2)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={trader.totalProfit >= 0 ? "text-accent font-semibold" : "text-destructive font-semibold"}>
                          {trader.totalProfit >= 0 ? "+" : ""}${trader.totalProfit.toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Info Cards */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                How Rankings Work
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Traders are ranked by total profit. Win more trades and increase your stake to climb the leaderboard!
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="w-4 h-4" />
                Win Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your win rate is calculated as (Wins / Total Trades) × 100. Aim for consistency!
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Award className="w-4 h-4" />
                Real-Time Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                The leaderboard updates automatically every 30 seconds with the latest trading results.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
