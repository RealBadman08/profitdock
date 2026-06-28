import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { MarketIcon } from '@/components/market/market-icon';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import {
    getStoredProfitdockActiveCurrency,
    hasUsableProfitdockStoredSession,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { getMarketsWithoutStepBoomCrashRange, normalizeApiMessage } from '@/features/deriv-live/api';
import { MarketSymbol } from '@/features/deriv-live/types';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { normalizeMartingaleMultiplier, roundMartingaleStake } from '@/hooks/useMartingale';

import { emitProfitdockTradeStatus, subscribeProfitdockTradeStop } from '@/utils/profitdock-trade-controller';
import { ProposalOpenContract } from '@deriv/api-types';
import { localize } from '@deriv-com/translations';
import './corsa.scss';

type ApiLike = {
    connection?: { readyState?: number };
    onMessage: () => { subscribe: (callback: (message: unknown) => void) => { unsubscribe: () => void } };
    send: (payload: Record<string, unknown>) => Promise<Record<string, any>>;
};

type CorsaDirection =
    | 'DIGITEVEN'
    | 'DIGITODD'
    | 'DIGITOVER'
    | 'DIGITUNDER'
    | 'DIGITMATCH'
    | 'DIGITDIFF'
    | 'CALL'
    | 'PUT';
type MarketMode = 'single' | 'all';
type DetectorState = { history: number[]; lastQuote: number | null; priceHistory: number[]; streak: number };
type CorsaDisplayItem = { label: string; tone: 'empty' | 'negative' | 'positive' };
type CorsaPosition = {
    buyPrice: number;
    contractId: number;
    contractType: CorsaDirection;
    entrySpot?: string | number;
    exitSpot?: string | number;
    market: string;
    profit: number;
    stake: number;
    status: 'live' | 'closed' | 'error';
    symbol: string;
};
type ProposalResponse = {
    error?: { code?: string; message?: string };
    proposal?: { ask_price?: number; id?: string; longcode?: string; spot?: number };
};
type BuyResponse = {
    buy?: { buy_price?: number; contract_id?: number; longcode?: string; transaction_id?: number };
    error?: { code?: string; message?: string };
};
type TickResponse = {
    error?: { message?: string };
    msg_type?: string;
    subscription?: { id?: string };
    tick?: { epoch: number; quote: number; symbol: string };
};
type OpenContractResponse = {
    error?: { message?: string };
    msg_type?: string;
    proposal_open_contract?: ProposalOpenContract;
    subscription?: { id?: string };
};

const DIRECTIONS: Array<{ contractType: CorsaDirection; label: string; needsDigit?: boolean }> = [
    { contractType: 'DIGITEVEN', label: 'Even' },
    { contractType: 'DIGITODD', label: 'Odd' },
    { contractType: 'DIGITOVER', label: 'Over', needsDigit: true },
    { contractType: 'DIGITUNDER', label: 'Under', needsDigit: true },
    { contractType: 'DIGITMATCH', label: 'Matches', needsDigit: true },
    { contractType: 'DIGITDIFF', label: 'Differs', needsDigit: true },
    { contractType: 'CALL', label: 'Rise' },
    { contractType: 'PUT', label: 'Fall' },
];

const CORSA_EXCLUDED_MARKET_SYMBOLS = new Set(['1HZ15V', '1HZ30V', '1HZ90V']);


const getCorsaMarkets = (activeSymbols: MarketSymbol[]) =>
    getMarketsWithoutStepBoomCrashRange(activeSymbols).filter(market => !CORSA_EXCLUDED_MARKET_SYMBOLS.has(market.symbol));

const getDerivApi = () => api_base.api as ApiLike | undefined;
const getActiveTransactionAccountId = () => api_base.account_id || localStorage.getItem('active_loginid') || undefined;
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
const toPositiveInteger = (value: string | number, fallback = 1) => {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const clampDigit = (value: string | number, fallback = 0) => Math.max(0, Math.min(9, Math.trunc(Number(value) || fallback)));
const roundStake = (value: number) => Number(value.toFixed(2));
const formatMoney = (value: number, currency: string) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(2)} ${currency}`;
const formatStakeAmount = (value: number, currency: string) => `${Math.max(value, 0).toFixed(2)} ${currency}`;
const getLastDigit = (quote: number) => {
    const digits = String(quote).replace(/\D/g, '');
    return Number(digits.charAt(digits.length - 1)) || 0;
};

const isOppositeDigitSignal = (contractType: CorsaDirection, digit: number, prediction: number) => {
    switch (contractType) {
        case 'DIGITEVEN':
            return digit % 2 === 1;
        case 'DIGITODD':
            return digit % 2 === 0;
        case 'DIGITOVER':
            return digit < prediction;
        case 'DIGITUNDER':
            return digit > prediction;
        case 'DIGITMATCH':
            return digit !== prediction;
        case 'DIGITDIFF':
            return digit === prediction;
        default:
            return false;
    }
};

const isOppositePriceSignal = (contractType: CorsaDirection, current: number, previous: number) => {
    if (contractType === 'CALL') return current < previous;
    if (contractType === 'PUT') return current > previous;
    return false;
};

const isRecoverableAuthError = (error: unknown) => {
    const code = String((error as { code?: string })?.code || '').toLowerCase();
    const message = String((error as Error)?.message || '').toLowerCase();
    return (
        ['authorizationrequired', 'unauthorized', 'unauthorizedaccess', 'invalidtoken', 'accessdenied'].includes(code) ||
        message.includes('please log in') ||
        message.includes('authorize') ||
        message.includes('authorization') ||
        message.includes('invalid token') ||
        message.includes('session')
    );
};

const createProposalPayload = ({
    amount,
    contractType,
    currency,
    duration,
    prediction,
    symbol,
}: {
    amount: number;
    contractType: CorsaDirection;
    currency: string;
    duration: number;
    prediction: number;
    symbol: string;
}) => {
    const payload: Record<string, unknown> = {
        amount,
        basis: 'stake',
        contract_type: contractType,
        currency,
        duration,
        duration_unit: 't',
        proposal: 1,
        underlying_symbol: symbol,
    };
    if (['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(contractType)) {
        payload.barrier = String(prediction);
    }
    return payload;
};

const requestQuote = async (api: ApiLike, payload: Record<string, unknown>) => {
    const response = normalizeApiMessage<ProposalResponse>(await api.send(payload));
    if (response.error || !response.proposal?.id || typeof response.proposal.ask_price !== 'number') {
        throw new Error(
            [response.error?.code, response.error?.message || 'Unable to request a Corsa proposal.']
                .filter(Boolean)
                .join(': ')
        );
    }
    return {
        askPrice: response.proposal.ask_price,
        longcode: response.proposal.longcode,
        proposalId: response.proposal.id,
        spot: response.proposal.spot,
    };
};

const buyQuote = async (api: ApiLike, proposalId: string, price: number) => {
    const response = normalizeApiMessage<BuyResponse>(await api.send({ buy: proposalId, price }));
    if (response.error || !response.buy?.contract_id) {
        throw new Error(
            [response.error?.code, response.error?.message || 'Unable to buy the Corsa contract.']
                .filter(Boolean)
                .join(': ')
        );
    }
    return response.buy;
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
        if (data.msg_type !== 'proposal_open_contract') return;
        if (data.error) {
            onError(data.error.message || 'Unable to monitor the Corsa contract.');
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
        if (response.error) throw new Error(response.error.message || 'Unable to monitor the Corsa contract.');
        if (response.subscription?.id) subscriptionId = response.subscription.id;
        if (response.proposal_open_contract) onUpdate(response.proposal_open_contract);
    } catch (error) {
        messageSubscription.unsubscribe();
        onError(error instanceof Error ? error.message : 'Unable to monitor the Corsa contract.');
        return () => undefined;
    }
    return () => {
        messageSubscription.unsubscribe();
        if (subscriptionId) void api.send({ forget: subscriptionId }).catch(() => undefined);
    };
};

const getSignalDescription = (contractType: CorsaDirection, prediction: number) => {
    switch (contractType) {
        case 'DIGITEVEN':
            return 'odd digits';
        case 'DIGITODD':
            return 'even digits';
        case 'DIGITOVER':
            return `digits above ${prediction}`;
        case 'DIGITUNDER':
            return `digits below ${prediction}`;
        case 'DIGITMATCH':
            return `digits different from ${prediction}`;
        case 'DIGITDIFF':
            return `digits matching ${prediction}`;
        case 'CALL':
            return 'falling ticks';
        case 'PUT':
            return 'rising ticks';
        default:
            return 'matching ticks';
    }
};

const getCorsaSignalStreak = ({
    contractType,
    digitHistory,
    prediction,
    priceHistory,
}: {
    contractType: CorsaDirection;
    digitHistory: number[];
    prediction: number;
    priceHistory: number[];
}) => {
    if (contractType === 'CALL' || contractType === 'PUT') {
        let streak = 0;

        for (let index = 0; index < priceHistory.length - 1; index++) {
            const current = priceHistory[index];
            const previous = priceHistory[index + 1];
            const conditionMet = isOppositePriceSignal(contractType, current, previous);

            if (!conditionMet) break;
            streak += 1;
        }

        return streak;
    }

    let streak = 0;

    for (const digit of digitHistory) {
        const conditionMet = isOppositeDigitSignal(contractType, digit, prediction);

        if (!conditionMet) break;
        streak += 1;
    }

    return streak;
};

const getCorsaDisplayItem = ({
    contractType,
    digit,
    prediction,
    previousQuote,
    quote,
}: {
    contractType: CorsaDirection;
    digit: number;
    prediction: number;
    previousQuote: number | null;
    quote: number;
}): CorsaDisplayItem => {
    if (contractType === 'CALL' || contractType === 'PUT') {
        if (previousQuote === null || quote === previousQuote) {
            return { label: '--', tone: 'empty' };
        }

        return quote > previousQuote ? { label: 'R', tone: 'positive' } : { label: 'F', tone: 'negative' };
    }

    switch (contractType) {
        case 'DIGITOVER':
        case 'DIGITUNDER':
            return { label: String(digit), tone: digit > prediction ? 'positive' : 'negative' };
        case 'DIGITMATCH':
        case 'DIGITDIFF':
            return { label: String(digit), tone: digit === prediction ? 'positive' : 'negative' };
        case 'DIGITEVEN':
        case 'DIGITODD':
        default:
            return { label: String(digit), tone: digit % 2 === 0 ? 'negative' : 'positive' };
    }
};

const getDisplayItems = ({
    contractType,
    detector,
    prediction,
}: {
    contractType: CorsaDirection;
    detector?: DetectorState;
    prediction: number;
}) =>
    Array.from({ length: 9 }).map((_, index) => {
        const digit = detector?.history?.[index];

        if (typeof digit !== 'number') {
            return { label: '--', tone: 'empty' } as CorsaDisplayItem;
        }

        return getCorsaDisplayItem({
            contractType,
            digit,
            prediction,
            previousQuote: detector?.priceHistory?.[index + 1] ?? null,
            quote: detector?.priceHistory?.[index] ?? 0,
        });
    });

const CorsaPage = observer(() => {
    const { transactions } = useStore();
    const { authData, connectionStatus } = useApiBase();
    const currency = authData?.currency || getStoredProfitdockActiveCurrency() || 'USD';
    const [markets, setMarkets] = useState<MarketSymbol[]>(() => getCorsaMarkets([]));
    const [marketMode, setMarketMode] = useState<MarketMode>('single');
    const [selectedMarket, setSelectedMarket] = useState('1HZ10V');
    const [contractType, setContractType] = useState<CorsaDirection>('DIGITOVER');
    const [stake, setStake] = useState('0.35');
    const [martingale, setMartingale] = useState('2');
    const [signalStreak, setSignalStreak] = useState('3');
    const [prediction, setPrediction] = useState('5');
    const [durationTicks, setDurationTicks] = useState('1');
    const [takeProfit, setTakeProfit] = useState('');
    const [stopLoss, setStopLoss] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [feedback, setFeedback] = useState(localize('Ready.'));
    const [detectors, setDetectors] = useState<Record<string, DetectorState>>({});
    const [, setPositions] = useState<CorsaPosition[]>([]);
    const [stats, setStats] = useState({ lost: 0, runs: 0, totalPnl: 0, won: 0 });
    const cleanupContractsRef = useRef<Map<number, () => void>>(new Map());
    const contractMarketRef = useRef<Record<number, string>>({});
    const contractStakeRef = useRef<Record<number, number>>({});
    const isRunningRef = useRef(false);
    const activeByMarketRef = useRef<Record<string, boolean>>({});
    const baseStakeRef = useRef(0);
    const stakeByMarketRef = useRef<Record<string, number>>({});
    const sessionPnlRef = useRef(0);
    const processedSignalRef = useRef<Record<string, string>>({});
    const signalActiveRef = useRef<Record<string, boolean>>({});
    const martingaleRef = useRef(martingale);
    const placeTradeRef = useRef<((market: MarketSymbol) => void) | null>(null);
    const contractTypeRef = useRef<CorsaDirection>(contractType);
    const signalStreakRef = useRef(signalStreak);
    const predictionRef = useRef(prediction);
    const marketsRef = useRef(markets);
    const processedContractsRef = useRef<Set<number>>(new Set());

    const selectedMarketInfo = useMemo(
        () => markets.find(market => market.symbol === selectedMarket) || markets[0],
        [markets, selectedMarket]
    );
    const selectedDirection = useMemo(
        () => DIRECTIONS.find(direction => direction.contractType === contractType) || DIRECTIONS[0],
        [contractType]
    );
    const watchedMarkets = useMemo(
        () => (marketMode === 'all' ? markets : selectedMarketInfo ? [selectedMarketInfo] : []),
        [marketMode, markets, selectedMarketInfo]
    );
    const watchedMarketSymbols = useMemo(() => watchedMarkets.map(market => market.symbol), [watchedMarkets]);

    const ensureTradingApi = useCallback(async (forceReconnect = false) => {
        if (!forceReconnect && hasTradingSession()) return getDerivApi() || null;
        if (!isCustomLegacyOAuthDomain() || !hasUsableProfitdockStoredSession()) return null;
        try {
            await api_base.init(true);
            return hasTradingSession() ? getDerivApi() || null : null;
        } catch (error) {
            console.warn('[Corsa] Trading session recovery failed.', error);
            return null;
        }
    }, []);

    // Keep refs in sync so callbacks always use the latest values
    useEffect(() => { martingaleRef.current = martingale; }, [martingale]);
    useEffect(() => { contractTypeRef.current = contractType; }, [contractType]);
    useEffect(() => { signalStreakRef.current = signalStreak; }, [signalStreak]);
    useEffect(() => { predictionRef.current = prediction; }, [prediction]);
    useEffect(() => { marketsRef.current = markets; }, [markets]);

    useEffect(() => {
        let isCancelled = false;
        const loadMarkets = async () => {
            if (!api_base.active_symbols.length && api_base.active_symbols_promise) {
                await api_base.active_symbols_promise.catch(() => undefined);
            } else if (!api_base.active_symbols.length && connectionStatus === CONNECTION_STATUS.OPENED) {
                await api_base.getActiveSymbols().catch(() => undefined);
            }
            if (!isCancelled) {
                const orderedMarkets = getCorsaMarkets(api_base.active_symbols as MarketSymbol[]);
                setMarkets(orderedMarkets);
                setSelectedMarket(previous =>
                    orderedMarkets.some(market => market.symbol === previous)
                        ? previous
                        : orderedMarkets[0]?.symbol || previous
                );
            }
        };
        void loadMarkets();
        return () => {
            isCancelled = true;
        };
    }, [connectionStatus]);

    const pushContract = useCallback(
        (contract: ProposalOpenContract) => {
            transactions.pushTransaction({ ...contract, accountID: getActiveTransactionAccountId() } as ProposalOpenContract);
            const isSold = Boolean((contract as { is_sold?: number | boolean }).is_sold);
            const contractId = Number(contract.contract_id);
            
            setPositions(previous =>
                previous.map(position =>
                    position.contractId === contractId
                        ? {
                              ...position,
                              entrySpot: contract.entry_tick_display_value || contract.entry_tick || position.entrySpot,
                              exitSpot:
                                  contract.exit_tick_display_value ||
                                  contract.exit_tick ||
                                  (isSold
                                      ? (contract as { current_spot_display_value?: string | number; current_spot?: string | number })
                                            .current_spot_display_value ||
                                        (contract as { current_spot_display_value?: string | number; current_spot?: string | number })
                                            .current_spot
                                      : position.exitSpot),
                              profit: typeof contract.profit === 'number' ? contract.profit : position.profit,
                              status: isSold ? 'closed' : 'live',
                          }
                        : position
                )
            );
            
            if (!isSold || !contractId || processedContractsRef.current.has(contractId)) return;
            processedContractsRef.current.add(contractId);

            cleanupContractsRef.current.get(contractId)?.();
            cleanupContractsRef.current.delete(contractId);
            const market = contractMarketRef.current[contractId] || String(contract.underlying_symbol || contract.underlying || '');
            if (market) activeByMarketRef.current[market] = false;

            const realizedProfit = contract.profit != null ? Number(contract.profit) : 0;
            const currentMarketStake = contractStakeRef.current[contractId] || stakeByMarketRef.current[market] || baseStakeRef.current;
            const martingaleMultiplier = normalizeMartingaleMultiplier(martingaleRef.current, 1);
            // Direct arithmetic — single source of truth via refs, no store
            const nextStake = realizedProfit >= 0
                ? roundMartingaleStake(baseStakeRef.current)
                : roundMartingaleStake(currentMarketStake * martingaleMultiplier);

            console.info(
                '[MARTINGALE]',
                'corsa',
                market,
                'won=',
                realizedProfit >= 0,
                'stakeBefore=',
                currentMarketStake,
                'multiplier=',
                martingaleMultiplier,
                'stakeAfter=',
                nextStake
            );

            if (market) {
                stakeByMarketRef.current[market] = nextStake;
            }

            if (marketMode === 'single' && market === selectedMarket) {
                setStake(String(nextStake));
            }

            delete contractMarketRef.current[contractId];
            delete contractStakeRef.current[contractId];
            sessionPnlRef.current = roundStake(sessionPnlRef.current + realizedProfit);
            setStats(previous => ({
                lost: previous.lost + (realizedProfit < 0 ? 1 : 0),
                runs: previous.runs + 1,
                totalPnl: sessionPnlRef.current,
                won: previous.won + (realizedProfit >= 0 ? 1 : 0),
            }));

            const tp = toPositiveNumber(takeProfit, 0);
            const sl = toPositiveNumber(stopLoss, 0);
            if ((tp > 0 && sessionPnlRef.current >= tp) || (sl > 0 && sessionPnlRef.current <= -sl)) {
                isRunningRef.current = false;
                setIsRunning(false);
                setFeedback(tp > 0 && sessionPnlRef.current >= tp ? localize('Corsa take profit reached.') : localize('Corsa stop loss reached.'));
            }
        },
        [marketMode, selectedMarket, stopLoss, takeProfit, transactions]
    );

    const placeTrade = useCallback(
        async (market: MarketSymbol) => {
            if (!market?.symbol || activeByMarketRef.current[market.symbol]) return;
            const api = await ensureTradingApi();
            if (!api) {
                setFeedback(localize('Log in to a Deriv account before running Corsa.'));
                isRunningRef.current = false;
                setIsRunning(false);
                return;
            }
            // Read stake from ref — single source of truth, updated by pushContract
            if (!stakeByMarketRef.current[market.symbol]) {
                stakeByMarketRef.current[market.symbol] = roundMartingaleStake(baseStakeRef.current);
            }
            const amount = stakeByMarketRef.current[market.symbol] || baseStakeRef.current;

            console.info(
                '[CORSA_TRADE]',
                'market=', market.symbol,
                'amount=', amount,
                'baseStake=', baseStakeRef.current,
                'stakeByMarketRef=', stakeByMarketRef.current[market.symbol]
            );

            if (amount <= 0) {
                setFeedback(localize('Enter a stake before running Corsa.'));
                isRunningRef.current = false;
                setIsRunning(false);
                return;
            }

            activeByMarketRef.current[market.symbol] = true;
            try {
                const executeBuy = async (tradeApi: ApiLike) => {
                    const quote = await requestQuote(
                        tradeApi,
                        createProposalPayload({
                            amount,
                            contractType,
                            currency,
                            duration: toPositiveInteger(durationTicks, 1),
                            prediction: clampDigit(prediction, 0),
                            symbol: market.symbol,
                        })
                    );
                    return { buy: await buyQuote(tradeApi, quote.proposalId, quote.askPrice), quote };
                };
                let tradeApi = api;
                let trade;
                try {
                    trade = await executeBuy(tradeApi);
                } catch (error) {
                    if (!isRecoverableAuthError(error)) throw error;
                    const refreshedApi = await ensureTradingApi(true);
                    if (!refreshedApi) throw error;
                    tradeApi = refreshedApi;
                    trade = await executeBuy(tradeApi);
                }

                const contractId = trade.buy.contract_id as number;
                contractMarketRef.current[contractId] = market.symbol;
                contractStakeRef.current[contractId] = amount;
                const position: CorsaPosition = {
                    buyPrice: trade.buy.buy_price || amount,
                    contractId,
                    contractType,
                    entrySpot: trade.quote.spot,
                    market: market.symbol,
                    profit: 0,
                    stake: amount,
                    status: 'live',
                    symbol: market.symbol,
                };
                setPositions(previous => [position, ...previous].slice(0, 12));
                transactions.pushTransaction({
                    accountID: getActiveTransactionAccountId(),
                    buy_price: position.buyPrice,
                    contract_id: contractId,
                    contract_type: contractType,
                    currency,
                    date_start: Math.floor(Date.now() / 1000),
                    display_name: market.display_name,
                    entry_tick: position.entrySpot,
                    is_completed: false,
                    longcode: trade.buy.longcode || trade.quote.longcode,
                    profit: 0,
                    transaction_ids: { buy: trade.buy.transaction_id || trade.buy.contract_id },
                    underlying: market.symbol,
                    underlying_symbol: market.symbol,
                } as ProposalOpenContract);

                const cleanup = await subscribeToContract(tradeApi, contractId, pushContract, message => {
                    setFeedback(message);
                    setPositions(previous =>
                        previous.map(item => (item.contractId === contractId ? { ...item, status: 'error' } : item))
                    );
                    activeByMarketRef.current[market.symbol] = false;
                });
                cleanupContractsRef.current.set(contractId, cleanup);
                setFeedback(localize('Corsa contract opened on {{ market }}.', { market: market.display_name || market.symbol }));
            } catch (error) {
                activeByMarketRef.current[market.symbol] = false;
                setFeedback(error instanceof Error ? error.message : 'Corsa could not place the trade.');
            }
        },
        [contractType, currency, durationTicks, ensureTradingApi, prediction, pushContract, transactions]
    );

    useEffect(() => { placeTradeRef.current = placeTrade; });

    useEffect(() => {
        if (!watchedMarketSymbols.length) return;

        let cancelled = false;
        let api: ApiLike | null = null;
        const subscriptionIds: string[] = [];
        let messageSubscription: { unsubscribe: () => void } | null = null;
        let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let retryCount = 0;
        const MAX_RETRIES = 5;
        const RETRY_DELAY_MS = 2000;

        const startSubscriptions = async () => {
            const recoveredApi = await ensureTradingApi();
            if (cancelled) return;
            if (!recoveredApi || !hasTradingSession()) {
                if (isRunningRef.current) {
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        console.info('[CORSA_TICKS] API not ready, retrying in', RETRY_DELAY_MS, 'ms (attempt', retryCount, ')');
                        retryTimeoutId = setTimeout(() => { if (!cancelled) void startSubscriptions(); }, RETRY_DELAY_MS);
                        return;
                    }
                    setFeedback(localize('Log in to a Deriv account before running Corsa.'));
                    setIsRunning(false);
                    isRunningRef.current = false;
                }
                return;
            }

            retryCount = 0; // Reset on success
            api = recoveredApi;
            messageSubscription = recoveredApi.onMessage().subscribe(message => {
                const data = normalizeApiMessage<TickResponse>(message);
                if (data.msg_type !== 'tick' || !data.tick || !watchedMarketSymbols.includes(data.tick.symbol)) return;

                const tick = data.tick;
                const market = marketsRef.current.find(item => item.symbol === tick.symbol);
                const digit = getLastDigit(tick.quote);
                const liveContractType = contractTypeRef.current;
                const targetStreak = toPositiveInteger(signalStreakRef.current, 1);
                const targetDigit = clampDigit(predictionRef.current, 0);
                let signalKey = '';
                let shouldTrade = false;

                setDetectors(previous => {
                    const current = previous[tick.symbol] || { history: [], lastQuote: null, priceHistory: [], streak: 0 };
                    const nextHistory = [digit, ...current.history].slice(0, 50);
                    const nextPriceHistory = [tick.quote, ...current.priceHistory].slice(0, 50);
                    const nextStreak = getCorsaSignalStreak({
                        contractType: liveContractType,
                        digitHistory: nextHistory,
                        prediction: targetDigit,
                        priceHistory: nextPriceHistory,
                    });
                    const signalWindow =
                        liveContractType === 'CALL' || liveContractType === 'PUT'
                            ? nextPriceHistory.slice(0, targetStreak + 1).join('|')
                            : nextHistory.slice(0, targetStreak).join('|');
                    signalKey = `${tick.symbol}:${liveContractType}:${targetDigit}:${targetStreak}:${signalWindow}`;
                    shouldTrade =
                        nextStreak >= targetStreak &&
                        !signalActiveRef.current[tick.symbol] &&
                        !activeByMarketRef.current[tick.symbol] &&
                        processedSignalRef.current[tick.symbol] !== signalKey;
                    if (nextStreak < targetStreak) {
                        signalActiveRef.current[tick.symbol] = false;
                        delete processedSignalRef.current[tick.symbol];
                    }
                    return {
                        ...previous,
                        [tick.symbol]: {
                            history: nextHistory,
                            lastQuote: tick.quote,
                            priceHistory: nextPriceHistory,
                            streak: nextStreak,
                        },
                    };
                });

                if (shouldTrade && market && isRunningRef.current) {
                    signalActiveRef.current[tick.symbol] = true;
                    processedSignalRef.current[tick.symbol] = signalKey;
                    void placeTradeRef.current?.(market);
                }
            });

            watchedMarketSymbols.forEach(symbol => {
                void recoveredApi
                    .send({ subscribe: 1, ticks: symbol })
                    .then(response => {
                        if (cancelled) return;
                        const tickResponse = normalizeApiMessage<TickResponse>(response);
                        if (tickResponse.subscription?.id) subscriptionIds.push(tickResponse.subscription.id);
                        if (tickResponse.error) {
                            console.warn('[CORSA_TICKS] Subscription error for', symbol, tickResponse.error.message);
                        }
                    })
                    .catch(error => {
                        if (!cancelled) {
                            console.warn('[CORSA_TICKS] Subscription catch for', symbol, error);
                        }
                    });
            });
        };

        void startSubscriptions();

        return () => {
            cancelled = true;
            if (retryTimeoutId) clearTimeout(retryTimeoutId);
            messageSubscription?.unsubscribe();
            if (api) subscriptionIds.forEach(id => void api?.send({ forget: id }).catch(() => undefined));
        };
    }, [ensureTradingApi, watchedMarketSymbols]);

    const handleRun = () => {
        if (isRunning) {
            isRunningRef.current = false;
            setIsRunning(false);
            setFeedback(localize('Stopped. Open contracts will continue to settle.'));
            return;
        }
        const baseStake = toPositiveNumber(stake, 0);
        if (baseStake <= 0) {
            setFeedback(localize('Enter a stake before running Corsa.'));
            return;
        }
        baseStakeRef.current = baseStake;
        stakeByMarketRef.current = Object.fromEntries(watchedMarketSymbols.map(symbol => [symbol, baseStake]));
        activeByMarketRef.current = {};
        contractMarketRef.current = {};
        contractStakeRef.current = {};
        processedSignalRef.current = {};
        signalActiveRef.current = {};
        sessionPnlRef.current = 0;
        isRunningRef.current = true;
        processedContractsRef.current = new Set();
        setPositions([]);
        setStats({ lost: 0, runs: 0, totalPnl: 0, won: 0 });
        setIsRunning(true);
        setFeedback('');
    };

    useEffect(() => {
        emitProfitdockTradeStatus({
            canStop: isRunning,
            feature: 'corsa',
            label: isRunning ? localize('Corsa running') : localize('Corsa ready'),
            running: isRunning,
        });
    }, [isRunning]);

    useEffect(
        () =>
            subscribeProfitdockTradeStop(request => {
                if (request.feature && request.feature !== 'corsa') return;

                isRunningRef.current = false;
                setIsRunning(false);
                setFeedback(localize('Stopped. Open contracts will continue to settle.'));
            }),
        []
    );

    const visibleDetectors = watchedMarketSymbols.map(symbol => ({
        detector: detectors[symbol],
        market: markets.find(item => item.symbol === symbol),
        symbol,
    }));

    return (
        <div className='corsa-page'>
            <section className='corsa-page__controls'>
                <div className='corsa-page__mode' role='group'>
                    <button type='button' className={marketMode === 'single' ? 'corsa-page__mode-button--active' : ''} onClick={() => setMarketMode('single')}>
                        {localize('Single Market')}
                    </button>
                    <button type='button' className={marketMode === 'all' ? 'corsa-page__mode-button--active' : ''} onClick={() => setMarketMode('all')}>
                        {localize('Multiple Markets')}
                    </button>
                </div>
                <label className='corsa-page__field corsa-page__field--wide'>
                    <span>{localize('Market')}</span>
                    <div className='corsa-page__select-wrap'>
                        <MarketIcon type={selectedMarketInfo?.symbol || selectedMarket} size='sm' />
                        <select value={selectedMarket} onChange={event => setSelectedMarket(event.target.value)} disabled={marketMode === 'all'}>
                            {markets.map(market => (
                                <option key={market.symbol} value={market.symbol}>
                                    {market.display_name}
                                </option>
                            ))}
                        </select>
                    </div>
                </label>
                <label className='corsa-page__field'>
                    <span>{localize('Contract')}</span>
                    <select value={contractType} onChange={event => setContractType(event.target.value as CorsaDirection)}>
                        {DIRECTIONS.map(direction => (
                            <option key={direction.contractType} value={direction.contractType}>
                                {direction.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className='corsa-page__field'>
                    <span>{localize('Stake')}</span>
                    <input value={stake} onChange={event => setStake(event.target.value)} inputMode='decimal' placeholder='0.35' />
                </label>
                <label className='corsa-page__field'>
                    <span>{localize('Martingale x')}</span>
                    <input value={martingale} onChange={event => setMartingale(event.target.value)} inputMode='decimal' />
                </label>
                <label className='corsa-page__field'>
                    <span>{localize('Signal streak')}</span>
                    <input value={signalStreak} onChange={event => setSignalStreak(event.target.value)} inputMode='numeric' />
                </label>
                <label className='corsa-page__field'>
                    <span>{selectedDirection.needsDigit ? localize('Digit') : localize('Digit reference')}</span>
                    <input value={prediction} onChange={event => setPrediction(event.target.value)} inputMode='numeric' disabled={!selectedDirection.needsDigit} />
                </label>
                <label className='corsa-page__field'>
                    <span>{localize('Ticks')}</span>
                    <input value={durationTicks} onChange={event => setDurationTicks(event.target.value)} inputMode='numeric' />
                </label>
                <label className='corsa-page__field'>
                    <span>{localize('Take profit')}</span>
                    <input value={takeProfit} onChange={event => setTakeProfit(event.target.value)} inputMode='decimal' />
                </label>
                <label className='corsa-page__field'>
                    <span>{localize('Stop loss')}</span>
                    <input value={stopLoss} onChange={event => setStopLoss(event.target.value)} inputMode='decimal' />
                </label>
                <button
                    type='button'
                    className={`corsa-page__run ${isRunning ? 'corsa-page__run--stop' : ''}`}
                    onClick={handleRun}
                >
                    <span className={isRunning ? 'corsa-page__stop' : 'corsa-page__play'} />
                    {isRunning ? localize('Stop') : localize('Run')}
                </button>
            </section>

            <section className='corsa-page__watch-card'>
                {feedback && <p className='corsa-page__feedback'>{feedback}</p>}
                <div className='corsa-page__market-list'>
                    {visibleDetectors.map(({ detector, market, symbol }) => (
                        <div className='corsa-page__market-row' key={symbol}>
                            <strong className='corsa-page__market-name'>{market?.display_name || symbol}</strong>
                            <span className='corsa-page__digit-row'>
                                {getDisplayItems({
                                    contractType,
                                    detector,
                                    prediction: clampDigit(prediction, 0),
                                }).map((item, index) => {
                                    return (
                                        <b
                                            className={`corsa-page__digit corsa-page__digit--${item.tone} ${
                                                index === 0 ? 'corsa-page__digit--current' : ''
                                            }`}
                                            key={`${symbol}-${item.label}-${index}`}
                                        >
                                            {item.label}
                                        </b>
                                    );
                                })}
                            </span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
});

export default CorsaPage;

