import { useDeriv } from "@/contexts/DerivContext";
import { Button } from "@/components/ui/button";
import { 
  Menu,
  MessageCircle,
  RefreshCw,
  ChevronDown,
  Filter,
  Calendar
} from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import SessionComparison from "@/components/SessionComparison";

export default function History() {
  const { balance, accountType } = useDeriv();
  const [filter, setFilter] = useState<'all' | 'completed' | 'stopped'>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  
  // Fetch bot sessions from database
  const { data: sessions, isLoading } = trpc.botSessions.list.useQuery();

  const filteredSessions = sessions?.filter((session: any) => {
    if (filter === 'all') return true;
    return session.status === filter;
  }) || [];

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="text-white">
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">
              <span className="text-cyan-400">MKUL</span>
              <span className="text-red-500">IMA</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-white">
              <MessageCircle className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white">
              <RefreshCw className="h-5 w-5" />
            </Button>
            
            <div className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {accountType === 'real' ? 'R' : 'D'}
                </span>
              </div>
              <span className="text-white font-semibold">
                {balance?.toFixed(2) || '0.00'} USD
              </span>
              <ChevronDown className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-gray-800 px-4 py-2 flex gap-6 overflow-x-auto">
        <Link href="/dashboard">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg font-medium whitespace-nowrap">
            Dashboard
          </a>
        </Link>
        <Link href="/bot-builder">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg font-medium whitespace-nowrap">
            Bot Builder
          </a>
        </Link>
        <Link href="/free-bots">
          <a className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg font-medium whitespace-nowrap">
            Free Bots
          </a>
        </Link>
        <Link href="/history">
          <a className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium whitespace-nowrap">
            History
          </a>
        </Link>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-white text-2xl font-bold mb-2">Bot History</h2>
              <p className="text-gray-400">View all your past bot trading sessions</p>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant={compareMode ? 'default' : 'outline'}
                onClick={() => {
                  setCompareMode(!compareMode);
                  setSelectedSessions([]);
                }}
                className={compareMode ? 'bg-purple-600' : 'bg-gray-700 text-white border-gray-600'}
              >
                {compareMode ? 'Exit Compare' : 'Compare Sessions'}
              </Button>
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                onClick={() => setFilter('all')}
                className={filter === 'all' ? 'bg-blue-600' : 'bg-gray-700 text-white border-gray-600'}
              >
                All
              </Button>
              <Button
                variant={filter === 'completed' ? 'default' : 'outline'}
                onClick={() => setFilter('completed')}
                className={filter === 'completed' ? 'bg-blue-600' : 'bg-gray-700 text-white border-gray-600'}
              >
                Completed
              </Button>
              <Button
                variant={filter === 'stopped' ? 'default' : 'outline'}
                onClick={() => setFilter('stopped')}
                className={filter === 'stopped' ? 'bg-blue-600' : 'bg-gray-700 text-white border-gray-600'}
              >
                Stopped
              </Button>
            </div>
          </div>

          {compareMode && selectedSessions.length > 0 ? (
            <SessionComparison 
              sessions={sessions?.filter((s: any) => selectedSessions.includes(s.id)) || []}
            />
          ) : isLoading ? (
            <div className="text-center text-gray-400 py-12">
              <p>Loading history...</p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <p>No bot sessions found</p>
              <p className="text-sm mt-2">Start running bots to see your history here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSessions.map((session: any) => {
                const isSelected = selectedSessions.includes(session.id);
                
                return (
                <div
                  key={session.id}
                  className={`bg-gray-800 rounded-xl p-6 border ${
                    compareMode && isSelected
                      ? 'border-purple-500'
                      : 'border-gray-700'
                  } ${
                    compareMode ? 'cursor-pointer hover:border-purple-400' : ''
                  }`}
                  onClick={() => {
                    if (compareMode) {
                      if (isSelected) {
                        setSelectedSessions(prev => prev.filter(id => id !== session.id));
                      } else if (selectedSessions.length < 5) {
                        setSelectedSessions(prev => [...prev, session.id]);
                      }
                    }
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-white font-semibold text-lg">
                        {session.botName || 'Unnamed Bot'}
                      </h3>
                      <p className="text-gray-400 text-sm mt-1">
                        {session.market} • {session.contractType} • Stake: ${(session.stake || 0) / 100}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      session.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                      session.status === 'stopped' ? 'bg-red-500/20 text-red-500' :
                      'bg-yellow-500/20 text-yellow-500'
                    }`}>
                      {session.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-gray-400 text-xs">Total Runs</p>
                      <p className="text-white font-semibold">{session.runs}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Won / Lost</p>
                      <p className="text-white font-semibold">
                        <span className="text-green-500">{session.won}</span> / 
                        <span className="text-red-500 ml-1">{session.lost}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Total Profit</p>
                      <p className={`font-semibold ${
                        (session.profit || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        ${((session.profit || 0) / 100).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Duration</p>
                      <p className="text-white font-semibold">
                        {session.endedAt && session.startedAt 
                          ? `${Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)}m`
                          : 'N/A'
                        }
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>
                      Started: {new Date(session.startedAt).toLocaleString()}
                    </span>
                    {session.endedAt && (
                      <span>
                        Ended: {new Date(session.endedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  
                  {compareMode && (
                    <div className="mt-4 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-400">
                        {isSelected ? 'Selected for comparison' : 'Click to select'}
                      </span>
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
