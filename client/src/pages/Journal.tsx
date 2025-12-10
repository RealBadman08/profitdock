import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface JournalEntry {
    id: string;
    date: string;
    symbol: string;
    result: 'WIN' | 'LOSS';
    profit: number;
    notes: string;
}

export default function Journal() {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [showForm, setShowForm] = useState(false);

    // Form State
    const [symbol, setSymbol] = useState('');
    const [result, setResult] = useState<'WIN' | 'LOSS'>('WIN');
    const [profit, setProfit] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('trading_journal');
        if (saved) {
            setEntries(JSON.parse(saved));
        }
    }, []);

    const saveEntries = (newEntries: JournalEntry[]) => {
        setEntries(newEntries);
        localStorage.setItem('trading_journal', JSON.stringify(newEntries));
    };

    const handleSubmit = () => {
        if (!symbol || !profit) {
            toast.error('Please fill in required fields');
            return;
        }

        const newEntry: JournalEntry = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            symbol,
            result,
            profit: parseFloat(profit),
            notes
        };

        saveEntries([newEntry, ...entries]);
        toast.success('Entry added');
        setShowForm(false);
        resetForm();
    };

    const handleDelete = (id: string) => {
        saveEntries(entries.filter(e => e.id !== id));
        toast.success('Entry deleted');
    };

    const resetForm = () => {
        setSymbol('');
        setResult('WIN');
        setProfit('');
        setNotes('');
    };

    const totalProfit = entries.reduce((acc, curr) => acc + (curr.result === 'WIN' ? curr.profit : -Math.abs(curr.profit)), 0);

    return (
        <div className="min-h-screen bg-[#1A1A1A] p-6">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Trading Journal</h1>
                        <p className="text-gray-400">Track your performance and learn from your trades</p>
                    </div>
                    <Button onClick={() => setShowForm(!showForm)} className="bg-[#C026D3] hover:bg-[#A021B3]">
                        <Plus className="w-4 h-4 mr-2" />
                        New Entry
                    </Button>
                </div>

                {/* Stats Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <Card className="bg-[#2A2A2A] border-gray-800 p-4">
                        <p className="text-gray-400 text-sm">Total P/L</p>
                        <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ${totalProfit.toFixed(2)}
                        </p>
                    </Card>
                    <Card className="bg-[#2A2A2A] border-gray-800 p-4">
                        <p className="text-gray-400 text-sm">Win Rate</p>
                        <p className="text-2xl font-bold text-white">
                            {entries.length > 0
                                ? ((entries.filter(e => e.result === 'WIN').length / entries.length) * 100).toFixed(1)
                                : 0}%
                        </p>
                    </Card>
                    <Card className="bg-[#2A2A2A] border-gray-800 p-4">
                        <p className="text-gray-400 text-sm">Total Trades</p>
                        <p className="text-2xl font-bold text-white">{entries.length}</p>
                    </Card>
                </div>

                {showForm && (
                    <Card className="bg-[#2A2A2A] border-gray-800 p-6 mb-8 animate-in slide-in-from-top-4">
                        <h3 className="text-white font-semibold mb-4">New Journal Entry</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-gray-400 text-sm block mb-1">Symbol</label>
                                <Input
                                    value={symbol} onChange={e => setSymbol(e.target.value)}
                                    placeholder="e.g. Volatility 100"
                                    className="bg-[#1A1A1A] border-gray-700 text-white"
                                />
                            </div>
                            <div>
                                <label className="text-gray-400 text-sm block mb-1">Result</label>
                                <div className="flex gap-2">
                                    <Button
                                        className={`flex-1 ${result === 'WIN' ? 'bg-green-600' : 'bg-[#1A1A1A] border border-gray-700'}`}
                                        onClick={() => setResult('WIN')}
                                    >WIN</Button>
                                    <Button
                                        className={`flex-1 ${result === 'LOSS' ? 'bg-red-600' : 'bg-[#1A1A1A] border border-gray-700'}`}
                                        onClick={() => setResult('LOSS')}
                                    >LOSS</Button>
                                </div>
                            </div>
                            <div>
                                <label className="text-gray-400 text-sm block mb-1">Profit/Loss Amount ($)</label>
                                <Input
                                    type="number"
                                    value={profit} onChange={e => setProfit(e.target.value)}
                                    placeholder="0.00"
                                    className="bg-[#1A1A1A] border-gray-700 text-white"
                                />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="text-gray-400 text-sm block mb-1">Notes & Strategy</label>
                            <Textarea
                                value={notes} onChange={e => setNotes(e.target.value)}
                                placeholder="What strategy did you use? Why did you enter?"
                                className="bg-[#1A1A1A] border-gray-700 text-white"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowForm(false)} className="text-gray-400">Cancel</Button>
                            <Button onClick={handleSubmit} className="bg-[#C026D3] hover:bg-[#A021B3]">Save Entry</Button>
                        </div>
                    </Card>
                )}

                <div className="space-y-4">
                    {entries.map((entry) => (
                        <Card key={entry.id} className="bg-[#2A2A2A] border-gray-800 p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${entry.result === 'WIN' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                            {entry.result}
                                        </span>
                                        <span className="text-white font-semibold">{entry.symbol}</span>
                                        <span className="text-gray-500 text-sm flex items-center">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {new Date(entry.date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-gray-400 text-sm mt-2">{entry.notes}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`font-bold text-lg ${entry.result === 'WIN' ? 'text-green-500' : 'text-red-500'}`}>
                                        {entry.result === 'WIN' ? '+' : '-'}${Math.abs(entry.profit).toFixed(2)}
                                    </p>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDelete(entry.id)}
                                        className="text-gray-500 hover:text-red-500 mt-2 h-6"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}

                    {entries.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            <p>No journal entries yet. Start tracking your trades!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
