import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Localize, localize } from '@deriv-com/translations';
import { MarketIcon } from '@/components/market/market-icon';
import { TradeTypeIcon } from '@/components/trade-type/trade-type-icon';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { getMarketsWithoutStepBoomCrashRange } from '@/features/deriv-live/api';
import { MarketSymbol } from '@/features/deriv-live/types';
import { useStore } from '@/hooks/useStore';
import { emitProfitdockTradeStatus } from '@/utils/profitdock-trade-controller';
import './matchtool.scss';

type ApiLike = {
    onMessage: () => { subscribe: (callback: (message: unknown) => void) => { unsubscribe: () => void } };
    send: (payload: Record<string, unknown>) => Promise<Record<string, any>>;
};

interface DigitPick {
    digit: number;
    count: number;
    type: 'hot' | 'cold';
}

interface SettledContract {
    pick: DigitPick;
    profit: number;
    contractId?: number;
}

const LOOKBACK_TICK_COUNT = 1000;

function pickHotAndColdDigits(digitHistory: number[], totalPredictions: number): DigitPick[] {
    const counts = new Array(10).fill(0);
    digitHistory.forEach(d => counts[d]++);

    const sortedAscending = Array.from({ length: 10 }, (_, d) => d).sort((a, b) => counts[a] - counts[b]);

    const hotCount = Math.ceil(totalPredictions / 2);
    const coldCount = totalPredictions - hotCount;

    const coldDigits = sortedAscending.slice(0, coldCount).map(d => ({
        digit: d,
        count: counts[d],
        type: 'cold' as const,
    }));

    const hotDigits = sortedAscending.slice(-hotCount).map(d => ({
        digit: d,
        count: counts[d],
        type: 'hot' as const,
    }));

    return [...hotDigits, ...coldDigits];
}

const waitForSettlement = (api: ApiLike, contractId: number): Promise<{ profit: number; won: boolean }> => {
    return new Promise(resolve => {
        const reqId = Date.now() + Math.random();
        api.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1, req_id: reqId });
        
        const subscription = api.onMessage().subscribe((msg: any) => {
            if (msg.proposal_open_contract?.contract_id === contractId && msg.proposal_open_contract?.is_sold) {
                subscription.unsubscribe();
                const profit = Number(msg.proposal_open_contract.profit);
                const won = profit > 0;
                resolve({ profit, won });
            }
        });
    });
};

const buyContract = async (api: ApiLike, payload: any): Promise<number> => {
    const response = await api.send(payload);
    if (response.error) {
        throw new Error(response.error.message);
    }
    return response.buy.contract_id;
};

const MatchtoolPage = observer(() => {
    const { client, transactions } = useStore();
    const activeSymbols = client?.active_symbols || [];
    const allMarkets = useMemo(() => getMarketsWithoutStepBoomCrashRange(activeSymbols), [activeSymbols]);

    const [supportedMarkets, setSupportedMarkets] = useState<MarketSymbol[]>([]);
    const [selectedMarket, setSelectedMarket] = useState<string>('');
    const [stake, setStake] = useState<string>('');
    const [predictions, setPredictions] = useState<string>('');
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastRound, setLastRound] = useState<SettledContract[]>([]);

    useEffect(() => {
        emitProfitdockTradeStatus({
            canStop: false, // One-shot execution doesn't support cancelling mid-flight
            feature: 'flipper', // using an existing feature key to satisfy union type
            label: 'MatchTool',
            running: isRunning,
        });
    }, [isRunning]);

    useEffect(() => {
        let isMounted = true;
        const fetchSupported = async () => {
            if (!allMarkets.length) return;
            const api = api_base.api as ApiLike | undefined;
            if (!api) return;

            const results: MarketSymbol[] = [];
            for (const market of allMarkets) {
                try {
                    const reqId = Date.now() + Math.random();
                    api.send({ contracts_for: market.symbol, currency: 'USD', req_id: reqId });
                    
                    const response = await new Promise<any>(resolve => {
                        const sub = api.onMessage().subscribe((msg: any) => {
                            if (msg.req_id === reqId) {
                                sub.unsubscribe();
                                resolve(msg);
                            }
                        });
                    });

                    const supportsMatch = response.contracts_for?.available?.some(
                        (c: any) => c.contract_type === 'DIGITMATCH'
                    );
                    if (supportsMatch) {
                        results.push(market);
                    }
                } catch (e) {
                    console.warn('[MATCHTOOL] Failed to fetch contracts_for', e);
                }
            }
            if (isMounted) {
                setSupportedMarkets(results);
                if (results.length > 0 && !selectedMarket) {
                    setSelectedMarket(results[0].symbol);
                }
            }
        };
        fetchSupported();
        return () => {
            isMounted = false;
        };
    }, [allMarkets]);

    const fetchRecentDigitHistory = async (api: ApiLike, symbol: string): Promise<number[]> => {
        return new Promise((resolve, reject) => {
            const reqId = Date.now() + Math.random();
            api.send({
                ticks_history: symbol,
                count: LOOKBACK_TICK_COUNT,
                end: 'latest',
                style: 'ticks',
                req_id: reqId,
            }).catch(reject);

            const sub = api.onMessage().subscribe((msg: any) => {
                if (msg.req_id === reqId) {
                    sub.unsubscribe();
                    const prices: number[] = msg.history?.prices ?? [];
                    const pipSize = msg.pip_size ?? 2;
                    const digits = prices.map(p => parseInt(p.toFixed(pipSize).slice(-1)));
                    resolve(digits);
                }
            });
        });
    };

    const handleRun = async () => {
        const predictionCount = parseInt(predictions);
        const stakeAmount = parseFloat(stake);

        if (isNaN(predictionCount) || predictionCount < 1 || predictionCount > 9) {
            setError('Predictions must be between 1 and 9.');
            return;
        }

        if (isNaN(stakeAmount) || stakeAmount <= 0) {
            setError('Stake must be a positive number.');
            return;
        }

        if (!selectedMarket) {
            setError('Please select a market.');
            return;
        }

        const api = api_base.api as ApiLike | undefined;
        if (!api) {
            setError('API connection not ready.');
            return;
        }

        setError(null);
        setIsRunning(true);
        setLastRound([]);

        try {
            const digitHistory = await fetchRecentDigitHistory(api, selectedMarket);
            if (digitHistory.length === 0) {
                throw new Error('Failed to fetch tick history for digit analysis.');
            }

            const picks = pickHotAndColdDigits(digitHistory, predictionCount);
            console.log('[MATCHTOOL]', 'picks=', picks);

            const buyPromises = picks.map(pick =>
                buyContract(api, {
                    buy: 1,
                    price: stakeAmount,
                    parameters: {
                        contract_type: 'DIGITMATCH',
                        symbol: selectedMarket,
                        basis: 'stake',
                        amount: stakeAmount,
                        currency: 'USD',
                        duration: 1,
                        duration_unit: 't',
                        barrier: pick.digit.toString(),
                    },
                }).then(contractId => ({ pick, contractId }))
            );

            const placed = await Promise.all(buyPromises);

            const settled = await Promise.all(
                placed.map(async ({ pick, contractId }) => {
                    const result = await waitForSettlement(api, contractId);
                    return {
                        pick,
                        profit: result.profit,
                        contractId,
                    };
                })
            );

            settled.forEach(({ pick, profit, contractId }) => {
                console.log('[MATCHTOOL RESULT]', 'digit=', pick.digit, 'type=', pick.type, 'profit=', profit);
                
                // Construct a custom payload to inject into the mobx transactions store
                // We use type casting to fit the store's expected `TContractInfo` properties
                transactions.pushTransaction({
                    contract_id: contractId,
                    contract_type: 'DIGITMATCH',
                    buy_price: stakeAmount,
                    payout: profit > 0 ? profit + stakeAmount : 0,
                    profit: profit,
                    status: profit > 0 ? 'won' : 'lost',
                    underlying: selectedMarket,
                    shortcode: `DIGITMATCH_${selectedMarket}_${stakeAmount}_${pick.digit}_1T`,
                    is_sold: 1,
                    currency: client?.currency || 'USD',
                    transaction_ids: { buy: contractId }, 
                    date_start: Math.floor(Date.now() / 1000),
                } as any);
            });

            setLastRound(settled);
        } catch (err) {
            console.error('[MATCHTOOL ERROR]', err);
            setError(String((err as Error).message || err));
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className='matchtool-page'>
            <header className='matchtool-page__header'>
                <TradeTypeIcon type='DIGITMATCH' size='lg' />
                <Localize i18n_default_text='MATCHTOOL' />
            </header>

            <div className='matchtool-page__controls'>
                <label className='matchtool-page__field'>
                    <Localize i18n_default_text='Market' />
                    <div className='matchtool-page__select-wrap'>
                        <MarketIcon type={selectedMarket} size='sm' />
                        <select value={selectedMarket} onChange={e => setSelectedMarket(e.target.value)} disabled={isRunning}>
                            {supportedMarkets.map(market => (
                                <option key={market.symbol} value={market.symbol}>
                                    {market.display_name}
                                </option>
                            ))}
                        </select>
                    </div>
                </label>

                <label className='matchtool-page__field'>
                    <Localize i18n_default_text='Stake (USD)' />
                    <input
                        type='number'
                        step='0.1'
                        min='0.35'
                        value={stake}
                        onChange={e => setStake(e.target.value)}
                        placeholder='Enter stake...'
                        disabled={isRunning}
                    />
                </label>

                <label className='matchtool-page__field'>
                    <Localize i18n_default_text='Predictions (1-9)' />
                    <input
                        type='number'
                        min='1'
                        max='9'
                        value={predictions}
                        onChange={e => setPredictions(e.target.value)}
                        placeholder='Enter 1 to 9...'
                        disabled={isRunning}
                    />
                </label>

                {error && <div className='matchtool-page__error'>{error}</div>}

                <button className='matchtool-page__run-btn' onClick={handleRun} disabled={isRunning || !supportedMarkets.length}>
                    {isRunning ? localize('RUNNING...') : localize('▶ RUN')}
                </button>
            </div>

            {lastRound.length > 0 && (
                <div>
                    <h2 className='matchtool-page__results-title'>
                        <Localize i18n_default_text='This Round' />
                    </h2>
                    <table className='matchtool-page__table'>
                        <thead>
                            <tr>
                                <th><Localize i18n_default_text='Digit' /></th>
                                <th><Localize i18n_default_text='Type' /></th>
                                <th><Localize i18n_default_text='Frequency' /></th>
                                <th><Localize i18n_default_text='Result' /></th>
                                <th><Localize i18n_default_text='P&L' /></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lastRound.map((result, i) => {
                                const won = result.profit > 0;
                                return (
                                    <tr key={i}>
                                        <td>{result.pick.digit}</td>
                                        <td style={{ textTransform: 'capitalize' }}>{result.pick.type}</td>
                                        <td>{result.pick.count}</td>
                                        <td className={won ? 'matchtool-page__profit--win' : 'matchtool-page__profit--loss'}>
                                            {won ? 'Win' : 'Loss'}
                                        </td>
                                        <td className={won ? 'matchtool-page__profit--win' : 'matchtool-page__profit--loss'}>
                                            {result.profit > 0 ? `+${result.profit.toFixed(2)}` : result.profit.toFixed(2)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
});

export default MatchtoolPage;
