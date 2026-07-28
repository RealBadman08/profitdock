import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { MarketIcon } from '@/components/market/market-icon';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { TradeTypeIcon } from '@/components/trade-type/trade-type-icon';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import {
    getStoredProfitdockAccounts,
    getStoredProfitdockActiveCurrency,
    hasUsableProfitdockStoredSession,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { isExcludedSyntheticMarket, normalizeApiMessage } from '@/features/deriv-live/api';
import { getProfitdockActiveSymbols } from '@/features/deriv-live/markets';
import { MarketSymbol } from '@/features/deriv-live/types';
import { useApiBase } from '@/hooks/useApiBase';
import { useProfitdockPersistentState } from '@/hooks/useProfitdockPersistentState';
import { useStore } from '@/hooks/useStore';
import {
    emitProfitdockTradeStatus,
    subscribeProfitdockTradeStart,
    subscribeProfitdockTradeStop,
} from '@/utils/profitdock-trade-controller';
import { getProfitdockPublicSocketUrl } from '@/external/bot-skeleton/services/api/appId';
import { ProposalOpenContract } from '@deriv/api-types';
import { localize } from '@deriv-com/translations';
import './matchtool.scss';

type ApiLike = {
    connection?: { readyState?: number };
    onMessage: () => { subscribe: (callback: (message: unknown) => void) => { unsubscribe: () => void } };
    send: (payload: Record<string, unknown>) => Promise<Record<string, any>>;
};

type MatchMarket = MarketSymbol & { display_order?: number; supportedContracts: string[] };
type StoredAccount = {
    account_type?: string;
    currency?: string;
    is_virtual?: boolean;
    loginid: string;
    token?: string;
};
type PublicRequestResponse = {
    active_symbols?: MatchMarket[];
    contracts_for?: { available?: Array<{ contract_type?: string }> };
    error?: { code?: string; message?: string };
    history?: { prices?: number[] };
    msg_type?: string;
    pip_size?: number;
    subscription?: { id?: string };
    tick?: { epoch: number; pip_size?: number; quote: number; symbol: string };
};
type DigitPick = {
    count: number;
    digit: number;
    frequency: number;
};
type DigitModel = {
    counts: number[];
    frequencies: number[];
    total: number;
};
type ProposalResponse = {
    error?: { code?: string; message?: string };
    proposal?: { ask_price?: number; id?: string; longcode?: string; spot?: number };
};
type BuyResponse = {
    buy?: { buy_price?: number; contract_id?: number; longcode?: string; transaction_id?: number };
    error?: { code?: string; message?: string };
};
type OpenContractResponse = {
    error?: { message?: string };
    msg_type?: string;
    proposal_open_contract?: ProposalOpenContract;
    subscription?: { id?: string };
};
type RoundRow = DigitPick & {
    contractId?: number;
    profit?: number;
    result: 'pending' | 'placed' | 'won' | 'lost' | 'error';
};

const DERIV_PUBLIC_WS_URL = getProfitdockPublicSocketUrl();
const LOOKBACK_TICK_COUNT = 1000;
const ANALYSIS_TICK_OPTIONS = [25, 50, 100, 1000];
const MATCHTOOL_FEATURE = 'matchtool' as const;

const publicRequest = <T extends PublicRequestResponse>(payload: Record<string, unknown>, timeoutMs = 14000) =>
    new Promise<T>((resolve, reject) => {
        const reqId = Date.now() + Math.floor(Math.random() * 100000);
        const socket = new WebSocket(DERIV_PUBLIC_WS_URL);
        const timeout = window.setTimeout(() => {
            socket.close();
            reject(new Error('Deriv request timed out.'));
        }, timeoutMs);

        socket.onopen = () => {
            socket.send(JSON.stringify({ ...payload, req_id: reqId }));
        };
        socket.onmessage = event => {
            const data = JSON.parse(String(event.data)) as T & { req_id?: number };
            if (data.req_id !== reqId) return;
            window.clearTimeout(timeout);
            socket.close();
            if (data.error) {
                reject(new Error(data.error.message || 'Deriv request failed.'));
                return;
            }
            resolve(data);
        };
        socket.onerror = () => {
            window.clearTimeout(timeout);
            socket.close();
            reject(new Error('Unable to reach Deriv.'));
        };
    });

const getDigitFromPrice = (price: number, pipSize: number) => Number(price.toFixed(pipSize).slice(-1));
const getPipSizeFromMarket = (market?: MatchMarket | null) => {
    const pip = typeof market?.pip === 'number' ? market.pip : Number(market?.pip);
    if (Number.isFinite(pip) && pip > 0) {
        return Math.max(0, Math.round(Math.abs(Math.log10(pip))));
    }
    return 2;
};
const isDemoLoginId = (loginid?: string) => /^(VR|VRTC|VRW)/i.test(String(loginid || ''));
const isDemoAccount = (account?: Partial<StoredAccount> | null) =>
    account?.account_type === 'demo' || account?.is_virtual === true || isDemoLoginId(account?.loginid);
const getDerivApi = () => api_base.api as ApiLike | undefined;
const getActiveTransactionAccountId = () => api_base.account_id || localStorage.getItem('active_loginid') || undefined;
const getStoredDemoAccount = () => getStoredProfitdockAccounts().find(account => isDemoAccount(account)) || null;
const getAccountListDemoAccount = (accountList: Array<Partial<StoredAccount>>) =>
    accountList.find(account => isDemoAccount(account)) || null;
const isDigitMatchCandidateMarket = (market: MatchMarket) =>
    market.exchange_is_open !== 0 &&
    market.market?.toLowerCase() === 'synthetic_index' &&
    market.submarket?.toLowerCase() === 'random_index' &&
    market.display_name?.toLowerCase().includes('volatility') &&
    !isExcludedSyntheticMarket(market);
const getActiveStoredAccount = () => {
    const activeLoginId = localStorage.getItem('active_loginid') || api_base.account_id || '';
    const accounts = getStoredProfitdockAccounts();
    return accounts.find(account => account.loginid === activeLoginId) || accounts[0] || null;
};
const isDerivSocketOpen = () => Number(getDerivApi()?.connection?.readyState) === WebSocket.OPEN;
const hasTradingSession = () => {
    const activeLoginId = localStorage.getItem('active_loginid') || '';
    const selectedAccountOk =
        !isCustomLegacyOAuthDomain() || !activeLoginId || !api_base.account_id || api_base.account_id === activeLoginId;

    return Boolean(
        isDerivSocketOpen() &&
            selectedAccountOk &&
            (isCustomLegacyOAuthDomain() ? api_base.has_authenticated_profitdock_socket : api_base.is_authorized)
    );
};
const toPositiveNumber = (value: string | number, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const toPredictionCount = (value: string | number) => {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoney = (value: number, currency: string) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(2)} ${currency}`;
const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const buildDigitModel = (digits: number[]): DigitModel => {
    const counts = new Array(10).fill(0);
    digits.forEach(digit => {
        if (digit >= 0 && digit <= 9) counts[digit] += 1;
    });
    const total = digits.length;
    const frequencies = counts.map(count => (total ? count / total : 0));
    return { counts, frequencies, total };
};

const pickTopDigits = (digitHistory: number[], totalPredictions: number): DigitPick[] => {
    const model = buildDigitModel(digitHistory);
    const sortedAscending = Array.from({ length: 10 }, (_, digit) => digit).sort(
        (left, right) => model.counts[left] - model.counts[right] || left - right
    );
    return sortedAscending.slice(-totalPredictions).map(digit => ({
        count: model.counts[digit],
        digit,
        frequency: model.frequencies[digit],
    }));
};

const fetchRecentDigitHistory = async (symbol: string, count = LOOKBACK_TICK_COUNT) => {
    const response = await publicRequest<PublicRequestResponse>({
        count,
        end: 'latest',
        style: 'ticks',
        ticks_history: symbol,
    });
    const pipSize = typeof response.pip_size === 'number' ? response.pip_size : 2;
    const prices = response.history?.prices || [];
    return {
        digits: prices.map(price => getDigitFromPrice(Number(price), pipSize)).slice(-count),
        pipSize,
    };
};

const subscribeToContract = async (
    api: ApiLike,
    contractId: number,
    onUpdate: (contract: ProposalOpenContract) => void,
    onError: (message: string) => void
) => {
    let subscriptionId = '';
    const messageSubscription = api.onMessage().subscribe(message => {
        const data = normalizeApiMessage<OpenContractResponse>(message);
        if (data?.msg_type !== 'proposal_open_contract') return;
        if (data.error) {
            onError(data.error.message || 'Unable to monitor MatchTool contract.');
            return;
        }
        if (data.proposal_open_contract?.contract_id === contractId) {
            if (data.subscription?.id) subscriptionId = data.subscription.id;
            onUpdate(data.proposal_open_contract);
        }
    });

    try {
        const response = normalizeApiMessage<OpenContractResponse>(
            await api.send({ contract_id: contractId, proposal_open_contract: 1, subscribe: 1 })
        );
        if (response?.error) throw new Error(response.error.message || 'Unable to monitor MatchTool contract.');
        if (response?.subscription?.id) subscriptionId = response.subscription.id;
        if (response?.proposal_open_contract) onUpdate(response.proposal_open_contract);
    } catch (error) {
        messageSubscription.unsubscribe();
        onError(error instanceof Error ? error.message : 'Unable to monitor MatchTool contract.');
        return () => undefined;
    }

    return () => {
        messageSubscription.unsubscribe();
        if (subscriptionId) void api.send({ forget: subscriptionId }).catch(() => undefined);
    };
};

const waitForSettlement = (api: ApiLike, contractId: number, onUpdate: (contract: ProposalOpenContract) => void) =>
    new Promise<number>((resolve, reject) => {
        let cleanup: (() => void) | null = null;
        let resolved = false;

        subscribeToContract(
            api,
            contractId,
            contract => {
                onUpdate(contract);
                if (!resolved && (contract.status === 'won' || contract.status === 'lost')) {
                    resolved = true;
                    cleanup?.();
                    resolve(Number(contract.profit || 0));
                }
            },
            errorMessage => {
                if (!resolved) {
                    resolved = true;
                    cleanup?.();
                    reject(new Error(errorMessage));
                }
            }
        )
            .then(cleanupFn => {
                cleanup = cleanupFn;
                if (resolved) cleanup?.();
            })
            .catch(reject);
    });

const requestProposalThenBuy = async ({
    api,
    currency,
    digit,
    stake,
    symbol,
}: {
    api: ApiLike;
    currency: string;
    digit: number;
    stake: number;
    symbol: string;
}) => {
    const proposalPayload: Record<string, unknown> = {
        amount: stake,
        basis: 'stake',
        barrier: String(digit),
        contract_type: 'DIGITMATCH',
        currency,
        duration: 1,
        duration_unit: 't',
        proposal: 1,
    };
    proposalPayload[isCustomLegacyOAuthDomain() ? 'underlying_symbol' : 'symbol'] = symbol;

    const proposalResponse = normalizeApiMessage<ProposalResponse>(await api.send(proposalPayload));
    if (proposalResponse?.error || !proposalResponse?.proposal?.id || typeof proposalResponse.proposal.ask_price !== 'number') {
        throw new Error(
            [proposalResponse?.error?.code, proposalResponse?.error?.message || 'Unable to request a MatchTool proposal.']
                .filter(Boolean)
                .join(': ')
        );
    }

    const buyResponse = normalizeApiMessage<BuyResponse>(
        await api.send({ buy: proposalResponse.proposal.id, price: String(proposalResponse.proposal.ask_price) })
    );
    if (buyResponse?.error || !buyResponse?.buy?.contract_id) {
        throw new Error(
            [buyResponse?.error?.code, buyResponse?.error?.message || 'Unable to place MatchTool trade.']
                .filter(Boolean)
                .join(': ')
        );
    }

    return buyResponse.buy;
};

const ResultBadge = ({ result }: { result: RoundRow['result'] }) => (
    <span className={`matchtool-page__result matchtool-page__result--${result}`}>
        {result === 'won' ? 'Win' : result === 'lost' ? 'Loss' : result === 'error' ? 'Error' : result === 'placed' ? 'Placed' : 'Pending'}
    </span>
);

const MatchtoolPage = observer(() => {
    const { accountList, activeLoginid, authData, connectionStatus } = useApiBase();
    const { transactions } = useStore();
    const [markets, setMarkets] = useState<MatchMarket[]>([]);
    const [selectedMarket, setSelectedMarket] = useProfitdockPersistentState('profitdock.matchtool.market', '');
    const [analysisTicks, setAnalysisTicks] = useProfitdockPersistentState('profitdock.matchtool.ticks', '1000');
    const [stake, setStake] = useProfitdockPersistentState('profitdock.matchtool.stake', '');
    const [predictionCount, setPredictionCount] = useProfitdockPersistentState('profitdock.matchtool.predictions', '');
    const [analysisDigits, setAnalysisDigits] = useState<number[]>([]);
    const [pipSize, setPipSize] = useState(2);
    const [isLoadingMarkets, setIsLoadingMarkets] = useState(true);
    const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [roundRows, setRoundRows] = useState<RoundRow[]>([]);
    const stopRequestedRef = useRef(false);
    const runningRef = useRef(false);
    const tickSocketRef = useRef<WebSocket | null>(null);
    const tickSubscriptionIdRef = useRef<string | null>(null);

    const currency = authData?.currency || getStoredProfitdockActiveCurrency() || 'USD';
    const analysisTickCount = Number(analysisTicks) || 1000;
    const selectedMarketInfo = useMemo(
        () => markets.find(market => market.symbol === selectedMarket) || markets[0] || null,
        [markets, selectedMarket]
    );
    const model = useMemo(() => buildDigitModel(analysisDigits), [analysisDigits]);
    const parsedPredictionCount = toPredictionCount(predictionCount);
    const topNDigits = useMemo(() => {
        const n = parsedPredictionCount >= 1 && parsedPredictionCount <= 9 ? parsedPredictionCount : 0;
        return Array.from({ length: 10 }, (_, digit) => ({
            digit,
            frequency: model.frequencies[digit] || 0,
        }))
            .sort((a, b) => b.frequency - a.frequency || a.digit - b.digit)
            .slice(0, n)
            .map(x => x.digit);
    }, [model, parsedPredictionCount]);
    const topNDigitsSet = useMemo(() => new Set(topNDigits), [topNDigits]);
    const top6Digits = useMemo(() => {
        return Array.from({ length: 10 }, (_, digit) => ({
            digit,
            frequency: model.frequencies[digit] || 0,
        }))
            .sort((a, b) => b.frequency - a.frequency || a.digit - b.digit)
            .slice(0, 6)
            .map(x => x.digit);
    }, [model]);

    const activeAccount = useMemo(() => {
        const accountFromHook =
            accountList.find(account => account.loginid === activeLoginid) || accountList.find(account => isDemoAccount(account));
        return accountFromHook || getActiveStoredAccount();
    }, [accountList, activeLoginid]);

    const ensureTradingApi = useCallback(async () => {
        const currentAccount = activeAccount;
        if (!currentAccount?.loginid) {
            throw new Error('Log in to an account before running MatchTool.');
        }

        if (localStorage.getItem('active_loginid') !== currentAccount.loginid) {
            localStorage.setItem('active_loginid', currentAccount.loginid);
            if (currentAccount.token) localStorage.setItem('authToken', currentAccount.token);
        }

        if (!hasTradingSession()) {
            if (isCustomLegacyOAuthDomain() && hasUsableProfitdockStoredSession()) {
                await api_base.init(true);
            } else {
                throw new Error('MatchTool requires an active trading session.');
            }
        }

        const api = getDerivApi();
        if (!api || !hasTradingSession()) {
            throw new Error('ProfitDock is still reconnecting to the trading session.');
        }

        return api;
    }, [activeAccount]);

    useEffect(() => {
        let isCancelled = false;
        const loadMarkets = async () => {
            setIsLoadingMarkets(true);
            setFeedback(null);
            try {
                let activeSymbols = (await getProfitdockActiveSymbols()) as MatchMarket[];
                if (!activeSymbols.length) {
                    const response = await publicRequest<PublicRequestResponse>({ active_symbols: 'brief' });
                    activeSymbols = (response.active_symbols || []).map(m => ({
                        ...m,
                        symbol: m.symbol || m.underlying_symbol,
                        display_name: m.display_name || m.underlying_symbol_name
                    })) as any;
                }

                const candidates = activeSymbols
                    .filter(isDigitMatchCandidateMarket)
                    .sort((left, right) => (left.display_order || 0) - (right.display_order || 0));
                
                if (isCancelled) return;
                
                setMarkets(candidates);
                setSelectedMarket(previous =>
                    candidates.some(market => market.symbol === previous)
                        ? previous
                        : candidates.find(market => market.symbol === '1HZ10V')?.symbol || candidates[0]?.symbol || previous
                );
                if (!candidates.length) setFeedback('No confirmed Digit Match markets are available right now.');
            } catch (error) {
                if (!isCancelled) {
                    setFeedback(error instanceof Error ? error.message : 'Unable to load MatchTool markets.');
                }
            } finally {
                if (!isCancelled) setIsLoadingMarkets(false);
            }
        };

        void loadMarkets();

        return () => {
            isCancelled = true;
        };
    }, [connectionStatus, currency]);

    useEffect(() => {
        if (!selectedMarket) return undefined;

        let isCancelled = false;
        let hasRequestedStream = false;
        const marketPipSize = getPipSizeFromMarket(selectedMarketInfo);
        setIsLoadingAnalysis(true);
        setAnalysisDigits([]);
        tickSubscriptionIdRef.current = null;
        tickSocketRef.current?.close();

        const socket = new WebSocket(DERIV_PUBLIC_WS_URL);
        tickSocketRef.current = socket;
        const send = (payload: Record<string, unknown>) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
        };

        const timeout = window.setTimeout(() => {
            if (!isCancelled) {
                setIsLoadingAnalysis(false);
                setFeedback('Unable to load the MatchTool tick window.');
            }
            socket.close();
        }, 18000);

        socket.onopen = () => {
            send({
                count: 1000,
                end: 'latest',
                style: 'ticks',
                ticks_history: selectedMarket,
            });
        };

        socket.onmessage = event => {
            const data = normalizeApiMessage<PublicRequestResponse>(JSON.parse(String(event.data)));
            if (!data || isCancelled) return;
            if (data.error) {
                window.clearTimeout(timeout);
                setIsLoadingAnalysis(false);
                setFeedback(data.error.message || 'Unable to load the MatchTool tick window.');
                return;
            }

            if (data.history?.prices) {
                window.clearTimeout(timeout);
                const nextPipSize = typeof data.pip_size === 'number' ? data.pip_size : marketPipSize;
                setPipSize(nextPipSize);
                setAnalysisDigits(data.history.prices.map(price => getDigitFromPrice(Number(price), nextPipSize)).slice(-analysisTickCount));
                setIsLoadingAnalysis(false);
                if (!hasRequestedStream) {
                    hasRequestedStream = true;
                    send({ subscribe: 1, ticks: selectedMarket });
                }
                return;
            }

            if (data.msg_type === 'tick' && data.tick?.symbol === selectedMarket) {
                const nextPipSize = typeof data.tick.pip_size === 'number' ? data.tick.pip_size : pipSize;
                const digit = getDigitFromPrice(data.tick.quote, nextPipSize);
                if (data.subscription?.id) tickSubscriptionIdRef.current = data.subscription.id;
                setPipSize(nextPipSize);
                setAnalysisDigits(previous => [...previous, digit].slice(-analysisTickCount));
            }
        };

        socket.onerror = () => {
            window.clearTimeout(timeout);
            if (!isCancelled) {
                setIsLoadingAnalysis(false);
                setFeedback('Unable to open the MatchTool tick stream.');
            }
        };

        return () => {
            isCancelled = true;
            window.clearTimeout(timeout);
            if (socket.readyState === WebSocket.OPEN && tickSubscriptionIdRef.current) {
                send({ forget: tickSubscriptionIdRef.current });
            }
            socket.close();
        };
    }, [analysisTickCount, selectedMarket]);

    useEffect(() => {
        emitProfitdockTradeStatus({
            canStart: Boolean(markets.length),
            canStop: isRunning,
            feature: MATCHTOOL_FEATURE,
            label: isRunning ? localize('MatchTool running') : localize('MatchTool ready'),
            running: isRunning,
        });
    }, [isRunning]);

    useEffect(
        () =>
            subscribeProfitdockTradeStop(request => {
                if (request.feature && request.feature !== MATCHTOOL_FEATURE) return;
                stopRequestedRef.current = true;
                setFeedback(localize('MatchTool will stop after the current one-shot round settles.'));
            }),
        []
    );

    const updateRoundRow = (digit: number, updates: Partial<RoundRow>) => {
        setRoundRows(previous => previous.map(row => (row.digit === digit ? { ...row, ...updates } : row)));
    };

    const handleRun = async () => {
        if (runningRef.current) return;
        const stakeAmount = toPositiveNumber(stake, 0);
        const predictions = toPredictionCount(predictionCount);

        if (!selectedMarketInfo) {
            setFeedback('Select a Digit Match market first.');
            return;
        }
        if (stakeAmount <= 0) {
            setFeedback('Enter a stake before running MatchTool.');
            return;
        }
        if (predictions < 1 || predictions > 9) {
            setFeedback('Predictions must be between 1 and 9.');
            return;
        }

        stopRequestedRef.current = false;
        runningRef.current = true;
        setIsRunning(true);
        setFeedback(null);

        try {
            const picks = pickTopDigits(analysisDigits, predictions);
            console.log('[MATCHTOOL]', 'picks=', picks);
            setRoundRows(picks.map(pick => ({ ...pick, result: 'pending' })));

            if (stopRequestedRef.current) {
                throw new Error('MatchTool stopped before trades were placed.');
            }

            const api = await ensureTradingApi();
            const placed = await Promise.all(
                picks.map(pick =>
                    requestProposalThenBuy({
                        api,
                        currency,
                        digit: pick.digit,
                        stake: stakeAmount,
                        symbol: selectedMarketInfo.symbol,
                    }).then(buy => ({ buy, pick }))
                )
            );

            placed.forEach(({ buy, pick }) => {
                updateRoundRow(pick.digit, { contractId: Number(buy.contract_id), result: 'placed' });
            });

            await Promise.all(
                placed.map(async ({ buy, pick }) => {
                    const contractId = Number(buy.contract_id);
                    try {
                        const profit = await waitForSettlement(api, contractId, contract => {
                            transactions.pushTransaction({
                                ...contract,
                                accountID: getActiveTransactionAccountId(),
                                source: 'matchtool',
                            } as ProposalOpenContract & { accountID?: string; source?: string });
                        });
                        const result = profit > 0 ? 'won' : 'lost';
                        console.log('[MATCHTOOL RESULT]', 'digit=', pick.digit, 'profit=', profit);
                        updateRoundRow(pick.digit, { profit, result });
                        return { pick, profit };
                    } catch (error) {
                        updateRoundRow(pick.digit, { result: 'error' });
                        throw error;
                    }
                })
            );
            setFeedback('MatchTool round settled.');
        } catch (error) {
            console.error('[MATCHTOOL ERROR]', error);
            setFeedback(error instanceof Error ? error.message : 'Unable to run MatchTool.');
            setRoundRows(previous => previous.map(row => (row.result === 'pending' || row.result === 'placed' ? { ...row, result: 'error' } : row)));
        } finally {
            stopRequestedRef.current = false;
            runningRef.current = false;
            setIsRunning(false);
        }
    };

    useEffect(
        () =>
            subscribeProfitdockTradeStart(request => {
                if (request.feature !== MATCHTOOL_FEATURE || isRunning) return;
                void handleRun();
            }),
        [isRunning, handleRun]
    );

    const maxCount = Math.max(...model.counts, 1);
    const minCount = Math.min(...model.counts);
    const getBarColor = (count: number) => {
        if (maxCount === minCount) return '#cbd5e1';
        const hue = ((count - minCount) / (maxCount - minCount)) * 120;
        return `hsl(${hue}, 80%, 45%)`;
    };

    return (
        <div className='matchtool-page'>
            <div className='matchtool-page__shell'>
                <section className='matchtool-page__controls'>
                    <label className='matchtool-page__field matchtool-page__field--market' htmlFor='matchtool-market'>
                        <div className='matchtool-page__select-wrap'>
                            <MarketIcon type={selectedMarketInfo?.symbol || selectedMarket || 'unknown'} size='sm' />
                            <select
                                disabled={isLoadingMarkets || !markets.length || isRunning}
                                id='matchtool-market'
                                onChange={event => setSelectedMarket(event.target.value)}
                                value={selectedMarket}
                            >
                                {markets.map(market => (
                                    <option key={market.symbol} value={market.symbol}>
                                        {market.display_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </label>

                    <label className='matchtool-page__field' htmlFor='matchtool-analysis-ticks'>
                        <span>Number of ticks</span>
                        <input
                            disabled={isRunning}
                            id='matchtool-analysis-ticks'
                            inputMode='numeric'
                            max='1000'
                            min='0'
                            onChange={event => {
                                const next = event.target.value;
                                if (next === '' || Number(next) <= 1000) setAnalysisTicks(next);
                            }}
                            placeholder='0-1000'
                            type='number'
                            value={analysisTicks}
                        />
                    </label>

                    <label className='matchtool-page__field' htmlFor='matchtool-stake'>
                        <span>Stake</span>
                        <input
                            disabled={isRunning}
                            id='matchtool-stake'
                            inputMode='decimal'
                            onChange={event => setStake(event.target.value)}
                            placeholder='Enter stake'
                            type='number'
                            value={stake}
                        />
                    </label>

                    <label className='matchtool-page__field' htmlFor='matchtool-predictions'>
                        <span>Predictions</span>
                        <input
                            disabled={isRunning}
                            id='matchtool-predictions'
                            inputMode='numeric'
                            max='9'
                            min='1'
                            onChange={event => {
                                const next = event.target.value;
                                if (next === '' || Number(next) <= 9) setPredictionCount(next);
                            }}
                            placeholder='1-9'
                            type='number'
                            value={predictionCount}
                        />
                    </label>

                    <div className='matchtool-page__run-container'>
                        <button className='matchtool-page__run' disabled={isRunning || !markets.length} onClick={handleRun} type='button'>
                            <span className='matchtool-page__play' />
                            {isRunning ? 'Running' : 'Run'}
                        </button>
                        <div className='matchtool-page__top-digits'>
                            {Array.from({ length: 10 }, (_, digit) => (
                                <div
                                    key={digit}
                                    className={`matchtool-page__digit-circle ${topNDigitsSet.has(digit) ? 'matchtool-page__digit-circle--active' : ''}`}
                                >
                                    {digit}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {feedback && <div className='matchtool-page__notice'>{feedback}</div>}

                <section className='matchtool-page__analysis'>
                    <div className='matchtool-page__chart' aria-busy={isLoadingAnalysis}>
                        {model.counts.map((count, digit) => {
                            const height = Math.max(6, (count / maxCount) * 100);
                            return (
                                <div className='matchtool-page__bar-cell' key={digit}>
                                    <span>{formatPercent(model.frequencies[digit] || 0)}</span>
                                    <div className='matchtool-page__bar-track'>
                                        <div className='matchtool-page__bar' style={{ height: `${height}%`, backgroundColor: getBarColor(count) }} />
                                    </div>
                                    <b>{digit}</b>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className='matchtool-page__round'>
                    <div className='matchtool-page__table' role='table'>
                        <div className='matchtool-page__table-row matchtool-page__table-row--head' role='row'>
                            <span>Digit</span>
                            <span>Frequency</span>
                            <span>Result</span>
                            <span>P&L</span>
                        </div>
                        {roundRows.length ? (
                            roundRows.map(row => (
                                <div className='matchtool-page__table-row' key={`${row.digit}`} role='row'>
                                    <strong>{row.digit}</strong>
                                    <span>
                                        {row.count} / {formatPercent(row.frequency)}
                                    </span>
                                    <ResultBadge result={row.result} />
                                    <span className={row.profit === undefined ? '' : row.profit >= 0 ? 'matchtool-page__profit' : 'matchtool-page__loss'}>
                                        {row.profit === undefined ? '-' : formatMoney(row.profit, currency)}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className='matchtool-page__empty'></div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
});

export default MatchtoolPage;
