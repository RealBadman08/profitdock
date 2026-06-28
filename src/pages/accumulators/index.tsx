import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { api_base } from '@/external/bot-skeleton';
import { getProfitdockPublicSocketUrl } from '@/external/bot-skeleton/services/api/appId';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import {
    getStoredProfitdockActiveCurrency,
    hasUsableProfitdockStoredSession,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import {
    formatQuote,
    getPipSizeForSymbol,
    getMarketsWithoutStepBoomCrashRange,
    normalizeApiMessage,
} from '@/features/deriv-live/api';
import { MarketSymbol } from '@/features/deriv-live/types';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { MarketIcon } from '@/components/market/market-icon';
import { emitProfitdockTradeStatus, subscribeProfitdockTradeStop } from '@/utils/profitdock-trade-controller';
import { ProposalOpenContract } from '@deriv/api-types';
import { localize } from '@deriv-com/translations';
import './accumulators.scss';

type ApiLike = {
    connection?: {
        readyState?: number;
    };
    onMessage: () => { subscribe: (callback: (message: unknown) => void) => { unsubscribe: () => void } };
    send: (payload: Record<string, unknown>) => Promise<Record<string, any>>;
};

type AccumulatorProposalResponse = {
    msg_type?: string;
    error?: {
        code?: string;
        message?: string;
    };
    echo_req?: {
        passthrough?: {
            streamKey?: string;
        };
    };
    proposal?: {
        ask_price?: number;
        display_value?: string;
        id?: string;
        longcode?: string;
        payout?: number;
        spot?: number;
        validation_params?: {
            max_payout?: number | string;
            max_ticks?: number;
            stake?: {
                max?: number | string;
                min?: number | string;
            };
            take_profit?: {
                max?: number | string;
                min?: number | string;
            };
        };
        contract_details?: {
            barrier_spot_distance?: number | string;
            high_barrier?: number | string;
            last_tick_epoch?: number | string;
            low_barrier?: number | string;
            maximum_payout?: number;
            maximum_stake?: string;
            maximum_ticks?: number;
            minimum_stake?: string;
            tick_size_barrier?: number;
            tick_size_barrier_percentage?: string;
            ticks_stayed_in?: number[];
        };
    };
    subscription?: {
        id?: string;
    };
};

type AccumulatorOpenContract = ProposalOpenContract;

type AccumulatorOpenContractResponse = {
    msg_type?: string;
    error?: {
        message?: string;
    };
    proposal_open_contract?: AccumulatorOpenContract;
    subscription?: {
        id?: string;
    };
};

type AccumulatorMarketSnapshot = {
    currentStat: number;
    displayName: string;
    lastTickEpoch: number | null;
    longcode?: string;
    priceDisplay: string;
    recentStats: number[];
    symbol: string;
};

type ManualCardConfig = {
    stake: string;
    takeProfit: string;
};

type ManualTradeState = {
    bidPrice?: string;
    buyPrice: number;
    contractId?: number;
    feedback: string;
    isValidToSell?: boolean;
    profit: number;
    status: 'idle' | 'opening' | 'live' | 'selling' | 'closed' | 'error';
    tickPassed: number;
};

type AutoEngineStatus = 'idle' | 'arming' | 'buying' | 'live' | 'stopping' | 'stopped_limit' | 'error';
type AutoMarketMode = 'single' | 'scan';

type AutoEngineState = {
    activeContractId?: number;
    activeProfit: number;
    closedTrades: number;
    entryStreak: number;
    feedback: string;
    lastResult: string;
    nextStake: number;
    running: boolean;
    sessionPnl: number;
    status: AutoEngineStatus;
    tickPassed: number;
};

type AccumulatorQuote = {
    askPrice: number;
    longcode?: string;
    proposalId: string;
};

type StreamState = {
    currentStat: number | null;
    error: string | null;
    isLoading: boolean;
    lastTickEpoch: number | null;
    priceDisplay: string;
    recentStats: number[];
    snapshotAt: number;
    symbol: string;
};

type TickHistoryResponse = {
    error?: {
        message?: string;
    };
    history?: {
        prices?: number[];
        times?: number[];
    };
};

type TickStreamResponse = {
    msg_type?: string;
    error?: {
        message?: string;
    };
    subscription?: {
        id?: string;
    };
    tick?: {
        epoch: number;
        quote: number;
        symbol: string;
    };
};

type ManualChartTick = {
    epoch: number;
    quote: number;
};

type ManualLiveProposalState = {
    askPrice: number | null;
    barrierDistance: number | null;
    barrierPercent: string;
    currentStat: number | null;
    error: string | null;
    highBarrier: number | null;
    isLoading: boolean;
    lastTickEpoch: number | null;
    lowBarrier: number | null;
    longcode?: string;
    maxPayout: number | null;
    maxTicks: number | null;
    payout: number | null;
    proposalId: string | null;
    recentStats: number[];
    snapshotAt: number;
    spot: number | null;
    symbol: string;
};

type DedicatedAccumulatorFeedState = {
    askPrice: number | null;
    barrierDistance: number | null;
    barrierPercent: string;
    currentStat: number | null;
    error: string | null;
    highBarrier: number | null;
    isLoading: boolean;
    lastTickEpoch: number | null;
    lowBarrier: number | null;
    longcode?: string;
    maxPayout: number | null;
    maxTicks: number | null;
    payout: number | null;
    priceDisplay: string;
    recentStats: number[];
    snapshotAt: number;
    spot: number | null;
    symbol: string;
};

const GROWTH_RATE_OPTIONS = [1, 2, 3, 4, 5] as const;
const AUTO_EXIT_TICK = 10;
const ACCUMULATOR_SUPPORTED_SYMBOLS = new Set([
    'R_100',
    '1HZ100V',
    '1HZ10V',
    'R_10',
    'R_50',
    '1HZ25V',
    '1HZ75V',
    'R_75',
    '1HZ50V',
    'R_25',
]);
const ACCUMULATOR_SCAN_SYMBOL_ORDER = [
    '1HZ10V',
    'R_10',
    '1HZ25V',
    'R_25',
    '1HZ50V',
    'R_50',
    '1HZ75V',
    'R_75',
    '1HZ100V',
    'R_100',
];

const getAccumulatorSupportedMarkets = (markets: MarketSymbol[]) =>
    markets.filter(market => ACCUMULATOR_SUPPORTED_SYMBOLS.has(market.symbol));
const MANUAL_CHART_BUFFER = 140;
const MANUAL_CHART_VIEW = 80;
const AUTO_PROPOSAL_STALE_MS = 1400;
const MANUAL_PROPOSAL_BUY_MAX_AGE_MS = 900;
const SELL_RETRY_ATTEMPTS = 6;
const SELL_RETRY_DELAY_MS = 220;
const MANUAL_DEFAULTS: ManualCardConfig = {
    stake: '2',
    takeProfit: '0.5',
};
const AUTO_DEFAULTS = {
    martingaleMultiplier: '2',
    sessionStopLoss: '0',
    stake: '1',
    streakLength: '3',
    thresholdBelow: '10',
};
const EMPTY_AUTO_STREAM: StreamState = {
    currentStat: null,
    error: null,
    isLoading: true,
    lastTickEpoch: null,
    priceDisplay: '--',
    recentStats: [],
    snapshotAt: 0,
    symbol: '',
};
const EMPTY_MANUAL_PROPOSAL: ManualLiveProposalState = {
    askPrice: null,
    barrierDistance: null,
    barrierPercent: '--',
    currentStat: null,
    error: null,
    highBarrier: null,
    isLoading: true,
    lastTickEpoch: null,
    lowBarrier: null,
    longcode: undefined,
    maxPayout: null,
    maxTicks: null,
    payout: null,
    proposalId: null,
    recentStats: [],
    snapshotAt: 0,
    spot: null,
    symbol: '',
};
const EMPTY_DEDICATED_FEED: DedicatedAccumulatorFeedState = {
    askPrice: null,
    barrierDistance: null,
    barrierPercent: '--',
    currentStat: null,
    error: null,
    highBarrier: null,
    isLoading: true,
    lastTickEpoch: null,
    lowBarrier: null,
    longcode: undefined,
    maxPayout: null,
    maxTicks: null,
    payout: null,
    priceDisplay: '--',
    recentStats: [],
    snapshotAt: 0,
    spot: null,
    symbol: '',
};

const toPositiveNumber = (value: string | number | null | undefined, fallback = 0) => {
    const nextValue = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(nextValue) || nextValue <= 0) {
        return fallback;
    }

    return nextValue;
};

const toPositiveInteger = (value: string | number | null | undefined, fallback = 0) => {
    const next_value = toPositiveNumber(value, fallback);
    const rounded = Math.trunc(next_value);

    if (!Number.isFinite(rounded) || rounded <= 0) {
        return fallback;
    }

    return rounded;
};

const roundMoney = (value: number) => Number(value.toFixed(2));

const formatMoney = (value: number, currency: string) => `${value.toFixed(2)} ${currency}`;

const toFiniteNumber = (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatSignedDistance = (value: number | null, pipSize: number) => {
    if (value === null) {
        return '--';
    }

    const absolute = Math.abs(value).toFixed(pipSize);
    return `${value >= 0 ? '+' : '-'}${absolute}`;
};

const getDerivApi = () => api_base.api as ApiLike | undefined;
const getActiveTransactionAccountId = () => api_base.account_id || localStorage.getItem('active_loginid') || undefined;
const isDerivSocketOpen = () => Number(getDerivApi()?.connection?.readyState) === WebSocket.OPEN;
const isSelectedProfitdockAccountSocket = () => {
    if (!isCustomLegacyOAuthDomain()) {
        return true;
    }

    const activeLoginId = localStorage.getItem('active_loginid') || '';
    return !activeLoginId || !api_base.account_id || api_base.account_id === activeLoginId;
};
const getDerivErrorMessage = (
    error: { code?: string; message?: string } | undefined,
    fallbackMessage: string
) => {
    if (!error) {
        return fallbackMessage;
    }

    return [error.code, error.message || fallbackMessage].filter(Boolean).join(': ');
};

const isAccumulatorContractSold = (contract: Partial<AccumulatorOpenContract>) =>
    contract.is_sold === 1 || contract.is_sold === true || (contract as { status?: string }).status === 'sold';

const isAccumulatorContractSellable = (contract: Partial<AccumulatorOpenContract>) =>
    contract.is_valid_to_sell === 1 || contract.is_valid_to_sell === true;

const getAccumulatorBidPrice = (contract: Partial<AccumulatorOpenContract>) => {
    const bidPrice = (contract as { bid_price?: number | string }).bid_price;

    if (bidPrice === undefined || bidPrice === null || bidPrice === '') {
        return undefined;
    }

    return String(bidPrice);
};

const hasAccumulatorTradeSession = () =>
    Boolean(
        isDerivSocketOpen() &&
            isSelectedProfitdockAccountSocket() &&
            (isCustomLegacyOAuthDomain() ? api_base.has_authenticated_profitdock_socket : api_base.is_authorized)
    );

const buildAccumulatorRequest = (params: {
    amount: number;
    currency: string;
    growthRate: number;
    streamKey?: string;
    subscribe?: boolean;
    symbol: string;
    takeProfit?: number;
}) => {
    const payload: Record<string, unknown> = {
        amount: params.amount,
        basis: 'stake',
        contract_type: 'ACCU',
        currency: params.currency,
        growth_rate: params.growthRate,
        proposal: 1,
        underlying_symbol: params.symbol,
    };

    if (params.subscribe) {
        payload.subscribe = 1;
    }

    if (params.streamKey) {
        payload.passthrough = { streamKey: params.streamKey };
    }

    if (params.takeProfit && params.takeProfit > 0) {
        payload.limit_order = {
            take_profit: params.takeProfit,
        };
    }

    return payload;
};

const forgetSubscription = async (api: ApiLike | undefined, subscriptionId?: string | null) => {
    if (!api || !subscriptionId) {
        return;
    }

    try {
        await api.send({ forget: subscriptionId });
    } catch {
        // Ignore cleanup failures during reconnects.
    }
};

const normalizeAccumulatorStats = (value: unknown, limit = 10): number[] => {
    const bucket: number[] = [];

    const walk = (nextValue: unknown) => {
        if (Array.isArray(nextValue)) {
            nextValue.forEach(walk);
            return;
        }

        const parsed = toFiniteNumber(
            typeof nextValue === 'number' || typeof nextValue === 'string' ? nextValue : null
        );

        if (parsed !== null) {
            bucket.push(Math.trunc(parsed));
        }
    };

    walk(value);
    return bucket.reverse().slice(0, limit);
};

const sortAccumulatorMarkets = (markets: AccumulatorMarketSnapshot[]) =>
    [...markets].sort((left, right) => {
        if (right.currentStat !== left.currentStat) {
            return right.currentStat - left.currentStat;
        }

        return (right.recentStats[1] || 0) - (left.recentStats[1] || 0);
    });

const mergeRecentAccumulatorStats = (incoming: number[], existing: number[], limit = 10) => {
    if (!incoming.length) {
        return existing.slice(0, limit);
    }

    // Full snapshots already arrive newest/current first after normalization.
    if (incoming.length > 1) {
        return incoming.slice(0, limit);
    }

    if (!existing.length) {
        return incoming.slice(0, limit);
    }

    const [nextCurrent] = incoming;
    const [previousCurrent, ...previousCompletedStats] = existing;

    if (previousCurrent === nextCurrent) {
        return existing.slice(0, limit);
    }

    if (typeof previousCurrent === 'number' && nextCurrent > previousCurrent) {
        return [nextCurrent, ...previousCompletedStats].slice(0, limit);
    }

    // When the current stat drops, the previous run is complete. Move it into
    // history so older stats shift right and the rightmost stat disappears.
    return [nextCurrent, previousCurrent, ...previousCompletedStats].slice(0, limit);
};

const getAccumulatorStatsWindow = (
    source: Pick<AccumulatorMarketSnapshot | StreamState | DedicatedAccumulatorFeedState, 'currentStat' | 'recentStats'>,
    limit = 6
) => {
    const stats = source.recentStats.length ? source.recentStats : source.currentStat !== null ? [source.currentStat] : [];
    return stats.filter(stat => Number.isFinite(stat)).slice(0, limit);
};

const getCompletedAccumulatorStatsWindow = (
    source: Pick<AccumulatorMarketSnapshot | StreamState | DedicatedAccumulatorFeedState, 'currentStat' | 'recentStats'>,
    limit = 6
) => getAccumulatorStatsWindow(source, limit + 1).slice(1, limit + 1);

const getAccumulatorConditionStreak = (stats: number[], threshold: number) => {
    let streak = 0;

    for (const stat of stats) {
        if (stat <= threshold) {
            streak += 1;
            continue;
        }

        break;
    }

    return streak;
};

class AccumulatorStatEngineView {
    private readonly completedStats: number[];
    private readonly currentRunLength: number | null;
    private readonly displayStats: number[];

    constructor(
        source: Pick<AccumulatorMarketSnapshot | StreamState | DedicatedAccumulatorFeedState, 'currentStat' | 'recentStats'>,
        completedHistory: number[] = [],
        historyLimit = 20
    ) {
        const sourceStats = getAccumulatorStatsWindow(source, historyLimit + 1);
        this.currentRunLength = typeof source.currentStat === 'number' ? source.currentStat : sourceStats[0] ?? null;
        const sourceStatsIncludeCurrent =
            this.currentRunLength !== null && sourceStats.length > 0 && sourceStats[0] === this.currentRunLength;
        const completedFromSource = sourceStats.slice(sourceStatsIncludeCurrent ? 1 : 0).slice(0, historyLimit);

        this.completedStats = completedFromSource.length
            ? completedFromSource
            : mergeRecentAccumulatorStats(
                  getCompletedAccumulatorStatsWindow(source, historyLimit),
                  completedHistory,
                  historyLimit
              );
        this.displayStats = [
            ...(this.currentRunLength !== null ? [this.currentRunLength] : []),
            ...this.completedStats,
        ].slice(0, historyLimit);
    }

    getCurrentRunLength() {
        return this.currentRunLength;
    }

    getDisplayStats(limit: number) {
        return this.displayStats.slice(0, limit);
    }

    getLastNStats(limit: number) {
        return this.completedStats.slice(0, limit);
    }

    getStreakStatus(requiredCount: number, ticksBelow: number) {
        const progress = getAccumulatorConditionStreak(this.completedStats, ticksBelow);

        return {
            progress,
            satisfied: this.completedStats.length >= requiredCount && progress >= requiredCount,
        };
    }

    getDisplayStreakStatus(requiredCount: number, ticksBelow: number) {
        const displayStats = this.getDisplayStats(requiredCount);
        const progress = getAccumulatorConditionStreak(displayStats, ticksBelow);

        return {
            progress,
            satisfied: displayStats.length >= requiredCount && progress >= requiredCount,
        };
    }
}

const createAccumulatorStatEngineView = (
    source: Pick<AccumulatorMarketSnapshot | StreamState | DedicatedAccumulatorFeedState, 'currentStat' | 'recentStats'>,
    completedHistory: number[] = [],
    historyLimit = 20
) => new AccumulatorStatEngineView(source, completedHistory, historyLimit);

const buildAccumulatorSnapshot = (market: MarketSymbol, response: AccumulatorProposalResponse): AccumulatorMarketSnapshot | null => {
    const stats = normalizeAccumulatorStats(response.proposal?.contract_details?.ticks_stayed_in, 10);

    if (!stats.length) {
        return null;
    }

    const pipSize = getPipSizeForSymbol(api_base.pip_sizes as Record<string, number>, market.symbol);
    const spot = typeof response.proposal?.spot === 'number' ? response.proposal.spot : null;

    return {
        currentStat: stats[0],
        displayName: market.display_name,
        lastTickEpoch: toFiniteNumber(response.proposal?.contract_details?.last_tick_epoch),
        longcode: response.proposal?.longcode,
        priceDisplay: formatQuote(spot, pipSize),
        recentStats: stats.slice(0, 10),
        symbol: market.symbol,
    };
};

const requestAccumulatorQuote = async (api: ApiLike, params: {
    amount: number;
    currency: string;
    growthRatePercent: number;
    symbol: string;
    takeProfit?: number;
}) => {
    const response = normalizeApiMessage<AccumulatorProposalResponse>(
        await api.send(
            buildAccumulatorRequest({
                amount: params.amount,
                currency: params.currency,
                growthRate: params.growthRatePercent / 100,
                symbol: params.symbol,
                takeProfit: params.takeProfit,
            })
        )
    );

    if (response?.error) {
        throw new Error(getDerivErrorMessage(response.error, 'Unable to fetch an accumulator quote.'));
    }

    if (!response?.proposal?.id || typeof response.proposal.ask_price !== 'number') {
        throw new Error('Accumulator quote is incomplete.');
    }

    return {
        askPrice: response.proposal.ask_price,
        longcode: response.proposal.longcode,
        proposalId: response.proposal.id,
    } as AccumulatorQuote;
};

const buyAccumulatorQuote = async (
    api: ApiLike,
    quote: AccumulatorQuote,
    fallbackMessage = 'Unable to place the accumulator trade.'
) => {
    const response = normalizeApiMessage<{ buy?: { contract_id?: number; longcode?: string }; error?: { code?: string; message?: string } }>(
        await api.send({
            buy: quote.proposalId,
            price: String(quote.askPrice),
        })
    );

    if (response?.error) {
        const error = new Error(getDerivErrorMessage(response.error, fallbackMessage)) as Error & { code?: string };
        error.code = response.error.code;
        throw error;
    }

    return response;
};

const shouldRetryAccumulatorBuy = (error: unknown) => {
    const code = String((error as { code?: string })?.code || '').toLowerCase();
    const message = String((error as Error)?.message || '').toLowerCase();

    return (
        ['contractbuyvalidationerror', 'invalidcontractproposal', 'pricemoved', 'proposalexpired'].includes(code) ||
        message.includes('price') ||
        message.includes('proposal')
    );
};

const isRecoverableAccumulatorAuthError = (error: unknown) => {
    const code = String((error as { code?: string })?.code || '').toLowerCase();
    const message = String((error as Error)?.message || '').toLowerCase();

    return (
        ['authorizationrequired', 'unauthorized', 'unauthorizedaccess', 'invalidtoken', 'accessdenied'].includes(code) ||
        message.includes('please log in') ||
        message.includes('not logged in') ||
        message.includes('authorize') ||
        message.includes('authorization') ||
        message.includes('invalid token') ||
        message.includes('session')
    );
};

const subscribeToOpenContract = async (api: ApiLike, params: {
    contractId: number;
    onError: (message: string) => void;
    onUpdate: (contract: AccumulatorOpenContract) => void;
}) => {
    let subscriptionId: string | null = null;
    const messageSubscription = api.onMessage().subscribe((message: unknown) => {
        const data = normalizeApiMessage<AccumulatorOpenContractResponse>(message);
        const contract = data?.proposal_open_contract;

        if (!data || data.msg_type !== 'proposal_open_contract' || contract?.contract_id !== params.contractId) {
            return;
        }

        subscriptionId = data.subscription?.id ?? subscriptionId;
        params.onUpdate(contract);
    });

    try {
        const initialResponse = normalizeApiMessage<AccumulatorOpenContractResponse>(
            await api.send({
                contract_id: params.contractId,
                proposal_open_contract: 1,
                subscribe: 1,
            })
        );

        if (initialResponse?.error) {
            throw new Error(initialResponse.error.message || 'Unable to monitor the accumulator trade.');
        }

        subscriptionId = initialResponse?.subscription?.id ?? subscriptionId;

        if (initialResponse?.proposal_open_contract?.contract_id === params.contractId) {
            params.onUpdate(initialResponse.proposal_open_contract);
        }
    } catch (error) {
        messageSubscription.unsubscribe();
        params.onError(error instanceof Error ? error.message : 'Unable to monitor the accumulator trade.');
        return () => {};
    }

    return () => {
        messageSubscription.unsubscribe();
        forgetSubscription(api, subscriptionId);
    };
};

const sellContractAtMarket = async (api: ApiLike, contractId: number, bidPrice?: string | number) => {
    const response = await api.send({
        price: bidPrice !== undefined && bidPrice !== null && bidPrice !== '' ? String(bidPrice) : 0,
        sell: contractId,
    });

    const data = normalizeApiMessage<{ error?: { message?: string } }>(response);

    if (data?.error) {
        throw new Error(getDerivErrorMessage(data.error, 'Unable to close the accumulator contract.'));
    }

    return response;
};

const waitForDelay = (delayMs: number) => new Promise(resolve => window.setTimeout(resolve, delayMs));

const sellContractAtMarketWithRetry = async (api: ApiLike, contractId: number, bidPrice?: string | number) => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < SELL_RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await sellContractAtMarket(api, contractId, bidPrice);
        } catch (error) {
            lastError = error;

            if (attempt < SELL_RETRY_ATTEMPTS - 1) {
                await waitForDelay(SELL_RETRY_DELAY_MS);
            }
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Unable to close the accumulator contract.');
};

const useAccumulatorRankings = (growthRatePercent: number, currency: string, connectionStatus: string) => {
    const [candidateMarkets, setCandidateMarkets] = useState<MarketSymbol[]>(() =>
        getAccumulatorSupportedMarkets(getMarketsWithoutStepBoomCrashRange([]))
    );
    const [rankedMarkets, setRankedMarkets] = useState<AccumulatorMarketSnapshot[]>([]);

    useEffect(() => {
        let isCancelled = false;

        const loadMarkets = async () => {
            if (!getDerivApi() || connectionStatus !== CONNECTION_STATUS.OPENED) {
                setCandidateMarkets(previous =>
                    previous.length ? previous : getAccumulatorSupportedMarkets(getMarketsWithoutStepBoomCrashRange([]))
                );
                return;
            }

            if (!api_base.active_symbols.length) {
                try {
                    if (api_base.active_symbols_promise) {
                        await api_base.active_symbols_promise;
                    } else {
                        await (api_base as unknown as { getActiveSymbols?: () => Promise<unknown> }).getActiveSymbols?.();
                    }
                } catch {
                    // Keep the canonical Deriv synthetic list visible while websocket catalog retries.
                }
            }

            if (!isCancelled) {
                setCandidateMarkets(
                    getAccumulatorSupportedMarkets(getMarketsWithoutStepBoomCrashRange(api_base.active_symbols as MarketSymbol[]))
                );
            }
        };

        loadMarkets();

        return () => {
            isCancelled = true;
        };
    }, [connectionStatus]);

    useEffect(() => {
        if (!candidateMarkets.length) {
            setRankedMarkets([]);
            return;
        }

        let isCancelled = false;
        let socket: WebSocket | null = null;
        let reconnectTimeoutId: number | null = null;
        const sendTimers: number[] = [];
        const socketUrl = getProfitdockPublicSocketUrl();

        const connect = () => {
            if (isCancelled) {
                return;
            }

            const streamMarketByKey = new Map(
                candidateMarkets.map(market => [`accu-rank:${market.symbol}:${growthRatePercent}`, market] as const)
            );

            socket = new WebSocket(socketUrl);

            socket.onopen = () => {
                if (isCancelled || !socket) {
                    return;
                }

                setRankedMarkets(previous =>
                    sortAccumulatorMarkets(
                        previous.filter(snapshot => candidateMarkets.some(market => market.symbol === snapshot.symbol))
                    )
                );

                candidateMarkets.forEach((market, index) => {
                    const timerId = window.setTimeout(() => {
                        if (isCancelled || !socket || socket.readyState !== WebSocket.OPEN) {
                            return;
                        }

                        socket.send(
                            JSON.stringify(
                                buildAccumulatorRequest({
                                    amount: 1,
                                    currency,
                                    growthRate: growthRatePercent / 100,
                                    streamKey: `accu-rank:${market.symbol}:${growthRatePercent}`,
                                    subscribe: true,
                                    symbol: market.symbol,
                                })
                            )
                        );
                    }, index * 45);

                    sendTimers.push(timerId);
                });
            };

            socket.onmessage = event => {
                if (isCancelled) {
                    return;
                }

                let data: AccumulatorProposalResponse | null = null;

                try {
                    data = normalizeApiMessage<AccumulatorProposalResponse>(JSON.parse(event.data));
                } catch {
                    data = null;
                }

                if (!data || data.msg_type !== 'proposal' || data.error) {
                    return;
                }

                const streamKey = data.echo_req?.passthrough?.streamKey;
                const market = streamKey ? streamMarketByKey.get(streamKey) : undefined;

                if (!market) {
                    return;
                }

                const snapshot = buildAccumulatorSnapshot(market, data);

                if (!snapshot) {
                    return;
                }

                setRankedMarkets(previous => {
                    const previousSnapshot = previous.find(item => item.symbol === snapshot.symbol);
                    const nextSnapshot = {
                        ...snapshot,
                        recentStats: mergeRecentAccumulatorStats(
                            snapshot.recentStats,
                            previousSnapshot?.recentStats || [],
                            10
                        ),
                    };
                    const next = previous.filter(item => item.symbol !== snapshot.symbol);
                    next.push(nextSnapshot);
                    return sortAccumulatorMarkets(next);
                });
            };

            socket.onclose = () => {
                if (isCancelled) {
                    return;
                }

                reconnectTimeoutId = window.setTimeout(connect, 1000);
            };
        };

        connect();

        return () => {
            isCancelled = true;

            sendTimers.forEach(timerId => window.clearTimeout(timerId));

            if (reconnectTimeoutId) {
                window.clearTimeout(reconnectTimeoutId);
            }

            socket?.close();
        };
    }, [candidateMarkets, currency, growthRatePercent]);

    return {
        error: null,
        isLoading: rankedMarkets.length === 0 && candidateMarkets.length > 0,
        rankedMarkets,
        supportedMarkets: candidateMarkets,
    };
};
const useDedicatedAccumulatorFeed = ({
    amount,
    currency,
    enabled,
    growthRatePercent,
    symbol,
    takeProfit,
}: {
    amount: number;
    currency: string;
    enabled: boolean;
    growthRatePercent: number;
    symbol: string;
    takeProfit?: number;
}) => {
    const [feed, setFeed] = useState<DedicatedAccumulatorFeedState>(EMPTY_DEDICATED_FEED);
    const pipSize = useMemo(
        () => getPipSizeForSymbol(api_base.pip_sizes as Record<string, number>, symbol || 'R_100'),
        [symbol]
    );

    useEffect(() => {
        if (!enabled || !symbol) {
            setFeed(EMPTY_DEDICATED_FEED);
            return;
        }

        let isCancelled = false;
        let socket: WebSocket | null = null;
        let reconnectTimeoutId: number | null = null;
        const socketUrl = getProfitdockPublicSocketUrl();
        const streamKey = `accu-dedicated:${symbol}:${growthRatePercent}`;

        const connect = () => {
            if (isCancelled) {
                return;
            }

            socket = new WebSocket(socketUrl);

            socket.onopen = () => {
                if (isCancelled || !socket) {
                    return;
                }

                setFeed(previous => ({
                    ...previous,
                    error: previous.snapshotAt ? null : previous.error,
                    isLoading: previous.snapshotAt ? false : true,
                }));

                socket.send(
                    JSON.stringify(
                        buildAccumulatorRequest({
                            amount,
                            currency,
                            growthRate: growthRatePercent / 100,
                            streamKey,
                            subscribe: true,
                            symbol,
                            takeProfit,
                        })
                    )
                );
            };

            socket.onmessage = event => {
                if (isCancelled) {
                    return;
                }

                let data: AccumulatorProposalResponse | null = null;

                try {
                    data = normalizeApiMessage<AccumulatorProposalResponse>(JSON.parse(event.data));
                } catch {
                    data = null;
                }

                if (!data || data.msg_type !== 'proposal' || data.echo_req?.passthrough?.streamKey !== streamKey) {
                    return;
                }

                if (data.error) {
                    setFeed(previous => ({
                        ...previous,
                        error: previous.snapshotAt ? null : data?.error?.message || 'Unable to stream accumulator stats.',
                        isLoading: false,
                    }));
                    return;
                }

                const details = data.proposal?.contract_details;
                const validation = data.proposal?.validation_params;
                const stats = normalizeAccumulatorStats(details?.ticks_stayed_in, 10);
                const spot = toFiniteNumber(data.proposal?.spot);
                const snapshotAt = Date.now();
                const lastTickEpoch = toFiniteNumber(details?.last_tick_epoch);
                const maxTicks = toFiniteNumber(details?.maximum_ticks);
                const maxPayout =
                    toFiniteNumber(validation?.max_payout) ??
                    toFiniteNumber(details?.maximum_payout) ??
                    toFiniteNumber(data.proposal?.payout);

                setFeed(previous => ({
                    askPrice: toFiniteNumber(data.proposal?.ask_price) ?? previous.askPrice,
                    barrierDistance: toFiniteNumber(details?.barrier_spot_distance) ?? previous.barrierDistance,
                    barrierPercent: details?.tick_size_barrier_percentage || previous.barrierPercent || '--',
                    currentStat: stats[0] ?? previous.currentStat,
                    error: null,
                    highBarrier: toFiniteNumber(details?.high_barrier) ?? previous.highBarrier,
                    isLoading: false,
                    lastTickEpoch: lastTickEpoch ?? previous.lastTickEpoch,
                    lowBarrier: toFiniteNumber(details?.low_barrier) ?? previous.lowBarrier,
                    longcode: data.proposal?.longcode || previous.longcode,
                    maxPayout,
                    maxTicks: maxTicks ? Math.trunc(maxTicks) : previous.maxTicks,
                    payout: toFiniteNumber(data.proposal?.payout) ?? previous.payout,
                    priceDisplay: spot !== null ? formatQuote(spot, pipSize) : previous.priceDisplay,
                    recentStats: mergeRecentAccumulatorStats(stats, previous.recentStats, 10),
                    snapshotAt,
                    spot: spot ?? previous.spot,
                    symbol,
                }));
            };

            socket.onclose = () => {
                if (isCancelled) {
                    return;
                }

                reconnectTimeoutId = window.setTimeout(connect, 700);
            };

            socket.onerror = () => {
                if (!isCancelled) {
                    setFeed(previous => ({
                        ...previous,
                        error: previous.snapshotAt ? null : 'Accumulator stat feed is reconnecting.',
                        isLoading: previous.snapshotAt ? false : true,
                    }));
                }
            };
        };

        setFeed({
            ...EMPTY_DEDICATED_FEED,
            isLoading: true,
            symbol,
        });
        connect();

        return () => {
            isCancelled = true;

            if (reconnectTimeoutId) {
                window.clearTimeout(reconnectTimeoutId);
            }

            socket?.close();
        };
    }, [amount, currency, enabled, growthRatePercent, pipSize, symbol, takeProfit]);

    return feed;
};

const AccumulatorsPage = observer(() => {
    const store = useStore();
    const { transactions } = store;
    const { authData, connectionStatus } = useApiBase();
    const [activeTab, setActiveTab] = useState<'manual' | 'auto'>('manual');
    const [growthRatePercent, setGrowthRatePercent] = useState<number>(3);
    const [manualMarketSymbol, setManualMarketSymbol] = useState('');
    const [manualConfigs, setManualConfigs] = useState<Record<string, ManualCardConfig>>({});
    const [manualTrades, setManualTrades] = useState<Record<string, ManualTradeState>>({});
    const [manualProposal, setManualProposal] = useState<ManualLiveProposalState>(EMPTY_MANUAL_PROPOSAL);
    const [manualChartTicks, setManualChartTicks] = useState<ManualChartTick[]>([]);
    const [manualTickError, setManualTickError] = useState<string | null>(null);
    const [isManualTickLoading, setIsManualTickLoading] = useState(true);
    const [manualBarrierFlash, setManualBarrierFlash] = useState(false);
    const [autoMarketMode, setAutoMarketMode] = useState<AutoMarketMode>('single');
    const [autoMarketSymbol, setAutoMarketSymbol] = useState('');
    const [autoStake, setAutoStake] = useState(AUTO_DEFAULTS.stake);
    const [autoMartingaleMultiplier, setAutoMartingaleMultiplier] = useState(AUTO_DEFAULTS.martingaleMultiplier);
    const [autoSessionStopLoss, setAutoSessionStopLoss] = useState(AUTO_DEFAULTS.sessionStopLoss);
    const [autoStreakLength, setAutoStreakLength] = useState(AUTO_DEFAULTS.streakLength);
    const [autoThresholdBelow, setAutoThresholdBelow] = useState(AUTO_DEFAULTS.thresholdBelow);
    const [autoInstantRecovery, setAutoInstantRecovery] = useState(false);
    const [autoStream, setAutoStream] = useState<StreamState>(EMPTY_AUTO_STREAM);
    const [autoEngine, setAutoEngine] = useState<AutoEngineState>({
        activeProfit: 0,
        closedTrades: 0,
        entryStreak: 0,
        feedback: '',
        lastResult: '',
        nextStake: Number(AUTO_DEFAULTS.stake),
        running: false,
        sessionPnl: 0,
        status: 'idle',
        tickPassed: 0,
    });
    const [autoScanStatsHistory, setAutoScanStatsHistory] = useState<Record<string, number[]>>({});

    const hasRecoverableProfitdockSession = useCallback(() => isCustomLegacyOAuthDomain() && hasUsableProfitdockStoredSession(), []);
    const currency = authData?.currency || getStoredProfitdockActiveCurrency() || 'USD';
    const { isLoading: isLoadingRankings, rankedMarkets, supportedMarkets } = useAccumulatorRankings(
        growthRatePercent,
        currency,
        connectionStatus
    );

    const manualMonitorCleanupRef = useRef<Map<string, () => void>>(new Map());
    const autoMonitorCleanupRef = useRef<(() => void) | null>(null);
    const autoSellRequestedRef = useRef(false);
    const autoEntryStreakRef = useRef(0);
    const autoPendingBuyRef = useRef(false);
    const autoStopAfterTradeRef = useRef(false);
    const autoRecoveryEntryRef = useRef(false);
    const autoActiveBuyPriceRef = useRef(toPositiveNumber(AUTO_DEFAULTS.stake, 1));
    const autoNextStakeRef = useRef(toPositiveNumber(AUTO_DEFAULTS.stake, 1));
    const autoStreamSnapshotAtRef = useRef(0);
    const autoStreamRefreshInFlightRef = useRef(false);
    const autoStreamRefreshRef = useRef<(() => void) | null>(null);
    const autoScanProcessedKeysRef = useRef<Record<string, string>>({});
    const autoScanStreaksRef = useRef<Record<string, number>>({});
    const autoActiveTradeMarketRef = useRef<AccumulatorMarketSnapshot | null>(null);
    const autoRecoveryMarketRef = useRef<AccumulatorMarketSnapshot | null>(null);
    const autoRunningConfigKeyRef = useRef('');
    const manualProposalSnapshotAtRef = useRef(0);
    const manualProposalRefreshInFlightRef = useRef(false);
    const manualProposalRefreshRef = useRef<(() => void) | null>(null);
    const autoProcessedStateKeyRef = useRef('');
    const manualBarrierFlashTimeoutRef = useRef<number | null>(null);
    const manualBarrierWasBreachedRef = useRef(false);

    const ensureAccumulatorTradeSession = useCallback(async (forceReconnect = false) => {
        if (!forceReconnect && hasAccumulatorTradeSession()) {
            return true;
        }

        if (!hasRecoverableProfitdockSession()) {
            return false;
        }

        try {
            await api_base.init(true);
            return hasAccumulatorTradeSession();
        } catch (error) {
            console.warn('[ProfitDock Auth] Failed to recover the accumulator trading session.', error);
            return false;
        }
    }, [hasRecoverableProfitdockSession]);

    const ensureAccumulatorTradingApi = useCallback(async (forceReconnect = false) => {
        if (!forceReconnect && hasAccumulatorTradeSession()) {
            return getDerivApi() || null;
        }

        if (!hasRecoverableProfitdockSession()) {
            return null;
        }

        const sessionRecovered = await ensureAccumulatorTradeSession(forceReconnect);
        return sessionRecovered && hasAccumulatorTradeSession() ? getDerivApi() || null : null;
    }, [ensureAccumulatorTradeSession, hasRecoverableProfitdockSession]);

    useEffect(() => {
        return () => {
            manualMonitorCleanupRef.current.forEach(cleanup => cleanup());
            autoMonitorCleanupRef.current?.();
            if (manualBarrierFlashTimeoutRef.current) {
                window.clearTimeout(manualBarrierFlashTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!hasRecoverableProfitdockSession() || (connectionStatus === CONNECTION_STATUS.OPENED && hasAccumulatorTradeSession())) {
            return;
        }

        void ensureAccumulatorTradeSession();
    }, [connectionStatus, ensureAccumulatorTradeSession, hasRecoverableProfitdockSession]);

    useEffect(() => {
        setManualConfigs(previous => {
            const nextValue = { ...previous };

            supportedMarkets.forEach(market => {
                nextValue[market.symbol] = nextValue[market.symbol] || { ...MANUAL_DEFAULTS };
            });

            return nextValue;
        });

        setAutoMarketSymbol(previous => {
            if (previous && supportedMarkets.some(market => market.symbol === previous)) {
                return previous;
            }

            return supportedMarkets[0]?.symbol ?? previous;
        });

        setManualMarketSymbol(previous => {
            if (previous && supportedMarkets.some(market => market.symbol === previous)) {
                return previous;
            }

            return supportedMarkets[0]?.symbol ?? previous;
        });
    }, [supportedMarkets]);

    const selectableMarkets = useMemo(
        () =>
            supportedMarkets.map(market => ({
                displayName: market.display_name,
                symbol: market.symbol,
            })),
        [supportedMarkets]
    );

    const resolvedManualMarket = useMemo(
        () => {
            const rankedMatch = rankedMarkets.find(market => market.symbol === manualMarketSymbol);

            if (rankedMatch) {
                return rankedMatch;
            }

            const supportedMatch =
                supportedMarkets.find(market => market.symbol === manualMarketSymbol) ?? supportedMarkets[0] ?? null;

            if (!supportedMatch) {
                return rankedMarkets[0] ?? null;
            }

            return {
                currentStat: 0,
                displayName: supportedMatch.display_name,
                lastTickEpoch: null,
                longcode: undefined,
                priceDisplay: '--',
                recentStats: [],
                symbol: supportedMatch.symbol,
            };
        },
        [manualMarketSymbol, rankedMarkets, supportedMarkets]
    );

    const resolvedAutoMarket = useMemo(
        () => {
            const rankedMatch = rankedMarkets.find(market => market.symbol === autoMarketSymbol);

            if (rankedMatch) {
                return rankedMatch;
            }

            const supportedMatch =
                supportedMarkets.find(market => market.symbol === autoMarketSymbol) ?? supportedMarkets[0] ?? null;

            if (!supportedMatch) {
                return rankedMarkets[0] ?? null;
            }

            return {
                currentStat: 0,
                displayName: supportedMatch.display_name,
                lastTickEpoch: null,
                longcode: undefined,
                priceDisplay: '--',
                recentStats: [],
                symbol: supportedMatch.symbol,
            };
        },
        [autoMarketSymbol, rankedMarkets, supportedMarkets]
    );

    const resolvedManualConfig = useMemo(
        () => (resolvedManualMarket ? manualConfigs[resolvedManualMarket.symbol] || MANUAL_DEFAULTS : MANUAL_DEFAULTS),
        [manualConfigs, resolvedManualMarket]
    );
    const resolvedManualStake = useMemo(() => roundMoney(Math.max(toPositiveNumber(resolvedManualConfig.stake, 1), 1)), [
        resolvedManualConfig.stake,
    ]);
    const resolvedManualTakeProfit = useMemo(
        () => roundMoney(toPositiveNumber(resolvedManualConfig.takeProfit, 0)),
        [resolvedManualConfig.takeProfit]
    );
    const resolvedAutoStake = useMemo(() => roundMoney(Math.max(toPositiveNumber(autoStake, 1), 1)), [autoStake]);

    const manualDedicatedFeed = useDedicatedAccumulatorFeed({
        amount: resolvedManualStake,
        currency,
        enabled: Boolean(resolvedManualMarket),
        growthRatePercent,
        symbol: resolvedManualMarket?.symbol ?? '',
        takeProfit: resolvedManualTakeProfit > 0 ? resolvedManualTakeProfit : undefined,
    });
    const autoDedicatedFeed = useDedicatedAccumulatorFeed({
        amount: resolvedAutoStake,
        currency,
        enabled: Boolean(resolvedAutoMarket) && autoMarketMode === 'single',
        growthRatePercent,
        symbol: resolvedAutoMarket?.symbol ?? '',
    });
    const currentAutoSymbol = resolvedAutoMarket?.symbol ?? '';
    const currentManualSymbol = resolvedManualMarket?.symbol ?? '';
    const activeAutoDedicatedFeed =
        autoDedicatedFeed.symbol === currentAutoSymbol ? autoDedicatedFeed : { ...EMPTY_DEDICATED_FEED, symbol: currentAutoSymbol };
    const activeAutoStream = autoStream.symbol === currentAutoSymbol ? autoStream : { ...EMPTY_AUTO_STREAM, symbol: currentAutoSymbol };
    const effectiveAutoStream = activeAutoDedicatedFeed.snapshotAt ? activeAutoDedicatedFeed : activeAutoStream;

    const resolvedAutoMartingale = useMemo(
        () => Number(Math.max(toPositiveNumber(autoMartingaleMultiplier, 2), 1).toFixed(2)),
        [autoMartingaleMultiplier]
    );
    const resolvedAutoStopLoss = useMemo(() => roundMoney(toPositiveNumber(autoSessionStopLoss, 0)), [autoSessionStopLoss]);
    const resolvedAutoStreakLength = useMemo(() => Math.max(toPositiveInteger(autoStreakLength, 3), 1), [autoStreakLength]);
    const resolvedAutoThresholdBelow = useMemo(
        () => Math.max(toPositiveInteger(autoThresholdBelow, 10), 1),
        [autoThresholdBelow]
    );

    useEffect(() => {
        if (!rankedMarkets.length) {
            setAutoScanStatsHistory({});
            return;
        }

        setAutoScanStatsHistory(previous => {
            const next = { ...previous };
            const activeSymbols = new Set(rankedMarkets.map(market => market.symbol));
            let changed = false;

            Object.keys(next).forEach(symbol => {
                if (!activeSymbols.has(symbol)) {
                    delete next[symbol];
                    changed = true;
                }
            });

            rankedMarkets.forEach(market => {
                const historyLimit = Math.max(resolvedAutoStreakLength, 8);
                const incoming = getCompletedAccumulatorStatsWindow(market, historyLimit);

                if (!incoming.length) {
                    return;
                }

                const merged = mergeRecentAccumulatorStats(incoming, next[market.symbol] || [], historyLimit);

                if ((next[market.symbol] || []).join('|') !== merged.join('|')) {
                    next[market.symbol] = merged;
                    changed = true;
                }
            });

            return changed ? next : previous;
        });
    }, [rankedMarkets, resolvedAutoStreakLength]);

    const orderedScanMarkets = useMemo(
        () =>
            ACCUMULATOR_SCAN_SYMBOL_ORDER.map(symbol => rankedMarkets.find(market => market.symbol === symbol)).filter(
                Boolean
            ) as AccumulatorMarketSnapshot[],
        [rankedMarkets]
    );
    const getAutoScanEngine = useCallback(
        (market: AccumulatorMarketSnapshot, historyLimit = 20) =>
            createAccumulatorStatEngineView(market, autoScanStatsHistory[market.symbol] || [], historyLimit),
        [autoScanStatsHistory]
    );
    const getAutoScanStats = useCallback(
        (market: AccumulatorMarketSnapshot, limit = 8) => getAutoScanEngine(market, limit).getLastNStats(limit),
        [getAutoScanEngine]
    );

    const autoScanDisplayMarket = useMemo(() => {
        const firstProgressingMarket = orderedScanMarkets.find(market => {
            const engine = getAutoScanEngine(market, Math.max(resolvedAutoStreakLength, 6));
            return engine.getStreakStatus(1, resolvedAutoThresholdBelow).progress > 0;
        });

        return firstProgressingMarket ?? orderedScanMarkets[0] ?? rankedMarkets[0] ?? null;
    }, [getAutoScanEngine, orderedScanMarkets, rankedMarkets, resolvedAutoStreakLength, resolvedAutoThresholdBelow]);
    const visibleAutoMarket = autoMarketMode === 'scan' ? autoScanDisplayMarket : resolvedAutoMarket;
    const scanAutoStream = useMemo<StreamState>(() => {
        if (!autoScanDisplayMarket) {
            return { ...EMPTY_AUTO_STREAM, isLoading: rankedMarkets.length === 0, symbol: '' };
        }

        return {
            currentStat: autoScanDisplayMarket.currentStat,
            error: null,
            isLoading: false,
            lastTickEpoch: autoScanDisplayMarket.lastTickEpoch,
            priceDisplay: autoScanDisplayMarket.priceDisplay,
            recentStats: getAutoScanStats(autoScanDisplayMarket, 8),
            snapshotAt: autoScanDisplayMarket.lastTickEpoch ? autoScanDisplayMarket.lastTickEpoch * 1000 : Date.now(),
            symbol: autoScanDisplayMarket.symbol,
        };
    }, [autoScanDisplayMarket, getAutoScanStats, rankedMarkets.length]);
    const visibleAutoStream = autoMarketMode === 'scan' ? scanAutoStream : effectiveAutoStream;
    const effectiveAutoRequiredStreak = autoRecoveryEntryRef.current && autoInstantRecovery ? 1 : resolvedAutoStreakLength;
    const autoScanRows = useMemo(
        () =>
            orderedScanMarkets.map(market => {
                const engine = getAutoScanEngine(market, Math.max(effectiveAutoRequiredStreak, 8));
                const stats = engine.getDisplayStats(8);
                const streakStatus = engine.getDisplayStreakStatus(
                    effectiveAutoRequiredStreak,
                    resolvedAutoThresholdBelow
                );

                return {
                    conditionMet: streakStatus.satisfied,
                    currentStat: engine.getCurrentRunLength(),
                    displayName: market.displayName,
                    priceDisplay: market.priceDisplay,
                    stats,
                    streak: streakStatus.progress,
                    symbol: market.symbol,
                };
            }),
        [effectiveAutoRequiredStreak, getAutoScanEngine, orderedScanMarkets, resolvedAutoThresholdBelow]
    );
    const manualPipSize = useMemo(
        () =>
            getPipSizeForSymbol(
                api_base.pip_sizes as Record<string, number>,
                resolvedManualMarket?.symbol || manualMarketSymbol || 'R_100'
            ),
        [manualMarketSymbol, resolvedManualMarket?.symbol]
    );

    useEffect(() => {
        const api = getDerivApi();

        if (!api || connectionStatus !== CONNECTION_STATUS.OPENED || !resolvedManualMarket) {
            manualProposalRefreshRef.current = null;
            manualProposalSnapshotAtRef.current = 0;
            setManualProposal({
                ...EMPTY_MANUAL_PROPOSAL,
                isLoading: true,
                symbol: resolvedManualMarket?.symbol ?? '',
            });
            return;
        }

        let isCancelled = false;
        let subscriptionId: string | null = null;
        const streamKey = `accu-manual:${resolvedManualMarket.symbol}:${growthRatePercent}:${resolvedManualStake}:${resolvedManualTakeProfit}`;

        const applyProposalSnapshot = (response: AccumulatorProposalResponse) => {
            if (isCancelled) {
                return;
            }

            const details = response.proposal?.contract_details;
            const validation = response.proposal?.validation_params;
            const nextStats = normalizeAccumulatorStats(details?.ticks_stayed_in, 10);
            const maxTicks = toFiniteNumber(details?.maximum_ticks) ?? toFiniteNumber(validation?.max_ticks);
            const snapshotAt = Date.now();
            const lastTickEpoch = toFiniteNumber(details?.last_tick_epoch);

            manualProposalSnapshotAtRef.current = snapshotAt;

            setManualProposal(previous => ({
                askPrice: toFiniteNumber(response.proposal?.ask_price) ?? previous.askPrice,
                barrierDistance: toFiniteNumber(details?.barrier_spot_distance),
                barrierPercent: details?.tick_size_barrier_percentage || previous.barrierPercent || '--',
                currentStat: nextStats[0] ?? previous.currentStat,
                error: null,
                highBarrier: toFiniteNumber(details?.high_barrier),
                isLoading: false,
                lastTickEpoch: lastTickEpoch ?? previous.lastTickEpoch,
                lowBarrier: toFiniteNumber(details?.low_barrier),
                longcode: response.proposal?.longcode || previous.longcode,
                maxPayout:
                    toFiniteNumber(validation?.max_payout) ??
                    toFiniteNumber(details?.maximum_payout) ??
                    previous.maxPayout,
                maxTicks: maxTicks ? Math.trunc(maxTicks) : null,
                payout: toFiniteNumber(response.proposal?.payout) ?? previous.payout,
                proposalId: response.proposal?.id || previous.proposalId,
                recentStats: mergeRecentAccumulatorStats(nextStats, previous.recentStats, 10),
                snapshotAt,
                spot: toFiniteNumber(response.proposal?.spot),
                symbol: resolvedManualMarket.symbol,
            }));
        };

        const requestLiveProposal = async (subscribe: boolean) => {
            const rawResponse = await api.send(
                buildAccumulatorRequest({
                    amount: resolvedManualStake,
                    currency,
                    growthRate: growthRatePercent / 100,
                    streamKey,
                    subscribe,
                    symbol: resolvedManualMarket.symbol,
                    takeProfit: resolvedManualTakeProfit > 0 ? resolvedManualTakeProfit : undefined,
                })
            );
            const response = normalizeApiMessage<AccumulatorProposalResponse>(rawResponse);

            if (response?.error) {
                throw new Error(response.error.message || 'Unable to stream manual accumulator proposal data.');
            }

            subscriptionId = response?.subscription?.id ?? subscriptionId;

            if (response) {
                applyProposalSnapshot(response);
            }
        };

        const messageSubscription = api.onMessage().subscribe((message: unknown) => {
            const data = normalizeApiMessage<AccumulatorProposalResponse>(message);

            if (!data || data.msg_type !== 'proposal' || data.echo_req?.passthrough?.streamKey !== streamKey) {
                return;
            }

            subscriptionId = data.subscription?.id ?? subscriptionId;
            applyProposalSnapshot(data);
        });

        setManualProposal({
            ...EMPTY_MANUAL_PROPOSAL,
            isLoading: true,
            symbol: resolvedManualMarket.symbol,
        });

        manualProposalRefreshRef.current = () => {
            if (manualProposalRefreshInFlightRef.current) {
                return;
            }

            manualProposalRefreshInFlightRef.current = true;
            requestLiveProposal(false)
                .catch(error => {
                    if (!isCancelled) {
                        setManualProposal(previous => ({
                            ...previous,
                            error: previous.snapshotAt
                                ? null
                                : error instanceof Error
                                  ? error.message
                                  : 'Unable to refresh manual accumulator data.',
                        }));
                    }
                })
                .finally(() => {
                    manualProposalRefreshInFlightRef.current = false;
                });
        };

        requestLiveProposal(true)
            .catch(error => {
                if (!isCancelled) {
                    setManualProposal(previous => ({
                        ...previous,
                        isLoading: false,
                        error: previous.snapshotAt
                            ? null
                            : error instanceof Error
                              ? error.message
                              : 'Unable to stream manual accumulator data.',
                    }));
                }
            });

        return () => {
            isCancelled = true;
            manualProposalRefreshRef.current = null;
            manualProposalRefreshInFlightRef.current = false;
            messageSubscription.unsubscribe();
            forgetSubscription(api, subscriptionId);
        };
    }, [
        connectionStatus,
        currency,
        growthRatePercent,
        resolvedManualMarket,
        resolvedManualStake,
        resolvedManualTakeProfit,
    ]);

    useEffect(() => {
        const api = getDerivApi();

        if (!api || connectionStatus !== CONNECTION_STATUS.OPENED || !resolvedManualMarket) {
            setManualChartTicks([]);
            setIsManualTickLoading(true);
            setManualTickError(null);
            return;
        }

        let isCancelled = false;
        let tickSubscriptionId: string | null = null;
        const targetSymbol = resolvedManualMarket.symbol;

        const pushTick = (quote: number, epoch: number) => {
            if (!Number.isFinite(quote) || !Number.isFinite(epoch)) {
                return;
            }

            setManualChartTicks(previous => {
                const latest = previous[previous.length - 1];

                if (latest?.epoch === epoch && latest.quote === quote) {
                    return previous;
                }

                return [...previous, { epoch, quote }].slice(-MANUAL_CHART_BUFFER);
            });
            setIsManualTickLoading(false);
            setManualTickError(null);
        };

        const messageSubscription = api.onMessage().subscribe((message: unknown) => {
            const data = normalizeApiMessage<TickStreamResponse>(message);

            if (!data || data.msg_type !== 'tick' || data.tick?.symbol !== targetSymbol) {
                return;
            }

            pushTick(data.tick.quote, data.tick.epoch);
        });

        setIsManualTickLoading(true);
        setManualTickError(null);

        api.send({
            adjust_start_time: 1,
            count: MANUAL_CHART_BUFFER,
            end: 'latest',
            start: 1,
            style: 'ticks',
            ticks_history: targetSymbol,
        })
            .then(rawHistory => {
                const history = normalizeApiMessage<TickHistoryResponse>(rawHistory);

                if (history?.error) {
                    throw new Error(history.error.message || 'Unable to load manual chart history.');
                }

                const historyTicks =
                    history?.history?.times?.map((epoch, index) => ({
                        epoch: Number(epoch),
                        quote: Number(history.history?.prices?.[index] ?? 0),
                    })) ?? [];

                if (!isCancelled) {
                    setManualChartTicks(historyTicks.filter(tick => Number.isFinite(tick.epoch) && Number.isFinite(tick.quote)));
                    setIsManualTickLoading(false);
                }
            })
            .then(() => api.send({ subscribe: 1, ticks: targetSymbol }))
            .then(rawSubscription => {
                const subscription = normalizeApiMessage<TickStreamResponse>(rawSubscription);

                if (subscription?.error) {
                    throw new Error(subscription.error.message || 'Unable to subscribe to manual market ticks.');
                }

                tickSubscriptionId = subscription?.subscription?.id ?? tickSubscriptionId;
                if (subscription?.tick?.symbol === targetSymbol) {
                    pushTick(subscription.tick.quote, subscription.tick.epoch);
                }
            })
            .catch(error => {
                if (!isCancelled) {
                    setIsManualTickLoading(false);
                    setManualTickError(error instanceof Error ? error.message : 'Unable to stream manual tick data.');
                }
            });

        return () => {
            isCancelled = true;
            messageSubscription.unsubscribe();
            forgetSubscription(api, tickSubscriptionId);
        };
    }, [connectionStatus, resolvedManualMarket]);

    useEffect(() => {
        const api = getDerivApi();

        if (!resolvedManualMarket) {
            return;
        }

        let isCancelled = false;
        const applyQuoteSnapshot = (response: AccumulatorProposalResponse, canUseProposalForBuy: boolean) => {
            if (isCancelled) {
                return;
            }

            const validation = response.proposal?.validation_params;
            const details = response.proposal?.contract_details;
            const maxPayout =
                toFiniteNumber(validation?.max_payout) ??
                toFiniteNumber(details?.maximum_payout) ??
                toFiniteNumber(response.proposal?.payout);
            const nextStats = normalizeAccumulatorStats(details?.ticks_stayed_in, 10);
            const maxTicks = toFiniteNumber(details?.maximum_ticks) ?? toFiniteNumber(validation?.max_ticks);
            const lastTickEpoch = toFiniteNumber(details?.last_tick_epoch);

            setManualProposal(previous => ({
                ...previous,
                askPrice: toFiniteNumber(response.proposal?.ask_price),
                barrierDistance: toFiniteNumber(details?.barrier_spot_distance) ?? previous.barrierDistance,
                barrierPercent: details?.tick_size_barrier_percentage || previous.barrierPercent || '--',
                currentStat: nextStats[0] ?? previous.currentStat,
                error: null,
                highBarrier: toFiniteNumber(details?.high_barrier) ?? previous.highBarrier,
                isLoading: false,
                lastTickEpoch: lastTickEpoch ?? previous.lastTickEpoch,
                lowBarrier: toFiniteNumber(details?.low_barrier) ?? previous.lowBarrier,
                longcode: response.proposal?.longcode || previous.longcode,
                maxPayout,
                maxTicks: maxTicks ? Math.trunc(maxTicks) : previous.maxTicks,
                payout: toFiniteNumber(response.proposal?.payout),
                proposalId: canUseProposalForBuy ? response.proposal?.id || previous.proposalId : previous.proposalId,
                recentStats: mergeRecentAccumulatorStats(nextStats, previous.recentStats, 10),
                snapshotAt: Date.now(),
                spot: toFiniteNumber(response.proposal?.spot) ?? previous.spot,
                symbol: resolvedManualMarket.symbol,
            }));
        };

        const refreshQuote = async () => {
            if (!api || connectionStatus !== CONNECTION_STATUS.OPENED) {
                return;
            }

            const response = normalizeApiMessage<AccumulatorProposalResponse>(
                await api.send(
                    buildAccumulatorRequest({
                        amount: resolvedManualStake,
                        currency,
                        growthRate: growthRatePercent / 100,
                        symbol: resolvedManualMarket.symbol,
                        takeProfit: resolvedManualTakeProfit > 0 ? resolvedManualTakeProfit : undefined,
                    })
                )
            );

            if (response?.error) {
                throw new Error(response.error.message || 'Unable to refresh manual accumulator quote.');
            }

            if (response?.proposal) {
                applyQuoteSnapshot(response, hasAccumulatorTradeSession());
            }
        };

        refreshQuote()
            .catch(error => {
                if (!isCancelled) {
                    setManualProposal(previous => ({
                        ...previous,
                        error:
                            previous.snapshotAt || previous.askPrice !== null
                                ? previous.error
                                : error instanceof Error
                                  ? error.message
                                  : 'Unable to refresh manual accumulator quote.',
                    }));
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [
        connectionStatus,
        currency,
        growthRatePercent,
        resolvedManualMarket,
        resolvedManualStake,
        resolvedManualTakeProfit,
    ]);

    useEffect(() => {
        if (!manualProposalRefreshRef.current || !resolvedManualMarket || connectionStatus !== CONNECTION_STATUS.OPENED) {
            return;
        }

        const watchdogId = window.setInterval(() => {
            const snapshotAge = Date.now() - manualProposalSnapshotAtRef.current;

            if (snapshotAge > AUTO_PROPOSAL_STALE_MS) {
                manualProposalRefreshRef.current?.();
            }
        }, 400);

        return () => window.clearInterval(watchdogId);
    }, [connectionStatus, resolvedManualMarket]);

    useEffect(() => {
        const api = getDerivApi();

        if (!api || connectionStatus !== CONNECTION_STATUS.OPENED || !resolvedAutoMarket || autoMarketMode !== 'single') {
            autoStreamRefreshRef.current = null;
            autoStreamSnapshotAtRef.current = 0;
            autoProcessedStateKeyRef.current = '';
            return;
        }

        let isCancelled = false;
        let subscriptionId: string | null = null;
        const streamKey = `accu-live:${resolvedAutoMarket.symbol}:${growthRatePercent}`;

        const handleSnapshot = (response: AccumulatorProposalResponse) => {
            const snapshot = buildAccumulatorSnapshot(
                supportedMarkets.find(market => market.symbol === resolvedAutoMarket.symbol) || {
                    display_name: resolvedAutoMarket.displayName,
                    market: '',
                    submarket: '',
                    symbol: resolvedAutoMarket.symbol,
                },
                response
            );

            if (!snapshot || isCancelled) {
                return;
            }

            const snapshotAt = Date.now();
            autoStreamSnapshotAtRef.current = snapshotAt;
            setAutoStream(previous => ({
                currentStat: snapshot.currentStat,
                error: null,
                isLoading: false,
                lastTickEpoch: snapshot.lastTickEpoch ?? previous.lastTickEpoch,
                priceDisplay: snapshot.priceDisplay,
                recentStats: mergeRecentAccumulatorStats(snapshot.recentStats, previous.recentStats, 10),
                snapshotAt,
                symbol: resolvedAutoMarket.symbol,
            }));
        };

        const requestLiveSnapshot = async (subscribe: boolean) => {
            const response = normalizeApiMessage<AccumulatorProposalResponse>(
                await api.send(
                    buildAccumulatorRequest({
                        amount: 1,
                        currency,
                        growthRate: growthRatePercent / 100,
                        streamKey,
                        subscribe,
                        symbol: resolvedAutoMarket.symbol,
                    })
                )
            );

            if (response?.error) {
                throw new Error(response.error.message || 'Unable to stream accumulator stats.');
            }

            subscriptionId = response?.subscription?.id ?? subscriptionId;

            if (response) {
                handleSnapshot(response);
            }
        };

        const messageSubscription = api.onMessage().subscribe((message: unknown) => {
            const data = normalizeApiMessage<AccumulatorProposalResponse>(message);

            if (!data || data.msg_type !== 'proposal' || data.echo_req?.passthrough?.streamKey !== streamKey) {
                return;
            }

            subscriptionId = data.subscription?.id ?? subscriptionId;
            handleSnapshot(data);
        });

        setAutoStream({
            ...EMPTY_AUTO_STREAM,
            isLoading: true,
            symbol: resolvedAutoMarket.symbol,
        });

        autoStreamRefreshRef.current = () => {
            if (autoStreamRefreshInFlightRef.current) {
                return;
            }

            autoStreamRefreshInFlightRef.current = true;
            requestLiveSnapshot(false)
                .catch(error => {
                    if (!isCancelled) {
                        setAutoStream(previous => ({
                            currentStat: previous.currentStat,
                            error:
                                previous.snapshotAt || previous.currentStat !== null
                                    ? null
                                    : error instanceof Error
                                      ? error.message
                                      : 'Unable to stream accumulator stats.',
                            isLoading: false,
                            lastTickEpoch: previous.lastTickEpoch,
                            priceDisplay: previous.priceDisplay,
                            recentStats: previous.recentStats,
                            snapshotAt: previous.snapshotAt,
                            symbol: previous.symbol,
                        }));
                    }
                })
                .finally(() => {
                    autoStreamRefreshInFlightRef.current = false;
                });
        };

        requestLiveSnapshot(true)
            .catch(error => {
                if (!isCancelled) {
                    setAutoStream(previous => ({
                        currentStat: previous.currentStat,
                        error: previous.snapshotAt ? null : error instanceof Error ? error.message : 'Unable to stream accumulator stats.',
                        isLoading: false,
                        lastTickEpoch: previous.lastTickEpoch,
                        priceDisplay: previous.priceDisplay,
                        recentStats: previous.recentStats,
                        snapshotAt: previous.snapshotAt,
                        symbol: previous.symbol,
                    }));
                }
            });

        return () => {
            isCancelled = true;
            autoStreamRefreshRef.current = null;
            autoStreamRefreshInFlightRef.current = false;
            autoProcessedStateKeyRef.current = '';
            messageSubscription.unsubscribe();
            forgetSubscription(api, subscriptionId);
        };
    }, [autoMarketMode, connectionStatus, currency, growthRatePercent, resolvedAutoMarket, supportedMarkets]);

    useEffect(() => {
        if (
            autoMarketMode !== 'single' ||
            !autoStreamRefreshRef.current ||
            !resolvedAutoMarket ||
            connectionStatus !== CONNECTION_STATUS.OPENED
        ) {
            return;
        }

        const watchdogId = window.setInterval(() => {
            const snapshotAge = Date.now() - autoStreamSnapshotAtRef.current;

            if (snapshotAge > AUTO_PROPOSAL_STALE_MS) {
                autoStreamRefreshRef.current?.();
            }
        }, 400);

        return () => window.clearInterval(watchdogId);
    }, [autoMarketMode, connectionStatus, resolvedAutoMarket]);

    const handleManualConfigChange = (symbol: string, field: keyof ManualCardConfig, value: string) => {
        setManualConfigs(previous => ({
            ...previous,
            [symbol]: {
                ...(previous[symbol] || MANUAL_DEFAULTS),
                [field]: value,
            },
        }));
    };

    const attachManualTradeMonitor = useCallback(
        async (symbol: string, contractId: number, buyPrice: number) => {
            const api = getDerivApi();

            if (!api) {
                return;
            }

            manualMonitorCleanupRef.current.get(symbol)?.();

            const cleanup = await subscribeToOpenContract(api, {
                contractId,
                onError: message => {
                    setManualTrades(previous => ({
                        ...previous,
                        [symbol]: {
                            ...(previous[symbol] || {
                                buyPrice,
                                feedback: '',
                                isValidToSell: false,
                                profit: 0,
                                status: 'idle',
                                tickPassed: 0,
                            }),
                            feedback: message,
                            status: 'error',
                        },
                    }));
                },
                onUpdate: contract => {
                    const bidPrice = getAccumulatorBidPrice(contract);

                    transactions.pushTransaction({
                        ...(contract as ProposalOpenContract),
                        accountID: getActiveTransactionAccountId(),
                    } as ProposalOpenContract);

                    setManualTrades(previous => ({
                        ...previous,
                        [symbol]: {
                            bidPrice: bidPrice || previous[symbol]?.bidPrice,
                            buyPrice,
                            contractId: contract.contract_id,
                            feedback:
                                isAccumulatorContractSold(contract)
                                    ? localize('Manual accumulator trade closed.')
                                    : localize('Manual accumulator trade opened.'),
                            isValidToSell: isAccumulatorContractSellable(contract),
                            profit: typeof contract.profit === 'number' ? contract.profit : previous[symbol]?.profit || 0,
                            status: isAccumulatorContractSold(contract) ? 'closed' : 'live',
                            tickPassed: contract.tick_passed || 0,
                        },
                    }));

                    if (isAccumulatorContractSold(contract)) {
                        manualMonitorCleanupRef.current.get(symbol)?.();
                        manualMonitorCleanupRef.current.delete(symbol);
                    }
                },
            });

            manualMonitorCleanupRef.current.set(symbol, cleanup);
        },
        [transactions]
    );

    const handleManualBuy = useCallback(
        async (market: AccumulatorMarketSnapshot) => {
            const config = manualConfigs[market.symbol] || MANUAL_DEFAULTS;
            const stake = toPositiveNumber(config.stake);
            const takeProfit = toPositiveNumber(config.takeProfit);

            if (!stake) {
                setManualTrades(previous => ({
                    ...previous,
                    [market.symbol]: {
                        buyPrice: 0,
                        feedback: localize('Enter a valid stake before buying.'),
                        profit: 0,
                        status: 'error',
                        tickPassed: 0,
                    },
                }));
                return;
            }

            const api = await ensureAccumulatorTradingApi();

            if (!api) {
                setManualTrades(previous => ({
                    ...previous,
                    [market.symbol]: {
                        buyPrice: stake,
                        feedback: hasRecoverableProfitdockSession()
                            ? localize(
                                  'ProfitDock is still reconnecting to your Deriv trading session. Please try again in a moment.'
                              )
                            : localize('Log in to a Deriv account before placing an accumulator trade.'),
                        profit: 0,
                        status: 'error',
                        tickPassed: 0,
                    },
                }));
                return;
            }

            setManualTrades(previous => ({
                ...previous,
                [market.symbol]: {
                    buyPrice: stake,
                    feedback: localize('Sending accumulator order...'),
                    profit: 0,
                    status: 'opening',
                    tickPassed: 0,
                },
            }));

            try {
                const placeTrade = async (tradeApi: ApiLike, allowLiveProposal: boolean) => {
                    const liveProposalAge = manualProposal.snapshotAt ? Date.now() - manualProposal.snapshotAt : Infinity;
                    const canUseLiveProposal =
                        allowLiveProposal &&
                        manualProposal.symbol === market.symbol &&
                        manualProposal.proposalId &&
                        manualProposal.askPrice !== null &&
                        liveProposalAge <= MANUAL_PROPOSAL_BUY_MAX_AGE_MS;
                    let quote = canUseLiveProposal
                        ? ({
                              askPrice: manualProposal.askPrice,
                              longcode: manualProposal.longcode,
                              proposalId: manualProposal.proposalId,
                          } as AccumulatorQuote)
                        : await requestAccumulatorQuote(tradeApi, {
                              amount: stake,
                              currency,
                              growthRatePercent,
                              symbol: market.symbol,
                              takeProfit,
                          });

                    try {
                        return {
                            buyResponse: await buyAccumulatorQuote(tradeApi, quote),
                            quote,
                        };
                    } catch (buyError) {
                        if (!shouldRetryAccumulatorBuy(buyError)) {
                            throw buyError;
                        }

                        quote = await requestAccumulatorQuote(tradeApi, {
                            amount: stake,
                            currency,
                            growthRatePercent,
                            symbol: market.symbol,
                            takeProfit,
                        });

                        return {
                            buyResponse: await buyAccumulatorQuote(tradeApi, quote),
                            quote,
                        };
                    }
                };

                let tradeResult: {
                    buyResponse: { buy?: { contract_id?: number; longcode?: string }; error?: { message?: string } };
                    quote: AccumulatorQuote;
                };

                try {
                    tradeResult = await placeTrade(api, true);
                } catch (tradeError) {
                    if (!isRecoverableAccumulatorAuthError(tradeError)) {
                        throw tradeError;
                    }

                    setManualTrades(previous => ({
                        ...previous,
                        [market.symbol]: {
                            ...(previous[market.symbol] || {
                                buyPrice: stake,
                                feedback: '',
                                isValidToSell: false,
                                profit: 0,
                                status: 'opening',
                                tickPassed: 0,
                            }),
                            feedback: localize('Refreshing Deriv trading session and retrying accumulator order...'),
                            status: 'opening',
                        },
                    }));

                    const refreshedApi = await ensureAccumulatorTradingApi(true);

                    if (!refreshedApi) {
                        throw tradeError;
                    }

                    tradeResult = await placeTrade(refreshedApi, false);
                }

                const { buyResponse, quote } = tradeResult;

                const contractId = buyResponse?.buy?.contract_id;

                if (!contractId) {
                    throw new Error('Accumulator trade was sent but no contract id was returned.');
                }

                transactions.pushTransaction({
                    accountID: getActiveTransactionAccountId(),
                    buy_price: stake,
                    contract_id: contractId,
                    contract_type: 'ACCU',
                    currency,
                    date_start: Math.floor(Date.now() / 1000),
                    display_name: market.displayName,
                    is_completed: false,
                    longcode: buyResponse?.buy?.longcode || quote.longcode,
                    profit: 0,
                    transaction_ids: {
                        buy: (buyResponse?.buy as { transaction_id?: number } | undefined)?.transaction_id || contractId,
                    },
                    underlying: market.symbol,
                    underlying_symbol: market.symbol,
                } as ProposalOpenContract);

                setManualTrades(previous => ({
                    ...previous,
                    [market.symbol]: {
                        buyPrice: stake,
                        contractId,
                        feedback:
                            buyResponse?.buy?.longcode ||
                            quote.longcode ||
                            localize('Manual accumulator trade opened successfully.'),
                        profit: 0,
                        status: 'live',
                        tickPassed: 0,
                    },
                }));

                await attachManualTradeMonitor(market.symbol, contractId, stake);
            } catch (error) {
                setManualTrades(previous => ({
                    ...previous,
                    [market.symbol]: {
                        buyPrice: stake,
                        feedback: error instanceof Error ? error.message : 'Unable to place the accumulator trade.',
                        profit: 0,
                        status: 'error',
                        tickPassed: 0,
                    },
                }));
            }
        },
        [
            attachManualTradeMonitor,
            currency,
            ensureAccumulatorTradingApi,
            growthRatePercent,
            hasRecoverableProfitdockSession,
            manualConfigs,
            manualProposal,
            transactions,
        ]
    );

    const handleManualSell = useCallback(
        async (market: AccumulatorMarketSnapshot) => {
            const api = await ensureAccumulatorTradingApi();
            const activeTrade = manualTrades[market.symbol];

            if (!api || !activeTrade?.contractId) {
                return;
            }

            setManualTrades(previous => ({
                ...previous,
                [market.symbol]: {
                    ...(previous[market.symbol] || activeTrade),
                    feedback: localize('Sending sell request...'),
                    status: 'selling',
                },
            }));

            try {
                const placeSell = async (tradeApi: ApiLike) =>
                    normalizeApiMessage<{
                        sell?: {
                            price?: number;
                            sold_for?: number;
                            transaction_id?: number;
                        };
                    }>(await sellContractAtMarketWithRetry(tradeApi, activeTrade.contractId, activeTrade.bidPrice));

                let sellResponse:
                    | {
                          sell?: {
                              price?: number;
                              sold_for?: number;
                              transaction_id?: number;
                          };
                      }
                    | undefined;

                try {
                    sellResponse = await placeSell(api);
                } catch (sellError) {
                    if (!isRecoverableAccumulatorAuthError(sellError)) {
                        throw sellError;
                    }

                    const refreshedApi = await ensureAccumulatorTradingApi(true);
                    if (!refreshedApi) {
                        throw sellError;
                    }

                    sellResponse = await placeSell(refreshedApi);
                }
                const soldFor = toFiniteNumber(sellResponse?.sell?.sold_for ?? sellResponse?.sell?.price);

                if (soldFor !== null) {
                    transactions.pushTransaction({
                        accountID: getActiveTransactionAccountId(),
                        buy_price: activeTrade.buyPrice,
                        contract_id: activeTrade.contractId,
                        contract_type: 'ACCU',
                        currency,
                        is_completed: true,
                        is_sold: 1,
                        profit: roundMoney(soldFor - activeTrade.buyPrice),
                        sell_price: soldFor,
                        transaction_ids: {
                            sell: sellResponse?.sell?.transaction_id || activeTrade.contractId,
                        },
                        underlying: market.symbol,
                        underlying_symbol: market.symbol,
                    } as ProposalOpenContract);
                }
            } catch (error) {
                setManualTrades(previous => ({
                    ...previous,
                    [market.symbol]: {
                        ...(previous[market.symbol] || activeTrade),
                        feedback: error instanceof Error ? error.message : 'Unable to close the accumulator trade.',
                        status: 'error',
                    },
                }));
            }
        },
        [currency, ensureAccumulatorTradingApi, manualTrades, transactions]
    );

    const stopAutoMonitoring = useCallback(
        (reason: string, status: AutoEngineStatus = 'idle') => {
            autoStopAfterTradeRef.current = false;
            autoEntryStreakRef.current = 0;
            autoPendingBuyRef.current = false;
            autoRecoveryEntryRef.current = false;
            autoActiveTradeMarketRef.current = null;
            autoRecoveryMarketRef.current = null;
            autoRunningConfigKeyRef.current = '';
            autoProcessedStateKeyRef.current = '';
            autoScanProcessedKeysRef.current = {};
            autoScanStreaksRef.current = {};

            setAutoEngine(previous => ({
                ...previous,
                entryStreak: 0,
                feedback: reason,
                running: false,
                status,
            }));
        },
        []
    );

    const handleAutoContractUpdate = useCallback(
        async (contract: AccumulatorOpenContract) => {
            const api = getDerivApi();
            const exitTick = AUTO_EXIT_TICK;
            const displayName = contract.display_name || resolvedAutoMarket?.displayName || autoMarketSymbol;
            const liveProfit = typeof contract.profit === 'number' ? contract.profit : 0;
            const tickPassed = contract.tick_passed || 0;

            transactions.pushTransaction({
                ...(contract as ProposalOpenContract),
                accountID: getActiveTransactionAccountId(),
            } as ProposalOpenContract);

            setAutoEngine(previous => ({
                ...previous,
                activeContractId: contract.contract_id,
                activeProfit: liveProfit,
                feedback:
                    isAccumulatorContractSold(contract)
                        ? previous.feedback
                        : localize('Auto trade opened on {{ market }}. Tick {{ current }}/{{ target }}.', {
                              current: String(Math.min(tickPassed, exitTick)),
                              market: displayName,
                              target: String(exitTick),
                          }),
                status: isAccumulatorContractSold(contract) ? previous.status : 'live',
                tickPassed,
            }));

            if (!isAccumulatorContractSold(contract) && !autoSellRequestedRef.current && tickPassed >= exitTick && isAccumulatorContractSellable(contract)) {
                autoSellRequestedRef.current = true;
                setAutoEngine(previous => ({
                    ...previous,
                    feedback: localize('Exit tick reached. Closing the accumulator trade at market.'),
                }));

                if (api && contract.contract_id) {
                    try {
                        await sellContractAtMarketWithRetry(api, contract.contract_id, getAccumulatorBidPrice(contract));
                    } catch (error) {
                        autoSellRequestedRef.current = false;
                        setAutoEngine(previous => ({
                            ...previous,
                            feedback:
                                error instanceof Error
                                    ? error.message
                                    : 'Unable to close the accumulator trade at market.',
                            status: 'error',
                        }));
                    }
                }
            }

            if (isAccumulatorContractSold(contract)) {
                const realizedProfit =
                    typeof contract.profit === 'number'
                        ? roundMoney(contract.profit)
                        : roundMoney((contract.sell_price || 0) - autoActiveBuyPriceRef.current);
                const tradeLost = realizedProfit <= 0;
                const recoveryMarket = autoActiveTradeMarketRef.current;
                const nextStake =
                    realizedProfit > 0
                        ? resolvedAutoStake
                        : roundMoney(autoNextStakeRef.current * resolvedAutoMartingale);
                const sessionStopLoss = resolvedAutoStopLoss;

                autoSellRequestedRef.current = false;
                autoEntryStreakRef.current = 0;
                autoMonitorCleanupRef.current?.();
                autoMonitorCleanupRef.current = null;
                autoNextStakeRef.current = nextStake;
                autoRecoveryEntryRef.current = tradeLost && autoInstantRecovery && Boolean(recoveryMarket);
                autoRecoveryMarketRef.current = autoRecoveryEntryRef.current ? recoveryMarket : null;
                autoActiveTradeMarketRef.current = null;

                if (autoRecoveryEntryRef.current && recoveryMarket) {
                    delete autoScanProcessedKeysRef.current[recoveryMarket.symbol];

                    if (recoveryMarket.symbol === currentAutoSymbol) {
                        autoProcessedStateKeyRef.current = '';
                    }
                }

                setAutoEngine(previous => {
                    const sessionPnl = roundMoney(previous.sessionPnl + realizedProfit);
                    const stopLossReached = sessionStopLoss > 0 && sessionPnl <= -sessionStopLoss;
                    const limitReached = stopLossReached;
                    const stopRequested = autoStopAfterTradeRef.current;
                    const shouldKeepMonitoring = previous.running && !stopRequested && !limitReached;

                    return {
                        activeContractId: undefined,
                        activeProfit: 0,
                        closedTrades: previous.closedTrades + 1,
                        entryStreak: 0,
                        feedback: limitReached
                            ? localize('Session stop loss reached. Auto trading stopped.')
                            : stopRequested
                              ? localize('Auto trading stopped after the active trade closed.')
                              : realizedProfit > 0
                                ? localize(
                                      'Winning trade closed. Waiting for {{ streak }} fresh stats at or below {{ threshold }}.',
                                      {
                                          streak: String(resolvedAutoStreakLength),
                                          threshold: String(resolvedAutoThresholdBelow),
                                      }
                                  )
                                : autoInstantRecovery
                                  ? localize(
                                      'Losing trade closed. Instant Recovery armed: waiting for the next stat at or below {{ threshold }} at the updated stake.',
                                        {
                                            threshold: String(resolvedAutoThresholdBelow),
                                        }
                                    )
                                  : localize(
                                        'Losing trade closed. Waiting for {{ streak }} fresh stats at or below {{ threshold }} at the updated stake.',
                                        {
                                            streak: String(resolvedAutoStreakLength),
                                            threshold: String(resolvedAutoThresholdBelow),
                                        }
                                    ),
                        lastResult:
                            realizedProfit > 0
                                ? localize('Win: {{ pnl }}. Next stake reset to {{ stake }}.', {
                                       pnl: formatMoney(realizedProfit, currency),
                                       stake: formatMoney(nextStake, currency),
                                   })
                                : localize('Loss: {{ pnl }}. Next stake {{ stake }}.', {
                                      pnl: formatMoney(realizedProfit, currency),
                                      stake: formatMoney(nextStake, currency),
                                  }),
                        nextStake,
                        running: shouldKeepMonitoring,
                        sessionPnl,
                        status: limitReached ? 'stopped_limit' : stopRequested ? 'idle' : shouldKeepMonitoring ? 'arming' : 'idle',
                        tickPassed: 0,
                    };
                });

                autoStopAfterTradeRef.current = false;
            }
        },
        [
            autoMarketSymbol,
            autoInstantRecovery,
            currency,
            currentAutoSymbol,
            resolvedAutoMarket,
            resolvedAutoMartingale,
            resolvedAutoStake,
            resolvedAutoStopLoss,
            resolvedAutoStreakLength,
            resolvedAutoThresholdBelow,
            transactions,
        ]
    );

    const executeAutoTrade = useCallback(async (marketOverride?: AccumulatorMarketSnapshot | null) => {
        const tradeMarket = marketOverride ?? autoRecoveryMarketRef.current ?? resolvedAutoMarket;
        const stake = roundMoney(autoNextStakeRef.current);

        if (!tradeMarket || autoPendingBuyRef.current) {
            return;
        }

        autoPendingBuyRef.current = true;
        const api = await ensureAccumulatorTradingApi();

        if (!api) {
            autoPendingBuyRef.current = false;
            setAutoEngine(previous => ({
                ...previous,
                feedback: hasRecoverableProfitdockSession()
                    ? localize('ProfitDock is still reconnecting to your Deriv trading session. Please try again in a moment.')
                    : localize('Log in to a Deriv account before starting the auto trader.'),
                status: 'error',
            }));
            return;
        }

        autoActiveTradeMarketRef.current = tradeMarket;
        autoRecoveryMarketRef.current = null;
        setAutoEngine(previous => ({
            ...previous,
            feedback: localize('Entry confirmed. Sending the accumulator order...'),
            status: 'buying',
        }));

        try {
            const placeAutoTrade = async (tradeApi: ApiLike) => {
                let quote = await requestAccumulatorQuote(tradeApi, {
                    amount: stake,
                    currency,
                    growthRatePercent,
                    symbol: tradeMarket.symbol,
                });

                try {
                    return {
                        buyResponse: await buyAccumulatorQuote(
                            tradeApi,
                            quote,
                            'Unable to start the auto accumulator trade.'
                        ),
                        quote,
                    };
                } catch (buyError) {
                    if (!shouldRetryAccumulatorBuy(buyError)) {
                        throw buyError;
                    }

                    quote = await requestAccumulatorQuote(tradeApi, {
                        amount: stake,
                        currency,
                        growthRatePercent,
                        symbol: tradeMarket.symbol,
                    });

                    return {
                        buyResponse: await buyAccumulatorQuote(
                            tradeApi,
                            quote,
                            'Unable to start the auto accumulator trade.'
                        ),
                        quote,
                    };
                }
            };

            let tradeResult: {
                buyResponse: { buy?: { contract_id?: number; longcode?: string }; error?: { message?: string } };
                quote: AccumulatorQuote;
            };
            let monitorApi = api;

            try {
                tradeResult = await placeAutoTrade(api);
            } catch (tradeError) {
                if (!isRecoverableAccumulatorAuthError(tradeError)) {
                    throw tradeError;
                }

                setAutoEngine(previous => ({
                    ...previous,
                    feedback: localize('Refreshing Deriv trading session and retrying auto accumulator order...'),
                    status: 'buying',
                }));

                const refreshedApi = await ensureAccumulatorTradingApi(true);

                if (!refreshedApi) {
                    throw tradeError;
                }

                monitorApi = refreshedApi;
                tradeResult = await placeAutoTrade(refreshedApi);
            }

            const { buyResponse, quote } = tradeResult;

            const contractId = buyResponse?.buy?.contract_id;

            if (!contractId) {
                throw new Error('The auto accumulator trade did not return a contract id.');
            }

            autoActiveBuyPriceRef.current = stake;

            transactions.pushTransaction({
                accountID: getActiveTransactionAccountId(),
                buy_price: stake,
                contract_id: contractId,
                contract_type: 'ACCU',
                currency,
                date_start: Math.floor(Date.now() / 1000),
                display_name: tradeMarket.displayName,
                is_completed: false,
                longcode: buyResponse?.buy?.longcode || quote.longcode,
                profit: 0,
                transaction_ids: {
                    buy: (buyResponse?.buy as { transaction_id?: number } | undefined)?.transaction_id || contractId,
                },
                underlying: tradeMarket.symbol,
                underlying_symbol: tradeMarket.symbol,
            } as ProposalOpenContract);

            setAutoEngine(previous => ({
                ...previous,
                activeContractId: contractId,
                activeProfit: 0,
                feedback:
                    buyResponse?.buy?.longcode || quote.longcode || localize('Auto accumulator trade is running.'),
                status: 'live',
                tickPassed: 0,
            }));

            autoMonitorCleanupRef.current?.();
            autoMonitorCleanupRef.current = await subscribeToOpenContract(monitorApi, {
                contractId,
                onError: message => {
                    setAutoEngine(previous => ({
                        ...previous,
                        feedback: message,
                        status: 'error',
                    }));
                },
                onUpdate: contract => {
                    void handleAutoContractUpdate(contract);
                },
            });
        } catch (error) {
            autoActiveTradeMarketRef.current = null;
            setAutoEngine(previous => ({
                ...previous,
                feedback: error instanceof Error ? error.message : 'Unable to start the auto accumulator trade.',
                status: 'error',
            }));
        } finally {
            autoPendingBuyRef.current = false;
        }
    }, [
        currency,
        ensureAccumulatorTradingApi,
        growthRatePercent,
        handleAutoContractUpdate,
        hasRecoverableProfitdockSession,
        resolvedAutoMarket,
        transactions,
    ]);

    useEffect(() => {
        if (
            autoMarketMode !== 'single' ||
            !autoEngine.running ||
            autoEngine.activeContractId ||
            autoPendingBuyRef.current ||
            effectiveAutoStream.currentStat === null ||
            !effectiveAutoStream.snapshotAt
        ) {
            return;
        }

        const requiredStreakLength = autoRecoveryEntryRef.current && autoInstantRecovery ? 1 : resolvedAutoStreakLength;
        const singleMarketEngine = createAccumulatorStatEngineView(
            effectiveAutoStream,
            [],
            Math.max(requiredStreakLength, 6)
        );
        const statsWindow = singleMarketEngine.getDisplayStats(Math.max(requiredStreakLength, 8));
        const streakStatus = singleMarketEngine.getDisplayStreakStatus(requiredStreakLength, resolvedAutoThresholdBelow);
        const currentStreak = streakStatus.progress;
        const autoStateKey = `${currentAutoSymbol}:${statsWindow.join('|')}`;

        if (autoProcessedStateKeyRef.current === autoStateKey) {
            return;
        }

        autoProcessedStateKeyRef.current = autoStateKey;

        const displayName = resolvedAutoMarket?.displayName || autoMarketSymbol;

        if (currentStreak > 0) {
            autoEntryStreakRef.current = currentStreak;
            setAutoEngine(previous => ({
                ...previous,
                entryStreak: currentStreak,
                feedback: localize(
                    'Watching {{ market }}. Streak {{ streak }}/{{ target }} with current stat {{ stat }} at or below {{ threshold }}.',
                    {
                        market: displayName,
                        stat: String(effectiveAutoStream.currentStat),
                        streak: String(currentStreak),
                        target: String(requiredStreakLength),
                        threshold: String(resolvedAutoThresholdBelow),
                    }
                ),
                status: 'arming',
            }));

            if (streakStatus.satisfied) {
                autoEntryStreakRef.current = 0;
                autoRecoveryEntryRef.current = false;
                setAutoEngine(previous => ({
                    ...previous,
                    entryStreak: 0,
                }));
                void executeAutoTrade();
            }

            return;
        }

        autoEntryStreakRef.current = 0;
        setAutoEngine(previous => ({
            ...previous,
            entryStreak: 0,
            feedback: localize('Waiting for {{ streak }} fresh stats at or below {{ threshold }} on {{ market }}.', {
                market: displayName,
                streak: String(requiredStreakLength),
                threshold: String(resolvedAutoThresholdBelow),
            }),
            status: 'arming',
        }));
    }, [
        autoEngine.activeContractId,
        autoEngine.running,
        autoInstantRecovery,
        autoMarketMode,
        autoMarketSymbol,
        effectiveAutoStream.currentStat,
        effectiveAutoStream.lastTickEpoch,
        effectiveAutoStream.snapshotAt,
        executeAutoTrade,
        resolvedAutoMarket?.displayName,
        resolvedAutoStreakLength,
        resolvedAutoThresholdBelow,
    ]);

    useEffect(() => {
        if (
            autoMarketMode !== 'scan' ||
            !autoEngine.running ||
            autoEngine.activeContractId ||
            autoPendingBuyRef.current
        ) {
            return;
        }

        if (!orderedScanMarkets.length) {
            setAutoEngine(previous => ({
                ...previous,
                entryStreak: 0,
                feedback: localize('Scanning accumulator markets for stats...'),
                status: 'arming',
            }));
            return;
        }

        let bestMarket: AccumulatorMarketSnapshot | null = null;
        let bestStreak = 0;
        const requiredStreakLength = autoRecoveryEntryRef.current && autoInstantRecovery ? 1 : resolvedAutoStreakLength;
        const recoveryMarket = autoRecoveryEntryRef.current ? autoRecoveryMarketRef.current : null;
        const marketsToEvaluate = recoveryMarket
            ? [
                  orderedScanMarkets.find(market => market.symbol === recoveryMarket.symbol) ||
                      rankedMarkets.find(market => market.symbol === recoveryMarket.symbol) ||
                      recoveryMarket,
              ]
            : orderedScanMarkets;

        for (const market of marketsToEvaluate) {
            const marketEngine = getAutoScanEngine(market, Math.max(requiredStreakLength, 8));
            const statsWindow = marketEngine.getDisplayStats(Math.max(requiredStreakLength, 8));
            const statsKey = `${market.symbol}:${statsWindow.join('|')}`;
            const streakStatus = marketEngine.getDisplayStreakStatus(requiredStreakLength, resolvedAutoThresholdBelow);
            const marketStreak = streakStatus.progress;
            autoScanStreaksRef.current[market.symbol] = marketStreak;

            if (
                !bestMarket ||
                marketStreak > bestStreak ||
                (marketStreak === bestStreak &&
                    (marketEngine.getCurrentRunLength() ?? Number.MAX_SAFE_INTEGER) <
                        (getAutoScanEngine(bestMarket, Math.max(requiredStreakLength, 6)).getCurrentRunLength() ??
                            Number.MAX_SAFE_INTEGER))
            ) {
                bestMarket = market;
                bestStreak = marketStreak;
            }

            if (
                streakStatus.satisfied &&
                autoScanProcessedKeysRef.current[market.symbol] !== statsKey
            ) {
                autoScanProcessedKeysRef.current[market.symbol] = statsKey;
                autoScanStreaksRef.current = {};
                autoRecoveryEntryRef.current = false;
                autoRecoveryMarketRef.current = null;
                setAutoEngine(previous => ({
                    ...previous,
                    entryStreak: 0,
                    feedback: localize(
                        '{{ market }} met the scan conditions. Sending the accumulator order...',
                        { market: market.displayName }
                    ),
                    status: 'buying',
                }));
                void executeAutoTrade(market);
                return;
            }
        }

        setAutoEngine(previous => ({
            ...previous,
            entryStreak: bestStreak,
            feedback: bestMarket
                ? localize(
                          'Checking multiple markets. Best streak {{ streak }}/{{ target }} on {{ market }} with stat {{ stat }} at or below {{ threshold }}.',
                      {
                          market: bestMarket.displayName,
                          stat: String(bestMarket.currentStat),
                          streak: String(bestStreak),
                          target: String(requiredStreakLength),
                          threshold: String(resolvedAutoThresholdBelow),
                      }
                  )
                : localize('Checking multiple markets for {{ streak }} fresh stats at or below {{ threshold }}.', {
                  streak: String(resolvedAutoStreakLength),
                  threshold: String(resolvedAutoThresholdBelow),
                  }),
            status: 'arming',
        }));
    }, [
        autoEngine.activeContractId,
        autoEngine.running,
        autoInstantRecovery,
        autoMarketMode,
        executeAutoTrade,
        getAutoScanEngine,
        orderedScanMarkets,
        rankedMarkets,
        resolvedAutoStreakLength,
        resolvedAutoThresholdBelow,
    ]);

    const handleStartAuto = async () => {
        const initialStake = resolvedAutoStake;
        const isScanMode = autoMarketMode === 'scan';
        const watchedMarketLabel = isScanMode
            ? localize('multiple markets')
            : resolvedAutoMarket?.displayName || '';

        if ((!isScanMode && !resolvedAutoMarket) || (isScanMode && !supportedMarkets.length)) {
            stopAutoMonitoring(localize('Choose an accumulator market before starting auto trading.'), 'error');
            return;
        }

        const api = await ensureAccumulatorTradingApi();

        if (!api) {
            stopAutoMonitoring(
                hasRecoverableProfitdockSession()
                    ? localize('ProfitDock is still reconnecting to your Deriv trading session. Please try again in a moment.')
                    : localize('Log in to a Deriv account before starting the auto trader.'),
                'error'
            );
            return;
        }

        autoSellRequestedRef.current = false;
        autoStopAfterTradeRef.current = false;
        autoEntryStreakRef.current = 0;
        autoRecoveryEntryRef.current = false;
        autoProcessedStateKeyRef.current = '';
        autoScanProcessedKeysRef.current = {};
        autoScanStreaksRef.current = {};
        autoActiveTradeMarketRef.current = null;
        autoRecoveryMarketRef.current = null;
        autoRunningConfigKeyRef.current = [
            autoMarketMode,
            currentAutoSymbol,
            resolvedAutoStreakLength,
            resolvedAutoThresholdBelow,
            autoInstantRecovery ? 'recovery-on' : 'recovery-off',
            growthRatePercent,
        ].join(':');
        autoNextStakeRef.current = initialStake;

        const requiredStreakLength = resolvedAutoStreakLength;
        let entryStreak = 0;

        // DON'T pre-populate the dedup keys – leave them empty so the first
        // evaluation in the single-market / scan effect can detect conditions
        // that are *already* met and fire a trade immediately.
        // autoProcessedStateKeyRef is already '' and autoScanProcessedKeysRef is already {} from the reset above.

        if (!isScanMode && resolvedAutoMarket) {
            const singleMarketEngine = createAccumulatorStatEngineView(
                effectiveAutoStream,
                [],
                Math.max(requiredStreakLength, 6)
            );
            entryStreak = singleMarketEngine.getDisplayStreakStatus(
                requiredStreakLength,
                resolvedAutoThresholdBelow
            ).progress;
            autoEntryStreakRef.current = entryStreak;
        }

        if (isScanMode && orderedScanMarkets.length) {
            let bestStreak = 0;

            orderedScanMarkets.forEach(market => {
                const marketEngine = getAutoScanEngine(market, Math.max(requiredStreakLength, 6));
                const marketStreak = marketEngine.getDisplayStreakStatus(
                    requiredStreakLength,
                    resolvedAutoThresholdBelow
                ).progress;
                bestStreak = Math.max(bestStreak, marketStreak);
            });

            entryStreak = bestStreak;
            autoEntryStreakRef.current = bestStreak;
        }

        setAutoEngine({
            activeContractId: undefined,
            activeProfit: 0,
            closedTrades: 0,
            entryStreak,
            feedback: localize('Watching {{ market }} for {{ streak }} fresh stats at or below {{ threshold }}.', {
                market: watchedMarketLabel,
                streak: String(resolvedAutoStreakLength),
                threshold: String(resolvedAutoThresholdBelow),
            }),
            lastResult: '',
            nextStake: initialStake,
            running: true,
            sessionPnl: 0,
            status: 'arming',
            tickPassed: 0,
        });
    };

    const handleStopAuto = () => {
        if (autoEngine.activeContractId) {
            autoStopAfterTradeRef.current = true;
            setAutoEngine(previous => ({
                ...previous,
                feedback: localize('Stopping after the current accumulator trade closes.'),
                running: false,
                status: 'stopping',
            }));
            return;
        }

        stopAutoMonitoring(localize('Auto trading stopped.'), 'idle');
    };

    useEffect(() => {
        const isAutoActive = Boolean(autoEngine.running || autoEngine.activeContractId);

        emitProfitdockTradeStatus({
            canStop: isAutoActive,
            feature: 'accumulators',
            label: isAutoActive ? localize('Accumulator auto trader running') : localize('Accumulator auto trader stopped'),
            running: isAutoActive,
        });
    }, [autoEngine.activeContractId, autoEngine.running]);

    useEffect(
        () =>
            subscribeProfitdockTradeStop(request => {
                if (request.feature && request.feature !== 'accumulators') return;

                handleStopAuto();
            }),
        [handleStopAuto]
    );

    useEffect(() => {
        if (
            !autoEngine.running ||
            autoEngine.activeContractId ||
            (autoMarketMode === 'single' && !resolvedAutoMarket) ||
            (autoMarketMode === 'scan' && !supportedMarkets.length)
        ) {
            return;
        }

        const runningConfigKey = [
            autoMarketMode,
            currentAutoSymbol,
            resolvedAutoStreakLength,
            resolvedAutoThresholdBelow,
            autoInstantRecovery ? 'recovery-on' : 'recovery-off',
            growthRatePercent,
        ].join(':');

        if (autoRunningConfigKeyRef.current === runningConfigKey) {
            return;
        }

        autoRunningConfigKeyRef.current = runningConfigKey;
        autoRecoveryEntryRef.current = false;
        autoRecoveryMarketRef.current = null;
        autoProcessedStateKeyRef.current = '';
        autoScanProcessedKeysRef.current = {};
        autoScanStreaksRef.current = {};

        const watchedMarketLabel =
            autoMarketMode === 'scan'
                ? localize('multiple markets')
                : resolvedAutoMarket?.displayName || localize('single market');
        const requiredStreakLength = resolvedAutoStreakLength;
        let entryStreak = 0;

        if (autoMarketMode === 'single' && resolvedAutoMarket) {
            const singleMarketEngine = createAccumulatorStatEngineView(
                effectiveAutoStream,
                [],
                Math.max(requiredStreakLength, 6)
            );
            entryStreak = singleMarketEngine.getDisplayStreakStatus(
                requiredStreakLength,
                resolvedAutoThresholdBelow
            ).progress;
        }

        if (autoMarketMode === 'scan') {
            let bestStreak = 0;

            orderedScanMarkets.forEach(market => {
                const marketEngine = getAutoScanEngine(market, Math.max(requiredStreakLength, 6));
                const marketStreak = marketEngine.getDisplayStreakStatus(
                    requiredStreakLength,
                    resolvedAutoThresholdBelow
                ).progress;
                bestStreak = Math.max(bestStreak, marketStreak);
            });

            entryStreak = bestStreak;
        }

        autoEntryStreakRef.current = entryStreak;

        setAutoEngine(previous => ({
            ...previous,
            entryStreak,
            feedback: localize('Watching {{ market }} for {{ streak }} fresh stats at or below {{ threshold }}.', {
                market: watchedMarketLabel,
                streak: String(resolvedAutoStreakLength),
                threshold: String(resolvedAutoThresholdBelow),
            }),
            status: 'arming',
        }));
    }, [
        autoEngine.activeContractId,
        autoEngine.running,
        autoInstantRecovery,
        autoMarketMode,
        currentAutoSymbol,
        growthRatePercent,
        resolvedAutoMarket?.displayName,
        resolvedAutoStreakLength,
        resolvedAutoThresholdBelow,
        supportedMarkets.length,
        getAutoScanEngine,
        orderedScanMarkets,
    ]);

    const activeManualDedicatedFeed =
        manualDedicatedFeed.symbol === currentManualSymbol
            ? manualDedicatedFeed
            : { ...EMPTY_DEDICATED_FEED, symbol: currentManualSymbol };
    const activeManualProposal =
        manualProposal.symbol === currentManualSymbol ? manualProposal : { ...EMPTY_MANUAL_PROPOSAL, symbol: currentManualSymbol };
    const useDedicatedManualSnapshot = !!activeManualDedicatedFeed.snapshotAt;
    const primaryManualFeed = useDedicatedManualSnapshot ? activeManualDedicatedFeed : activeManualProposal;
    const secondaryManualFeed = useDedicatedManualSnapshot ? activeManualProposal : activeManualDedicatedFeed;
    const manualStats = primaryManualFeed.recentStats.length ? primaryManualFeed.recentStats : secondaryManualFeed.recentStats;
    const manualCurrentStat =
        primaryManualFeed.currentStat ?? secondaryManualFeed.currentStat ?? manualStats[0] ?? null;
    const manualBarrierDistanceValue =
        primaryManualFeed.barrierDistance ?? secondaryManualFeed.barrierDistance;
    const manualHighBarrierValue = primaryManualFeed.highBarrier ?? secondaryManualFeed.highBarrier;
    const manualLowBarrierValue = primaryManualFeed.lowBarrier ?? secondaryManualFeed.lowBarrier;
    const manualBarrierPercentValue =
        primaryManualFeed.barrierPercent !== '--'
            ? primaryManualFeed.barrierPercent
            : secondaryManualFeed.barrierPercent;
    const manualMaxTicksValue = primaryManualFeed.maxTicks ?? secondaryManualFeed.maxTicks;
    const manualAskPriceValue = activeManualProposal.askPrice ?? activeManualDedicatedFeed.askPrice;
    const manualMaxPayoutValue = activeManualProposal.maxPayout ?? activeManualDedicatedFeed.maxPayout;
    const manualLongcodeValue = activeManualProposal.longcode || activeManualDedicatedFeed.longcode;
    const manualLiveQuote =
        manualChartTicks[manualChartTicks.length - 1]?.quote ?? primaryManualFeed.spot ?? secondaryManualFeed.spot;
    const isManualBarrierBreached =
        manualLiveQuote !== null &&
        manualHighBarrierValue !== null &&
        manualLowBarrierValue !== null &&
        (manualLiveQuote > manualHighBarrierValue || manualLiveQuote < manualLowBarrierValue);

    useEffect(() => {
        if (isManualBarrierBreached && !manualBarrierWasBreachedRef.current) {
            setManualBarrierFlash(true);

            if (manualBarrierFlashTimeoutRef.current) {
                window.clearTimeout(manualBarrierFlashTimeoutRef.current);
            }

            manualBarrierFlashTimeoutRef.current = window.setTimeout(() => {
                setManualBarrierFlash(false);
            }, 520);
        }

        if (!isManualBarrierBreached) {
            setManualBarrierFlash(false);
        }

        manualBarrierWasBreachedRef.current = isManualBarrierBreached;
    }, [isManualBarrierBreached]);

    const manualChartModel = useMemo(() => {
        const visibleTicks = manualChartTicks.slice(-MANUAL_CHART_VIEW);

        if (!visibleTicks.length) {
            return null;
        }

        const left = 18;
        const right = 982;
        const top = 18;
        const bottom = 286;
        const values = visibleTicks.map(tick => tick.quote);

        if (manualHighBarrierValue !== null) {
            values.push(manualHighBarrierValue);
        }

        if (manualLowBarrierValue !== null) {
            values.push(manualLowBarrierValue);
        }

        if (manualLiveQuote !== null) {
            values.push(manualLiveQuote);
        }

        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const rawRange = Math.max(maxValue - minValue, Number.EPSILON);
        const padding = Math.max(rawRange * 0.18, Math.pow(10, -manualPipSize));
        const domainMax = maxValue + padding;
        const domainRange = Math.max(domainMax - (minValue - padding), Number.EPSILON);
        const xSpan = right - left;
        const ySpan = bottom - top;
        const toX = (index: number) => left + (index / Math.max(visibleTicks.length - 1, 1)) * xSpan;
        const toY = (value: number) => top + ((domainMax - value) / domainRange) * ySpan;

        const points = visibleTicks.map((tick, index) => ({
            x: toX(index),
            y: toY(tick.quote),
            ...tick,
        }));
        const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
        const areaPath = `${linePath} L ${points[points.length - 1].x} ${bottom} L ${points[0].x} ${bottom} Z`;
        const highY = manualHighBarrierValue !== null ? toY(manualHighBarrierValue) : null;
        const lowY = manualLowBarrierValue !== null ? toY(manualLowBarrierValue) : null;
        const spotY = manualLiveQuote !== null ? toY(manualLiveQuote) : points[points.length - 1].y;
        const gridLines = Array.from({ length: 5 }, (_, index) => top + (index / 4) * ySpan);

        return {
            areaPath,
            bottom,
            gridLines,
            highY,
            left,
            linePath,
            lowY,
            points,
            right,
            spotY,
            top,
        };
    }, [manualChartTicks, manualHighBarrierValue, manualLiveQuote, manualLowBarrierValue, manualPipSize]);

    const manualBarrierDistance = formatSignedDistance(manualBarrierDistanceValue, manualPipSize);
    const manualUpperDistance =
        manualBarrierDistanceValue !== null
            ? formatSignedDistance(Math.abs(manualBarrierDistanceValue), manualPipSize)
            : '--';
    const manualLowerDistance =
        manualBarrierDistanceValue !== null
            ? formatSignedDistance(-Math.abs(manualBarrierDistanceValue), manualPipSize)
            : '--';
    const manualSpotDisplay =
        manualLiveQuote !== null
            ? formatQuote(manualLiveQuote, manualPipSize)
            : useDedicatedManualSnapshot && manualDedicatedFeed.priceDisplay !== '--'
              ? manualDedicatedFeed.priceDisplay
              : resolvedManualMarket?.priceDisplay ?? '--';
    const manualTradeState = resolvedManualMarket
        ? manualTrades[resolvedManualMarket.symbol] || {
              buyPrice: resolvedManualStake,
              feedback: manualLongcodeValue || localize('Manual accumulator setup is ready.'),
              isValidToSell: false,
              profit: 0,
              status: 'idle' as const,
              tickPassed: 0,
          }
        : null;
    const manualProfitTone =
        !manualTradeState || manualTradeState.profit === 0 ? 'neutral' : manualTradeState.profit > 0 ? 'good' : 'bad';
    const autoHasMarketSource = autoMarketMode === 'scan' ? supportedMarkets.length > 0 : Boolean(resolvedAutoMarket);
    const autoStreamIsLoading =
        autoMarketMode === 'scan' ? isLoadingRankings && rankedMarkets.length === 0 : effectiveAutoStream.isLoading;
    const autoStartDisabled = !autoHasMarketSource || !hasAccumulatorTradeSession() || autoStreamIsLoading;
    const autoRecentStats =
        autoMarketMode === 'scan' && visibleAutoMarket
            ? createAccumulatorStatEngineView(
                  visibleAutoMarket,
                  autoScanStatsHistory[visibleAutoMarket.symbol] || [],
                  8
              ).getDisplayStats(8)
            : createAccumulatorStatEngineView(visibleAutoStream, [], 8).getDisplayStats(8);
    const manualSellDisabled =
        !manualTradeState?.contractId ||
        manualTradeState.status === 'selling' ||
        manualTradeState.status === 'closed';
    const manualPositionRows = useMemo(
        () =>
            Object.entries(manualTrades)
                .filter(([, trade]) => trade.contractId && trade.status !== 'idle')
                .map(([symbol, trade]) => ({
                    ...trade,
                    marketLabel:
                        selectableMarkets.find(market => market.symbol === symbol)?.displayName ||
                        rankedMarkets.find(market => market.symbol === symbol)?.displayName ||
                        symbol,
                    symbol,
                })),
        [manualTrades, rankedMarkets, selectableMarkets]
    );

    return (
        <div className='accumulators-page'>
            <div className='accumulators-page__stack'>
                <section className='accumulators-page__mode-switch'>
                    <button
                        type='button'
                        className={`accumulators-page__mode-button ${activeTab === 'manual' ? 'accumulators-page__mode-button--active' : ''}`}
                        onClick={() => setActiveTab('manual')}
                    >
                        {localize('Manual')}
                    </button>
                    <button
                        type='button'
                        className={`accumulators-page__mode-button ${activeTab === 'auto' ? 'accumulators-page__mode-button--active' : ''}`}
                        onClick={() => setActiveTab('auto')}
                    >
                        {localize('Auto Trader')}
                    </button>
                </section>

                <section className='accumulators-page__toolbar'>
                    <div className='accumulators-page__growth-switch'>
                        {GROWTH_RATE_OPTIONS.map(option => (
                            <button
                                key={option}
                                type='button'
                                className={`accumulators-page__growth-chip ${growthRatePercent === option ? 'accumulators-page__growth-chip--active' : ''}`}
                                onClick={() => setGrowthRatePercent(option)}
                            >
                                {option}%
                            </button>
                        ))}
                    </div>
                </section>

                {activeTab === 'manual' ? (
                    <section className='accumulators-page__manual-panel'>
                        {isLoadingRankings && !resolvedManualMarket ? (
                            <div className='accumulators-page__notice'>{localize('Loading ranked manual accumulator markets...')}</div>
                        ) : resolvedManualMarket && manualTradeState ? (
                            <>
                            <div className='accumulators-page__manual-layout'>
                                <article className='accumulators-page__manual-chart-card'>
                                    <header className='accumulators-page__manual-chart-header'>
                                        <label className='accumulators-page__field'>
                                            <span>{localize('Manual market')}</span>
                                            <div className='accumulators-page__input-wrap accumulators-page__input-wrap--select'>
                                                <select
                                                    value={manualMarketSymbol}
                                                    onChange={event => setManualMarketSymbol(event.target.value)}
                                                >
                                                    {selectableMarkets.map(market => (
                                                        <option key={market.symbol} value={market.symbol}>
                                                            {market.displayName}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </label>
                                        <div className='accumulators-page__manual-price'>
                                            <span>{localize('Spot')}</span>
                                            <strong>{manualSpotDisplay}</strong>
                                            <small>{localize('Growth {{ growth }}%', { growth: String(growthRatePercent) })}</small>
                                        </div>
                                    </header>

                                    <div
                                        className={`accumulators-page__manual-chart-stage ${
                                            isManualBarrierBreached ? 'accumulators-page__manual-chart-stage--breached' : ''
                                        } ${manualBarrierFlash ? 'accumulators-page__manual-chart-stage--flash' : ''}`.trim()}
                                    >
                                        {manualChartModel ? (
                                            <svg viewBox='0 0 1000 304' preserveAspectRatio='none' aria-label='Manual accumulator chart'>
                                                {manualChartModel.gridLines.map((yValue, index) => (
                                                    <line
                                                        key={`grid-${index}`}
                                                        className='accumulators-page__chart-grid'
                                                        x1={manualChartModel.left}
                                                        y1={yValue}
                                                        x2={manualChartModel.right}
                                                        y2={yValue}
                                                    />
                                                ))}
                                                {manualChartModel.highY !== null && manualChartModel.lowY !== null && (
                                                    <rect
                                                        className='accumulators-page__chart-barrier-zone'
                                                        x={manualChartModel.left}
                                                        y={Math.min(manualChartModel.highY, manualChartModel.lowY)}
                                                        width={manualChartModel.right - manualChartModel.left}
                                                        height={Math.max(
                                                            2,
                                                            Math.abs(manualChartModel.highY - manualChartModel.lowY)
                                                        )}
                                                    />
                                                )}
                                                {manualChartModel.highY !== null && (
                                                    <line
                                                        className='accumulators-page__chart-barrier-line accumulators-page__chart-barrier-line--high'
                                                        x1={manualChartModel.left}
                                                        y1={manualChartModel.highY}
                                                        x2={manualChartModel.right}
                                                        y2={manualChartModel.highY}
                                                    />
                                                )}
                                                {manualChartModel.lowY !== null && (
                                                    <line
                                                        className='accumulators-page__chart-barrier-line accumulators-page__chart-barrier-line--low'
                                                        x1={manualChartModel.left}
                                                        y1={manualChartModel.lowY}
                                                        x2={manualChartModel.right}
                                                        y2={manualChartModel.lowY}
                                                    />
                                                )}
                                                <path className='accumulators-page__chart-area' d={manualChartModel.areaPath} />
                                                <path className='accumulators-page__chart-line' d={manualChartModel.linePath} />
                                                <line
                                                    className='accumulators-page__chart-spot-line'
                                                    x1={manualChartModel.left}
                                                    y1={manualChartModel.spotY}
                                                    x2={manualChartModel.right}
                                                    y2={manualChartModel.spotY}
                                                />
                                                <circle
                                                    className='accumulators-page__chart-spot-dot'
                                                    cx={manualChartModel.points[manualChartModel.points.length - 1].x}
                                                    cy={manualChartModel.points[manualChartModel.points.length - 1].y}
                                                    r={5}
                                                />
                                            </svg>
                                        ) : (
                                            <div className='accumulators-page__manual-chart-empty'>
                                                {isManualTickLoading
                                                    ? localize('Streaming manual chart ticks...')
                                                    : localize('Waiting for tick data.')}
                                            </div>
                                        )}
                                    </div>

                                    <div className='accumulators-page__manual-barriers'>
                                        <div>
                                            <span>{localize('Upper barrier')}</span>
                                            <strong>{formatQuote(manualHighBarrierValue, manualPipSize)}</strong>
                                            <small>{manualUpperDistance}</small>
                                        </div>
                                        <div>
                                            <span>{localize('Current spot')}</span>
                                            <strong>{manualSpotDisplay}</strong>
                                            <small>{manualBarrierDistance}</small>
                                        </div>
                                        <div>
                                            <span>{localize('Lower barrier')}</span>
                                            <strong>{formatQuote(manualLowBarrierValue, manualPipSize)}</strong>
                                            <small>{manualLowerDistance}</small>
                                        </div>
                                    </div>

                                    <div className='accumulators-page__manual-stats-ribbon'>
                                        <span className='accumulators-page__manual-stats-label'>{localize('Stats')}</span>
                                        {manualStats.slice(0, 10).map((stat, index) => (
                                            <span
                                                key={`${resolvedManualMarket.symbol}-manual-stat-${index}`}
                                                className={`accumulators-page__stat-pill ${index === 0 ? 'accumulators-page__stat-pill--current' : ''}`}
                                            >
                                                {stat}
                                            </span>
                                        ))}
                                    </div>
                                </article>

                                <aside className='accumulators-page__manual-order-card'>
                                    <div className='accumulators-page__form-grid'>
                                        <label className='accumulators-page__field'>
                                            <span>{localize('Stake')}</span>
                                            <div className='accumulators-page__input-wrap'>
                                                <input
                                                    value={resolvedManualConfig.stake}
                                                    onChange={event =>
                                                        handleManualConfigChange(
                                                            resolvedManualMarket.symbol,
                                                            'stake',
                                                            event.target.value
                                                        )
                                                    }
                                                    inputMode='decimal'
                                                />
                                                <span>{currency}</span>
                                            </div>
                                        </label>
                                        <label className='accumulators-page__field'>
                                            <span>{localize('Take profit')}</span>
                                            <div className='accumulators-page__input-wrap'>
                                                <input
                                                    value={resolvedManualConfig.takeProfit}
                                                    onChange={event =>
                                                        handleManualConfigChange(
                                                            resolvedManualMarket.symbol,
                                                            'takeProfit',
                                                            event.target.value
                                                        )
                                                    }
                                                    inputMode='decimal'
                                                />
                                                <span>{currency}</span>
                                            </div>
                                        </label>
                                    </div>

                                    <div className='accumulators-page__metrics'>
                                        <div>
                                            <span>{localize('Current stat')}</span>
                                            <strong>{manualCurrentStat ?? '--'}</strong>
                                        </div>
                                        <div>
                                            <span>{localize('Barrier %')}</span>
                                            <strong>{manualBarrierPercentValue}</strong>
                                        </div>
                                        <div>
                                            <span>{localize('Max ticks')}</span>
                                            <strong>{manualMaxTicksValue ?? '--'}</strong>
                                        </div>
                                        <div>
                                            <span>{localize('Ask price')}</span>
                                            <strong>{manualAskPriceValue !== null ? formatMoney(manualAskPriceValue, currency) : '--'}</strong>
                                        </div>
                                        <div>
                                            <span>{localize('Max payout')}</span>
                                            <strong>{manualMaxPayoutValue !== null ? formatMoney(manualMaxPayoutValue, currency) : '--'}</strong>
                                        </div>
                                        <div>
                                            <span>{localize('Profit')}</span>
                                            <strong className={`accumulators-page__metric-value accumulators-page__metric-value--${manualProfitTone}`}>
                                                {formatMoney(manualTradeState.profit, currency)}
                                            </strong>
                                        </div>
                                    </div>

                                    {manualTradeState.contractId && manualTradeState.status !== 'closed' ? (
                                        <div className='accumulators-page__active-position'>
                                            <div>
                                                <span>{localize('Contract')}</span>
                                                <strong>{manualTradeState.contractId}</strong>
                                            </div>
                                            <div>
                                                <span>{localize('Ticks')}</span>
                                                <strong>{manualTradeState.tickPassed || 0}</strong>
                                            </div>
                                            <div>
                                                <span>{localize('Stake')}</span>
                                                <strong>{formatMoney(manualTradeState.buyPrice, currency)}</strong>
                                            </div>
                                            <div>
                                                <span>{localize('Sell value')}</span>
                                                <strong>
                                                    {manualTradeState.bidPrice
                                                        ? formatMoney(Number(manualTradeState.bidPrice), currency)
                                                        : '--'}
                                                </strong>
                                            </div>
                                            <div>
                                                <span>{localize('P/L')}</span>
                                                <strong
                                                    className={`accumulators-page__metric-value accumulators-page__metric-value--${manualProfitTone}`}
                                                >
                                                    {formatMoney(manualTradeState.profit, currency)}
                                                </strong>
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className='accumulators-page__trade-actions'>
                                        <button
                                            type='button'
                                            className='accumulators-page__trade-button accumulators-page__trade-button--manual'
                                            onClick={() => void handleManualBuy(resolvedManualMarket)}
                                            disabled={manualTradeState.status === 'opening' || manualTradeState.status === 'live' || manualTradeState.status === 'selling'}
                                        >
                                            <span>
                                                {manualTradeState.status === 'opening'
                                                    ? localize('Buying...')
                                                    : localize('Buy')}
                                            </span>
                                        </button>
                                        <button
                                            type='button'
                                            className='accumulators-page__trade-button accumulators-page__trade-button--sell'
                                            onClick={() => void handleManualSell(resolvedManualMarket)}
                                            disabled={manualSellDisabled}
                                        >
                                            <span>
                                                {manualTradeState.status === 'selling'
                                                    ? localize('Selling...')
                                                    : localize('Sell')}
                                            </span>
                                        </button>
                                    </div>

                                    <div className='accumulators-page__card-note accumulators-page__card-note--manual-explainer'>
                                        {localize(
                                            'After the entry spot tick, your stake will grow continuously by {{ growth }}% for every tick that the spot price remains within the ± {{ barrier }} from the previous spot price.',
                                            {
                                                barrier: manualBarrierPercentValue,
                                                growth: String(growthRatePercent),
                                            }
                                        )}
                                    </div>

                                    <div className='accumulators-page__card-note'>
                                        {manualTradeState.feedback}
                                        {manualTradeState.tickPassed > 0 && manualTradeState.status === 'live'
                                            ? ` ${localize('Tick')} ${manualTradeState.tickPassed}.`
                                            : ''}
                                    </div>
                                </aside>
                            </div>
                            <div className='accumulators-page__positions-table'>
                                <div className='accumulators-page__positions-head'>
                                    <strong>{localize('Report')}</strong>
                                    <span>{localize('{{ count }} manual position(s)', { count: String(manualPositionRows.length) })}</span>
                                </div>
                                <div className='accumulators-page__positions-grid accumulators-page__positions-grid--header'>
                                    <span>{localize('Type / Market')}</span>
                                    <span>{localize('Ticks / Contract')}</span>
                                    <span>{localize('Buy price / P&L')}</span>
                                </div>
                                {manualPositionRows.length ? (
                                    manualPositionRows.map(position => (
                                        <div className='accumulators-page__positions-grid' key={`${position.symbol}-${position.contractId}`}>
                                            <span>
                                                <strong>{position.status === 'closed' ? localize('Closed') : localize('Accumulator')}</strong>
                                                <small>{position.marketLabel}</small>
                                            </span>
                                            <span>
                                                <strong>{position.tickPassed || 0}</strong>
                                                <small>{position.contractId}</small>
                                            </span>
                                            <span>
                                                <strong>{formatMoney(position.buyPrice, currency)}</strong>
                                                <small className={`accumulators-page__metric-value accumulators-page__metric-value--${
                                                    position.profit > 0 ? 'good' : position.profit < 0 ? 'bad' : 'neutral'
                                                }`}>
                                                    {formatMoney(position.profit, currency)}
                                                </small>
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className='accumulators-page__positions-empty'>{localize('No positions')}</div>
                                )}
                            </div>
                            </>
                        ) : (
                            <div className='accumulators-page__notice'>
                                {localize('No accumulator market is available right now.')}
                            </div>
                        )}
                    </section>
                ) : (
                    <section className='accumulators-page__auto-panel'>
                        <div className='accumulators-page__auto-header'>
                            <div>
                                <span>{localize('Auto Trader')}</span>
                            </div>
                        </div>

                        <div className='accumulators-page__auto-layout'>
                            <div className='accumulators-page__auto-main'>
                                <div className='accumulators-page__auto-grid'>
                                    <div className='accumulators-page__field accumulators-page__field--wide'>
                                        <span>{localize('Market mode')}</span>
                                        <div className='accumulators-page__mode-segment' role='group'>
                                            <button
                                                type='button'
                                                className={autoMarketMode === 'single' ? 'accumulators-page__mode-segment-button--active' : ''}
                                                onClick={() => setAutoMarketMode('single')}
                                            >
                                                {localize('Single market')}
                                            </button>
                                            <button
                                                type='button'
                                                className={autoMarketMode === 'scan' ? 'accumulators-page__mode-segment-button--active' : ''}
                                                onClick={() => setAutoMarketMode('scan')}
                                            >
                                                {localize('Multiple markets')}
                                            </button>
                                        </div>
                                    </div>
                                    <label className='accumulators-page__field'>
                                        <span>{localize('Auto market')}</span>
                                        <div className='accumulators-page__input-wrap accumulators-page__input-wrap--select'>
                                            <select
                                                value={autoMarketSymbol}
                                                onChange={event => setAutoMarketSymbol(event.target.value)}
                                                disabled={autoMarketMode === 'scan'}
                                            >
                                                {selectableMarkets.map(market => (
                                                    <option key={market.symbol} value={market.symbol}>
                                                        {market.displayName}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </label>
                                    <label className='accumulators-page__field'>
                                        <span>{localize('Stake')}</span>
                                        <div className='accumulators-page__input-wrap'>
                                            <input value={autoStake} onChange={event => setAutoStake(event.target.value)} inputMode='decimal' />
                                            <span>{currency}</span>
                                        </div>
                                    </label>
                                    <label className='accumulators-page__field'>
                                        <span>{localize('Martingale')}</span>
                                        <div className='accumulators-page__input-wrap'>
                                            <input
                                                value={autoMartingaleMultiplier}
                                                onChange={event => setAutoMartingaleMultiplier(event.target.value)}
                                                inputMode='decimal'
                                            />
                                            <span>x</span>
                                        </div>
                                    </label>
                                    <label className='accumulators-page__field'>
                                        <span>{localize('Stop loss')}</span>
                                        <div className='accumulators-page__input-wrap'>
                                            <input
                                                value={autoSessionStopLoss}
                                                onChange={event => setAutoSessionStopLoss(event.target.value)}
                                                inputMode='decimal'
                                            />
                                            <span>{currency}</span>
                                        </div>
                                    </label>
                                    <label className='accumulators-page__field'>
                                        <span>{localize('Streaks')}</span>
                                        <div className='accumulators-page__input-wrap'>
                                            <input
                                                value={autoStreakLength}
                                                onChange={event => setAutoStreakLength(event.target.value)}
                                                inputMode='numeric'
                                            />
                                            <span>{localize('count')}</span>
                                        </div>
                                    </label>
                                    <label className='accumulators-page__field'>
                                        <span>{localize('Ticks below')}</span>
                                        <div className='accumulators-page__input-wrap'>
                                            <input
                                                value={autoThresholdBelow}
                                                onChange={event => setAutoThresholdBelow(event.target.value)}
                                                inputMode='numeric'
                                            />
                                            <span>{localize('value')}</span>
                                        </div>
                                    </label>
                                    <div className='accumulators-page__field accumulators-page__field--wide'>
                                        <span>{localize('Instant Recovery')}</span>
                                        <div className='accumulators-page__mode-segment' role='group'>
                                            <button
                                                type='button'
                                                className={!autoInstantRecovery ? 'accumulators-page__mode-segment-button--active' : ''}
                                                onClick={() => {
                                                    autoRecoveryEntryRef.current = false;
                                                    setAutoInstantRecovery(false);
                                                }}
                                            >
                                                {localize('Off')}
                                            </button>
                                            <button
                                                type='button'
                                                className={autoInstantRecovery ? 'accumulators-page__mode-segment-button--active' : ''}
                                                onClick={() => setAutoInstantRecovery(true)}
                                            >
                                                {localize('On after loss')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className='accumulators-page__auto-aside'>
                                <button
                                    type='button'
                                    className='accumulators-page__trade-button accumulators-page__trade-button--auto'
                                    onClick={autoEngine.running || autoEngine.activeContractId ? handleStopAuto : handleStartAuto}
                                    disabled={autoStartDisabled && !autoEngine.running && !autoEngine.activeContractId}
                                >
                                    <span>
                                        {autoEngine.running || autoEngine.activeContractId
                                            ? localize('Stop Auto Trading')
                                            : localize('Start Auto Trading')}
                                    </span>
                                </button>
                                {autoEngine.feedback && (
                                    <div className='accumulators-page__engine-copy'>{autoEngine.feedback}</div>
                                )}
                                <div className='accumulators-page__engine-metrics'>
                                    <div>
                                        <span>{localize('Current stat')}</span>
                                        <strong>{visibleAutoStream.currentStat ?? '--'}</strong>
                                    </div>
                                    <div>
                                        <span>{localize('Entry streak')}</span>
                                        <strong>{autoEngine.entryStreak}/{resolvedAutoStreakLength}</strong>
                                    </div>
                                    <div>
                                        <span>{localize('Next stake')}</span>
                                        <strong>{formatMoney(autoEngine.nextStake, currency)}</strong>
                                    </div>
                                    <div>
                                        <span>{localize('Active tick')}</span>
                                        <strong>{autoEngine.tickPassed || '--'}</strong>
                                    </div>
                                    <div>
                                        <span>{localize('Profit')}</span>
                                        <strong
                                            className={`accumulators-page__metric-value accumulators-page__metric-value--${
                                                autoEngine.activeProfit > 0 ? 'good' : autoEngine.activeProfit < 0 ? 'bad' : 'neutral'
                                            }`}
                                        >
                                            {formatMoney(autoEngine.activeProfit, currency)}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>{localize('Market price')}</span>
                                        <strong>{visibleAutoStream.priceDisplay}</strong>
                                    </div>
                                </div>
                                {autoMarketMode === 'single' && (
                                    <div className='accumulators-page__tick-stream accumulators-page__auto-stat-panel'>
                                        <div className='accumulators-page__tick-stream-head accumulators-page__tick-stream-head--market-only'>
                                            <strong>{visibleAutoMarket?.displayName || localize('Single market')}</strong>
                                        </div>
                                        <div className='accumulators-page__auto-stats-strip'>
                                            {Array.from({ length: 8 }).map((_, index) => {
                                                const stat = autoRecentStats[index];
                                                return (
                                                    <span
                                                        key={`${visibleAutoMarket?.symbol || 'auto'}-auto-stat-${index}`}
                                                        className={index === 0 ? 'accumulators-page__auto-stat-number--current' : ''}
                                                    >
                                                        {typeof stat === 'number' ? stat : '--'}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {autoMarketMode === 'scan' && (
                                    <div className='accumulators-page__scan-table'>
                                        <div className='accumulators-page__scan-table-head'>
                                            <span>{localize('Market')}</span>
                                            <span>{localize('Stats')}</span>
                                            <span>{localize('Streak')}</span>
                                        </div>
                                        {autoScanRows.length ? (
                                            autoScanRows.map(row => (
                                                <div
                                                    className={`accumulators-page__scan-row ${
                                                        row.conditionMet ? 'accumulators-page__scan-row--ready' : ''
                                                    }`}
                                                    key={row.symbol}
                                                >
                                                    <strong className='accumulators-page__scan-market-name'>
                                                        {row.displayName}
                                                    </strong>
                                                    <div className='accumulators-page__scan-stats-strip'>
                                                        {Array.from({ length: 8 }).map((_, index) => {
                                                            const stat = row.stats[index];
                                                            const isQualifyingStat =
                                                                typeof stat === 'number' &&
                                                                stat <= resolvedAutoThresholdBelow &&
                                                                index < row.streak;
                                                            return (
                                                                <span
                                                                    key={`${row.symbol}-scan-stat-${index}`}
                                                                    className={[
                                                                        index === 0 ? 'accumulators-page__scan-stat--current' : '',
                                                                        isQualifyingStat
                                                                            ? 'accumulators-page__scan-stat--qualifying'
                                                                            : '',
                                                                    ]
                                                                        .filter(Boolean)
                                                                        .join(' ')}
                                                                >
                                                                    {typeof stat === 'number' ? stat : '--'}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                    <span className='accumulators-page__scan-streak'>
                                                        {row.streak}/{effectiveAutoRequiredStreak}
                                                    </span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className='accumulators-page__scan-row accumulators-page__scan-row--empty'>
                                                {localize('Waiting for accumulator market stats...')}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {autoEngine.lastResult && <div className='accumulators-page__result-note'>{autoEngine.lastResult}</div>}
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
});

export default AccumulatorsPage;

