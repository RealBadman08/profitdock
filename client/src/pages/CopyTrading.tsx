import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Play, StopCircle, RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getDerivWS } from '@/services/derivWebSocket';

export default function CopyTrading() {
    const [token, setToken] = useState('');
    const [isCopying, setIsCopying] = useState(false);
    const [loading, setLoading] = useState(false);
    const derivWS = getDerivWS();

    const handleStartCopy = async () => {
        if (!token) {
            toast.error('Please enter a trader token');
            return;
        }
        setLoading(true);
        try {
            const response = await derivWS.copyStart(token);
            if (response.error) {
                toast.error(response.error.message);
            } else {
                setIsCopying(true);
                toast.success('Copy trading started successfully!');
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to start copy trading');
        } finally {
            setLoading(false);
        }
    };

    const handleStopCopy = async () => {
        setLoading(true);
        try {
            const response = await derivWS.copyStop(token);
            if (response.error) {
                toast.error(response.error.message);
            } else {
                setIsCopying(false);
                toast.success('Copy trading stopped');
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to stop copy trading');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#1A1A1A] p-6 text-white">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Users className="text-[#C026D3] w-8 h-8" />
                            Copy Trading
                        </h1>
                        <p className="text-gray-400 mt-1">Automatically copy trades from expert traders</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isCopying ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
                        <span className="text-sm font-medium">{isCopying ? 'COPYING ACTIVE' : 'IDLE'}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-[#2A2A2A] border-gray-800">
                        <CardHeader>
                            <CardTitle className="text-white">Configuration</CardTitle>
                            <CardDescription className="text-gray-400">Enter the token of the trader you wish to copy</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Trader Token</label>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Enter API Token..."
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        className="bg-[#1A1A1A] border-gray-700 text-white font-mono"
                                        disabled={isCopying}
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    You can find trader tokens in community channels or shared by mentors.
                                </p>
                            </div>

                            {!isCopying ? (
                                <Button
                                    className="w-full bg-[#C026D3] hover:bg-[#A021B3] text-white"
                                    onClick={handleStartCopy}
                                    disabled={loading}
                                >
                                    {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                    Start Copying
                                </Button>
                            ) : (
                                <Button
                                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                                    onClick={handleStopCopy}
                                    disabled={loading}
                                >
                                    {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <StopCircle className="w-4 h-4 mr-2" />}
                                    Stop Copying
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-[#2A2A2A] border-gray-800">
                        <CardHeader>
                            <CardTitle className="text-white">Active Copies</CardTitle>
                            <CardDescription className="text-gray-400">Current active copy trading sessions</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isCopying ? (
                                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-start gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                                    <div>
                                        <h4 className="font-semibold text-green-500">Active Session</h4>
                                        <p className="text-sm text-gray-300 mt-1">
                                            Copying trades from token: <span className="font-mono text-white bg-black/30 px-1 rounded">{token.substring(0, 8)}...</span>
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <Copy className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>No active copy trading sessions</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
