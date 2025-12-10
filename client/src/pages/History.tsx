import { useAuth } from "@/contexts/AuthContext";
import { getDerivWS } from "@/services/derivWebSocket";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Menu, MessageCircle, RefreshCw, ChevronDown, Download } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import SessionComparison from "@/components/SessionComparison";
import { toast } from "sonner";

interface Transaction {
  action_type: string;
  amount: number;
  balance_after: number;
  contract_id?: number;
  longcode: string;
  transaction_id: number;
  transaction_time: number;
}

export default function History() {
  const { balance, currentAccount, isDemo } = useAuth();
  const [activeTab, setActiveTab] = useState<'statement' | 'bots'>('statement');
  const [statement, setStatement] = useState<Transaction[]>([]);
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Bot History State
  const [filter, setFilter] = useState<'all' | 'completed' | 'stopped'>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);

  // Fetch bot sessions from database (legacy)
  const { data: sessions, isLoading: isLoadingBots } = trpc.botSessions.list.useQuery();

  const filteredSessions = sessions?.filter((session: any) => {
    if (filter === 'all') return true;
    return session.status === filter;
  }) || [];

  const derivWS = getDerivWS();

  useEffect(() => {
    if (activeTab === 'statement' && currentAccount) {
      loadStatement();
    }
  }, [activeTab, currentAccount]);

  async function loadStatement() {
    try {
      setLoadingStatement(true);
      const response = await derivWS.getTransactions(100);
      if (response.statement && response.statement.transactions) {
        setStatement(response.statement.transactions);
      }
    } catch (error) {
      console.error("Failed to load statement:", error);
      toast.error("Failed to load transaction history");
    } finally {
      setLoadingStatement(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currentAccount?.currency || 'USD'
    }).format(amount);
  };

  const formatDate = (epoch: number) => {
    return new Date(epoch * 1000).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-[#3A3A3A]">
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
              ProfitDock
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#1A1A1A] px-4 py-2 rounded-lg border border-gray-700">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isDemo ? 'bg-blue-500' : 'bg-green-500'}`}>
                <span className="text-white text-xs font-bold">
                  {isDemo ? 'D' : 'R'}
                </span>
              </div>
              <span className="text-white font-semibold">
                {balance ? formatCurrency(balance) : 'Loading...'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-[#2A2A2A] px-4 py-2 flex gap-6 overflow-x-auto border-b border-gray-800">
        <Link href="/trading">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-[#3A3A3A] rounded-lg font-medium whitespace-nowrap transition-colors">
            Trading
          </a>
        </Link>
        <Link href="/charts">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-[#3A3A3A] rounded-lg font-medium whitespace-nowrap transition-colors">
            Charts
          </a>
        </Link>
        <Link href="/bot-builder">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-[#3A3A3A] rounded-lg font-medium whitespace-nowrap transition-colors">
            Bot Builder
          </a>
        </Link>
        <Link href="/history">
          <a className="px-4 py-2 bg-[#C026D3] text-white rounded-lg font-medium whitespace-nowrap shadow-lg shadow-purple-500/20">
            History
          </a>
        </Link>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-white text-2xl font-bold mb-2">History & Statement</h2>
              <p className="text-gray-400">Track your trading performance and transactions</p>
            </div>

            <div className="flex gap-2 bg-[#2A2A2A] p-1 rounded-lg border border-gray-800">
              <Button
                variant={activeTab === 'statement' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('statement')}
                className={activeTab === 'statement' ? 'bg-[#C026D3] hover:bg-[#a020b0]' : 'text-gray-400 hover:text-white'}
              >
                Statement
              </Button>
              <Button
                variant={activeTab === 'bots' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('bots')}
                className={activeTab === 'bots' ? 'bg-[#C026D3] hover:bg-[#a020b0]' : 'text-gray-400 hover:text-white'}
              >
                Bot History
              </Button>
            </div>
          </div>

          {activeTab === 'statement' ? (
            <Card className="bg-[#2A2A2A] border-gray-800">
              <div className="p-4 flex justify-between items-center border-b border-gray-800">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <RefreshCw className={`w-4 h-4 ${loadingStatement ? 'animate-spin' : ''} cursor-pointer hover:text-purple-400`} onClick={() => loadStatement()} />
                  Transaction History
                </h3>
                <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-[#3A3A3A]">
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-[#333]">
                      <TableHead className="text-gray-400">Date</TableHead>
                      <TableHead className="text-gray-400">Ref. ID</TableHead>
                      <TableHead className="text-gray-400">Type</TableHead>
                      <TableHead className="text-gray-400">Description</TableHead>
                      <TableHead className="text-right text-gray-400">Amount</TableHead>
                      <TableHead className="text-right text-gray-400">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingStatement ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">Loading transactions...</TableCell>
                      </TableRow>
                    ) : statement.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">No transactions found</TableCell>
                      </TableRow>
                    ) : (
                      statement.map((tx) => (
                        <TableRow key={tx.transaction_id} className="border-gray-800 hover:bg-[#333]">
                          <TableCell className="text-gray-300 font-medium">
                            {formatDate(tx.transaction_time)}
                          </TableCell>
                          <TableCell className="text-gray-500 font-mono text-xs">
                            {tx.transaction_id}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              tx.action_type === 'buy' ? 'destructive' :
                                tx.action_type === 'sell' ? 'secondary' :
                                  tx.action_type === 'deposit' ? 'default' : 'outline'
                            } className={
                              tx.action_type === 'buy' ? 'bg-red-900/50 text-red-200 hover:bg-red-900/70' :
                                tx.action_type === 'sell' ? 'bg-green-900/50 text-green-200 hover:bg-green-900/70' : ''
                            }>
                              {tx.action_type.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-300 max-w-md truncate" title={tx.longcode}>
                            {tx.longcode || '-'}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${tx.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-gray-300 font-mono">
                            {tx.balance_after.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : (
            // Bot History Content (Legacy)
            <div className="space-y-6">
              <div className="flex gap-2 mb-4">
                <Button variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')} className={filter === 'all' ? 'bg-[#C026D3]' : 'border-gray-700'}>All</Button>
                <Button variant={filter === 'completed' ? 'default' : 'outline'} onClick={() => setFilter('completed')} className={filter === 'completed' ? 'bg-[#C026D3]' : 'border-gray-700'}>Completed</Button>
              </div>
              {/* Reusing existing logic briefly for the list */}
              {filteredSessions.length === 0 ? (
                <div className="text-center text-gray-500 py-12 bg-[#2A2A2A] rounded-xl border border-gray-800">
                  No bot sessions found. Run a bot to see history here.
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredSessions.map((session: any) => (
                    <Card key={session.id} className="bg-[#2A2A2A] border-gray-800 p-4">
                      <div className="flex justify-between">
                        <h3 className="text-white font-bold">{session.botName || 'Bot Run'}</h3>
                        <Badge>{session.status}</Badge>
                      </div>
                      <div className="mt-2 text-gray-400">
                        Profit: <span className={session.profit >= 0 ? 'text-green-500' : 'text-red-500'}>${(session.profit / 100).toFixed(2)}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
