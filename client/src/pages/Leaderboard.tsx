import { useEffect, useState } from "react";
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

interface Trader {
  id: string;
  username: string;
  totalTrades: number;
  wonTrades: number;
  winRate: number;
  totalProfit: number;
  isMe?: boolean;
}

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data generation
    const generateLeaderboard = () => {
      const mockTraders: Trader[] = [
        { id: '1', username: 'CryptoKing99', totalTrades: 1250, wonTrades: 850, winRate: 68.0, totalProfit: 15420.50 },
        { id: '2', username: 'DerivMaster', totalTrades: 3400, wonTrades: 2100, winRate: 61.7, totalProfit: 12350.20 },
        { id: '3', username: 'ProfitHunter', totalTrades: 890, wonTrades: 600, winRate: 67.4, totalProfit: 9800.00 },
        { id: '4', username: 'BotAlgo', totalTrades: 5600, wonTrades: 3000, winRate: 53.5, totalProfit: 8500.25 },
        { id: '5', username: 'SafeTrader', totalTrades: 450, wonTrades: 380, winRate: 84.4, totalProfit: 7200.00 },
        // Add current user (simulated)
        { id: 'me', username: 'You', totalTrades: 42, wonTrades: 28, winRate: 66.6, totalProfit: 1250.00, isMe: true }
      ];

      // Add more random traders
      for (let i = 0; i < 20; i++) {
        mockTraders.push({
          id: `user${i}`,
          username: `User_${Math.floor(Math.random() * 1000)}`,
          totalTrades: Math.floor(Math.random() * 1000) + 100,
          wonTrades: 0, // calc below
          winRate: 0, // calc below
          totalProfit: Math.random() * 5000
        });
      }

      // Fix up randoms
      mockTraders.forEach(t => {
        if (!t.wonTrades) {
          t.winRate = 45 + Math.random() * 20;
          t.wonTrades = Math.floor(t.totalTrades * (t.winRate / 100));
        }
      });

      // Sort by profit
      return mockTraders.sort((a, b) => b.totalProfit - a.totalProfit);
    };

    setTimeout(() => {
      setLeaderboard(generateLeaderboard());
      setLoading(false);
    }, 1000);
  }, []);

  const myStats = leaderboard.find(t => t.isMe);

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white">
      {/* Header */}
      <header className="h-14 border-b border-gray-800 bg-[#2A2A2A] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/trading">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
              ← Back to Trading
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-white">Leaderboard</span>
          </div>
        </div>
      </header>

      <div className="container py-8 mx-auto px-4">
        {/* My Stats Card */}
        {myStats && (
          <Card className="mb-6 bg-[#2A2A2A] border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Award className="w-5 h-5 text-[#C026D3]" />
                Your Stats
              </CardTitle>
              <CardDescription className="text-gray-400">Your simulated trading performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-[#1A1A1A] rounded-lg">
                  <div className="text-2xl font-bold text-white">{myStats.totalTrades}</div>
                  <div className="text-sm text-gray-400">Total Trades</div>
                </div>
                <div className="text-center p-3 bg-[#1A1A1A] rounded-lg">
                  <div className="text-2xl font-bold text-green-500">{myStats.wonTrades}</div>
                  <div className="text-sm text-gray-400">Wins</div>
                </div>
                <div className="text-center p-3 bg-[#1A1A1A] rounded-lg">
                  <div className="text-2xl font-bold text-blue-500">{myStats.winRate.toFixed(2)}%</div>
                  <div className="text-sm text-gray-400">Win Rate</div>
                </div>
                <div className="text-center p-3 bg-[#1A1A1A] rounded-lg">
                  <div className={`text-2xl font-bold ${myStats.totalProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
                    ${myStats.totalProfit.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-400">Total Profit</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard Table */}
        <Card className="bg-[#2A2A2A] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Top Traders</CardTitle>
            <CardDescription className="text-gray-400">Rankings updated in real-time based on total profit</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading leaderboard...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-700 hover:bg-transparent">
                    <TableHead className="w-16 text-gray-400">Rank</TableHead>
                    <TableHead className="text-gray-400">Trader</TableHead>
                    <TableHead className="text-center text-gray-400">Total Trades</TableHead>
                    <TableHead className="text-center text-gray-400">Wins</TableHead>
                    <TableHead className="text-center text-gray-400">Win Rate</TableHead>
                    <TableHead className="text-right text-gray-400">Total Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((trader, index) => (
                    <TableRow key={trader.id} className={`border-gray-700 hover:bg-[#3A3A3A] ${trader.isMe ? "bg-[#3A3A3A]/50" : ""}`}>
                      <TableCell className="font-medium text-white">
                        {index === 0 && <Trophy className="w-4 h-4 inline mr-1 text-yellow-500" />}
                        {index === 1 && <Trophy className="w-4 h-4 inline mr-1 text-gray-400" />}
                        {index === 2 && <Trophy className="w-4 h-4 inline mr-1 text-orange-600" />}
                        #{index + 1}
                      </TableCell>
                      <TableCell className="font-medium text-white">
                        {trader.username}
                        {trader.isMe && (
                          <Badge variant="outline" className="ml-2 border-[#C026D3] text-[#C026D3]">
                            You
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-gray-300">{trader.totalTrades}</TableCell>
                      <TableCell className="text-center text-gray-300">{trader.wonTrades}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${trader.winRate >= 50 ? "bg-green-900 text-green-300 hover:bg-green-900" : "bg-gray-700 text-gray-300 hover:bg-gray-700"}`}>
                          {trader.winRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={trader.totalProfit >= 0 ? "text-green-500 font-semibold" : "text-red-500 font-semibold"}>
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
      </div>
    </div>
  );
}
