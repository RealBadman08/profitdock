import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Session {
  id: number;
  botName: string | null;
  market: string | null;
  runs: number | null;
  won: number | null;
  lost: number | null;
  profit: number | null;
  totalStake: number | null;
  totalPayout: number | null;
  startedAt: Date;
  endedAt: Date | null;
}

interface SessionComparisonProps {
  sessions: Session[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function SessionComparison({ sessions }: SessionComparisonProps) {
  if (sessions.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
        <p className="text-gray-400">Select 2-5 sessions to compare</p>
      </div>
    );
  }

  // Prepare comparison data
  const comparisonData = sessions.map((session, index) => ({
    name: session.botName || `Session ${session.id}`,
    profit: (session.profit || 0) / 100,
    winRate: (session.runs || 0) > 0 ? ((session.won || 0) / (session.runs || 1)) * 100 : 0,
    totalRuns: session.runs || 0,
    color: COLORS[index % COLORS.length],
  }));

  const profitData = sessions.map((session, index) => ({
    name: `Session ${session.id}`,
    profit: (session.profit || 0) / 100,
    fill: COLORS[index % COLORS.length],
  }));

  const winRateData = sessions.map((session, index) => ({
    name: `Session ${session.id}`,
    winRate: (session.runs || 0) > 0 ? ((session.won || 0) / (session.runs || 1)) * 100 : 0,
    fill: COLORS[index % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Comparison Header */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-white text-xl font-bold mb-4">Comparing {sessions.length} Sessions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sessions.map((session, index) => (
            <div key={session.id} className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <h4 className="text-white font-semibold">
                  {session.botName || `Session ${session.id}`}
                </h4>
              </div>
              <p className="text-gray-400 text-sm">{session.market}</p>
              <p className="text-gray-400 text-sm">
                {new Date(session.startedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Profit Comparison Chart */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-white text-lg font-semibold mb-4">Profit Comparison</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={profitData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff',
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit']}
            />
            <Bar dataKey="profit" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Win Rate Comparison Chart */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-white text-lg font-semibold mb-4">Win Rate Comparison</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={winRateData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff',
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Win Rate']}
            />
            <Bar dataKey="winRate" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Statistics Table */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-white text-lg font-semibold mb-4">Detailed Statistics</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 font-medium pb-3">Session</th>
                <th className="text-right text-gray-400 font-medium pb-3">Total Runs</th>
                <th className="text-right text-gray-400 font-medium pb-3">Won</th>
                <th className="text-right text-gray-400 font-medium pb-3">Lost</th>
                <th className="text-right text-gray-400 font-medium pb-3">Win Rate</th>
                <th className="text-right text-gray-400 font-medium pb-3">Total Profit</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session, index) => {
                const winRate = (session.runs || 0) > 0 ? ((session.won || 0) / (session.runs || 1)) * 100 : 0;
                const profit = (session.profit || 0) / 100;
                
                return (
                  <tr key={session.id} className="border-b border-gray-700">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-white">
                          {session.botName || `Session ${session.id}`}
                        </span>
                      </div>
                    </td>
                    <td className="text-right text-white">{session.runs || 0}</td>
                    <td className="text-right text-green-500">{session.won || 0}</td>
                    <td className="text-right text-red-500">{session.lost || 0}</td>
                    <td className="text-right text-white">{winRate.toFixed(1)}%</td>
                    <td className={`text-right font-semibold ${
                      profit >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      ${profit.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
