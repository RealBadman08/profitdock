import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { MarketIcon } from '@/components/market/market-icon';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { TradeTypeIcon } from '@/components/trade-type/trade-type-icon';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import {
    getStoredProfitdockActiveCurrency,
    hasUsableProfitdockStoredSession,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { getMarketsWithoutStepBoomCrashRange, normalizeApiMessage } from '@/features/deriv-live/api';
import { MarketSymbol } from '@/features/deriv-live/types';
import { useApiBase } from '@/hooks/useApiBase';
import { normalizeMartingaleMultiplier, roundMartingaleStake } from '@/hooks/useMartingale';
import { useProfitdockPersistentState } from '@/hooks/useProfitdockPersistentState';
import { useStore } from '@/hooks/useStore';
import {
    emitProfitdockTradeStatus,
    subscribeProfitdockTradeStart,
    subscribeProfitdockTradeStop,
} from '@/utils/profitdock-trade-controller';
import { virtualEngine } from '@/utils/virtual-engine';
import { ProposalOpenContract } from '@deriv/api-types';
import { localize } from '@deriv-com/translations';
// copy-trading-execution used via appId.js interceptor (mirrorCopyTradingBuyFromRequest)
import './flipper-switcher.scss';

type ApiLike = {
    connection?: {
        readyState?: number;
    };
    onMessage: () => { subscribe: (callback: (message: unknown) => void) => { unsubscribe: () => void } };
    send: (payload: Record<string, unknown>) => Promise<Record<string, any>>;
};

type StrategyLeg = {
    contractType: string;
    label: string;
    predictionMode?: 'barrier' | 'selected_tick' | 'none';
};

type StrategyPair = {
    key: string;
    label: string;
    legs: [StrategyLeg, StrategyLeg];
};

type SelectedStrategyLegs = [StrategyLeg | null, StrategyLeg | null];

type ProposalResponse = {
    error?: {
        code?: string;
        message?: string;
    };
    proposal?: {
        ask_price?: number;
        id?: string;
        longcode?: string;
        spot?: number;
        payout?: number;
    };
};

type BuyResponse = {
    buy?: {
        buy_price?: number;
        contract_id?: number;
        longcode?: string;
        transaction_id?: number;
    };
    error?: {
        code?: string;
        message?: string;
    };
};

type OpenContractResponse = {
    msg_type?: string;
    proposal_open_contract?: ProposalOpenContract;
    subscription?: {
        id?: string;
    };
    error?: {
        message?: string;
    };
};

type FlipperQuote = {
    askPrice: number;
    contractParameters: Record<string, unknown>;
    longcode?: string;
    payout?: number;
    proposalId: string;
    spot?: number;
};

type FlipperPosition = {
    buyPrice: number;
    contractId: number;
    contractType: string;
    entrySpot?: string | number;
    exitSpot?: string | number;
    label: string;
    legIndex: 0 | 1;
    market: string;
    profit: number;
    runId: number;
    stake: number;
    status: 'live' | 'closed' | 'error';
};

const STRATEGY_PAIRS: StrategyPair[] = [
    {
        key: 'even_odd',
        label: 'Even / Odd',
        legs: [
            { contractType: 'DIGITEVEN', label: 'Even' },
            { contractType: 'DIGITODD', label: 'Odd' },
        ],
    },
    {
        key: 'matches_differs',
        label: 'Matches / Differs',
        legs: [
            { contractType: 'DIGITMATCH', label: 'Matches', predictionMode: 'barrier' },
            { contractType: 'DIGITDIFF', label: 'Differs', predictionMode: 'barrier' },
        ],
    },
    {
        key: 'over_under',
        label: 'Over / Under',
        legs: [
            { contractType: 'DIGITOVER', label: 'Over', predictionMode: 'barrier' },
            { contractType: 'DIGITUNDER', label: 'Under', predictionMode: 'barrier' },
        ],
    },
    {
        key: 'rise_fall',
        label: 'Rise / Fall',
        legs: [
            { contractType: 'CALL', label: 'Rise' },
            { contractType: 'PUT', label: 'Fall' },
        ],
    },
    {
        key: 'rise_fall_equals',
        label: 'Rise = / Fall =',
        legs: [
            { contractType: 'CALLE', label: 'Rise =' },
            { contractType: 'PUTE', label: 'Fall =' },
        ],
    },
    {
        key: 'higher_lower',
        label: 'Higher / Lower',
        legs: [
            { contractType: 'HIGHER', label: 'Higher', predictionMode: 'barrier' },
            { contractType: 'LOWER', label: 'Lower', predictionMode: 'barrier' },
        ],
    },
    {
        key: 'touch_no_touch',
        label: 'Touch / No Touch',
        legs: [
            { contractType: 'ONETOUCH', label: 'Touch', predictionMode: 'barrier' },
            { contractType: 'NOTOUCH', label: 'No Touch', predictionMode: 'barrier' },
        ],
    },
    {
        key: 'only_up_down',
        label: 'Only Ups / Only Downs',
        legs: [
            { contractType: 'RUNHIGH', label: 'Only Ups' },
            { contractType: 'RUNLOW', label: 'Only Downs' },
        ],
    },
    {
        key: 'ends_outside_stays_between',
        label: 'Ends Outside / Stays Between',
        legs: [
            { contractType: 'EXPIRYMISS', label: 'Ends Outside', predictionMode: 'barrier' },
            { contractType: 'RANGE', label: 'Stays Between', predictionMode: 'barrier' },
        ],
    },
];

const BUTTONS = STRATEGY_PAIRS.flatMap(pair => pair.legs);

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
const getDerivErrorMessage = (error: { code?: string; message?: string } | undefined, fallbackMessage: string) => {
    if (!error) {
        return fallbackMessage;
    }

    return [error.code, error.message || fallbackMessage].filter(Boolean).join(': ');
};

const hasTradingSession = () =>
    Boolean(
        isDerivSocketOpen() &&
        isSelectedProfitdockAccountSocket() &&
        (isCustomLegacyOAuthDomain() ? api_base.has_authenticated_profitdock_socket : api_base.is_authorized)
    );

const toPositiveNumber = (value: string | number, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toPositiveInteger = (value: string | number, fallback = 1) => {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DIGIT_ENTRY_CONTRACT_TYPES = new Set([
    'DIGITEVEN',
    'DIGITODD',
    'DIGITMATCH',
    'DIGITDIFF',
    'DIGITOVER',
    'DIGITUNDER',
]);
const isDigitEntryContract = (leg: StrategyLeg | null | undefined) =>
    Boolean(leg && DIGIT_ENTRY_CONTRACT_TYPES.has(leg.contractType));

const roundStakeValue = (value: number) => Number(value.toFixed(2)).toString();

const getLastDigit = (quote: number, pipSize = 2) => {
    const formattedQuote = Number(quote).toFixed(Math.max(0, Math.trunc(pipSize)));
    const digits = formattedQuote.replace(/\D/g, '');
    return Number(digits.charAt(digits.length - 1)) || 0;
};

const formatMoney = (value: number, currency: string) =>
    `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(2)} ${currency}`;

const toggleMarketSymbol = (symbols: string[], symbol: string) =>
    symbols.includes(symbol) ? symbols.filter(item => item !== symbol) : [...symbols, symbol];

const CONTRACT_TICK_LIMITS: Record<string, { min: number; max?: number }> = {
    RUNHIGH: { min: 2, max: 5 },
    RUNLOW: { min: 2, max: 5 },
    ONETOUCH: { min: 5 },
    NOTOUCH: { min: 5 },
    HIGHER: { min: 1 },
    LOWER: { min: 1 },
    CALL: { min: 1 },
    PUT: { min: 1 },
    DIGITEVEN: { min: 1 },
    DIGITODD: { min: 1 },
    DIGITMATCH: { min: 1 },
    DIGITDIFF: { min: 1 },
    DIGITOVER: { min: 1 },
    DIGITUNDER: { min: 1 },
    EXPIRYMISS: { min: 2 }, // minutes
    RANGE: { min: 2 }, // minutes
    EXPIRYRANGE: { min: 2 },
    UPORDOWN: { min: 2 },
};

const validateDuration = (contractType: string, duration: number) => {
    const finalDuration = Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : 1;
    const limits = CONTRACT_TICK_LIMITS[contractType] ?? { min: 1 };
    const minVal = limits.min;
    const isMinutes = ['EXPIRYMISS', 'EXPIRYRANGE', 'RANGE', 'UPORDOWN'].includes(contractType);
    const unitLabel = isMinutes ? 'minutes' : 'ticks';

    if (finalDuration < minVal) {
        throw new Error(`${contractType} requires at least ${minVal} ${unitLabel}.`);
    }

    if (limits.max && finalDuration > limits.max) {
        throw new Error(`${contractType} requires ${minVal} to ${limits.max} ${unitLabel}.`);
    }

    return { finalDuration, finalDurationUnit: isMinutes ? 'm' : 't' };
};

const createProposalPayload = ({
    amount,
    contractType,
    currency,
    duration,
    prediction,
    predictionMode,
    symbol,
}: {
    amount: number;
    contractType: string;
    currency: string;
    duration: number;
    prediction: number | string;
    predictionMode?: 'barrier' | 'selected_tick' | 'none';
    symbol: string;
}) => {
    const { finalDuration, finalDurationUnit } = validateDuration(contractType, duration);

    const payload: Record<string, unknown> = {
        amount,
        basis: 'stake',
        contract_type: contractType,
        currency,
        duration: finalDuration,
        duration_unit: finalDurationUnit,
        proposal: 1,
    };

    payload[isCustomLegacyOAuthDomain() ? 'underlying_symbol' : 'symbol'] = symbol;

    if (predictionMode === 'barrier') {
        const isDigitContract = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(contractType);
        const isTwoBarrierContract = ['EXPIRYMISS', 'EXPIRYRANGE', 'RANGE', 'UPORDOWN'].includes(contractType);

        if (isDigitContract) {
            // DIGIT contracts require barrier as a plain integer 0–9
            payload.barrier = Math.max(0, Math.min(9, Math.trunc(Number(prediction))));
        } else if (isTwoBarrierContract) {
            const val = String(prediction).trim();
            const num = Number(val);
            if (!isNaN(num) && num > 0) {
                payload.barrier = `+${num}`;
                payload.barrier2 = `-${num}`;
            } else {
                payload.barrier = val;
                payload.barrier2 = `-${val.replace(/[+-]/g, '')}`;
            }
        } else {
            let barrierValue = String(prediction).trim();
            if (barrierValue && !barrierValue.startsWith('+') && !barrierValue.startsWith('-')) {
                const num = Number(barrierValue);
                if (!isNaN(num) && num > 0) {
                    if (contractType === 'LOWER') {
                        barrierValue = '-' + barrierValue;
                    } else {
                        barrierValue = '+' + barrierValue;
                    }
                }
            }
            payload.barrier = barrierValue;
        }
    }

    if (predictionMode === 'selected_tick') {
        payload.selected_tick = prediction;
    }

    return payload;
};

const requestQuote = async (api: ApiLike, payload: Record<string, unknown>) => {
    const response = normalizeApiMessage<ProposalResponse>(await api.send(payload));

    if (response?.error) {
        const message = getDerivErrorMessage(response.error, 'Unable to fetch a quote.');
        const durationValue = payload.duration;
        const durationUnit = payload.duration_unit;
        if (String(message).toLowerCase().includes('duration') || String(message).toLowerCase().includes('tick')) {
            throw new Error(
                `Invalid ticks for ${String(payload.contract_type || 'contract')}: ${durationValue}${durationUnit}. ${message}`
            );
        }
        throw new Error(message);
    }

    if (!response?.proposal?.id || typeof response.proposal.ask_price !== 'number') {
        throw new Error('Deriv returned an incomplete live quote.');
    }

    return {
        askPrice: response.proposal.ask_price,
        contractParameters: payload,
        longcode: response.proposal.longcode,
        proposalId: response.proposal.id,
        spot: response.proposal.spot,
        payout: response.proposal.payout,
    } as FlipperQuote;
};

const buyQuote = async (api: ApiLike, quote: FlipperQuote) => {
    const response = normalizeApiMessage<BuyResponse>(
        await api.send({
            buy: quote.proposalId,
            price: String(quote.askPrice),
        })
    );

    if (response?.error) {
        throw new Error(getDerivErrorMessage(response.error, 'Unable to buy this contract.'));
    }

    if (!response?.buy?.contract_id) {
        throw new Error('Deriv accepted the buy request but did not return a contract id.');
    }

    return response.buy;
};

const subscribeToContract = async (
    api: ApiLike,
    contractId: number,
    onUpdate: (contract: ProposalOpenContract) => void,
    onError: (message: string) => void
) => {
    let subscriptionId: string | null = null;
    const messageSubscription = api.onMessage().subscribe((message: unknown) => {
        const data = normalizeApiMessage<OpenContractResponse>(message);
        const contract = data?.proposal_open_contract;

        if (data?.msg_type !== 'proposal_open_contract' || contract?.contract_id !== contractId) {
            return;
        }

        subscriptionId = data.subscription?.id ?? subscriptionId;
        onUpdate(contract);
    });

    try {
        const initialResponse = normalizeApiMessage<OpenContractResponse>(
            await api.send({
                contract_id: contractId,
                proposal_open_contract: 1,
                subscribe: 1,
            })
        );

        if (initialResponse?.error) {
            throw new Error(initialResponse.error.message || 'Unable to monitor the contract.');
        }

        subscriptionId = initialResponse?.subscription?.id ?? subscriptionId;

        if (initialResponse?.proposal_open_contract?.contract_id === contractId) {
            onUpdate(initialResponse.proposal_open_contract);
        }
    } catch (error) {
        messageSubscription.unsubscribe();
        onError(error instanceof Error ? error.message : 'Unable to monitor the contract.');
        return () => {};
    }

    return () => {
        messageSubscription.unsubscribe();
        if (subscriptionId) {
            void api.send({ forget: subscriptionId }).catch(() => undefined);
        }
    };
};

const getSelectedLegs = (legs: SelectedStrategyLegs): [StrategyLeg, StrategyLeg] | null =>
    legs[0] && legs[1] ? [legs[0], legs[1]] : null;

const getPairKeyFromLegs = (legs: SelectedStrategyLegs) => {
    const selectedLegs = getSelectedLegs(legs);

    if (!selectedLegs) {
        return 'none';
    }

    return (
        STRATEGY_PAIRS.find(
            pair =>
                pair.legs[0].contractType === selectedLegs[0].contractType &&
                pair.legs[1].contractType === selectedLegs[1].contractType
        )?.key || 'custom'
    );
};

const getPairLabelFromLegs = (legs: SelectedStrategyLegs) => {
    const selectedLegs = getSelectedLegs(legs);
    return selectedLegs ? selectedLegs.map(leg => leg.label).join(' / ') : 'Select two contracts';
};

const FlipperSwitcherPage = observer(() => {
    const store = useStore();
    const { transactions } = store;
    const { authData, connectionStatus } = useApiBase();
    const currency = authData?.currency || getStoredProfitdockActiveCurrency() || 'USD';
    const hasRecoverableSession = useCallback(
        () => isCustomLegacyOAuthDomain() && hasUsableProfitdockStoredSession(),
        []
    );
    const [markets, setMarkets] = useState<MarketSymbol[]>(() => getMarketsWithoutStepBoomCrashRange([]));
    const [selectedMarket, setSelectedMarket] = useProfitdockPersistentState('profitdock.flipper.market', '1HZ10V');
    const [customLegs, setCustomLegs] = useProfitdockPersistentState<SelectedStrategyLegs>('profitdock.flipper.legs', [
        null,
        null,
    ]);
    const [stakeOne, setStakeOne] = useProfitdockPersistentState('profitdock.flipper.stakeOne', '');
    const [stakeTwo, setStakeTwo] = useProfitdockPersistentState('profitdock.flipper.stakeTwo', '');
    const [martingaleOne, setMartingaleOne] = useProfitdockPersistentState('profitdock.flipper.martingaleOne', '2');
    const [martingaleTwo, setMartingaleTwo] = useProfitdockPersistentState('profitdock.flipper.martingaleTwo', '2');
    const [durationTicks, setDurationTicks] = useProfitdockPersistentState('profitdock.flipper.duration', '1');
    const [entryPoint, setEntryPoint] = useProfitdockPersistentState('profitdock.flipper.entryPoint', '');
    const [predictionOne, setPredictionOne] = useProfitdockPersistentState('profitdock.flipper.predictionOne', '');
    const [predictionTwo, setPredictionTwo] = useProfitdockPersistentState('profitdock.flipper.predictionTwo', '');
    const [switchMarket, setSwitchMarket] = useProfitdockPersistentState('profitdock.flipper.switchMarket', false);
    const [isSwitchMarketPickerOpen, setIsSwitchMarketPickerOpen] = useState(false);
    const [switchMarketSymbols, setSwitchMarketSymbols] = useProfitdockPersistentState<string[]>(
        'profitdock.flipper.switchMarketSymbols',
        []
    );
    const [switchOnLoss, setSwitchOnLoss] = useProfitdockPersistentState('profitdock.flipper.switchOnLoss', true);
    const [turbo, setTurbo] = useProfitdockPersistentState('profitdock.flipper.turbo', false);
    const [lossesToSwitch, setLossesToSwitch] = useProfitdockPersistentState('profitdock.flipper.lossesToSwitch', '1');
    const [rounds, setRounds] = useProfitdockPersistentState('profitdock.flipper.rounds', '');
    const [takeProfit, setTakeProfit] = useProfitdockPersistentState('profitdock.flipper.takeProfit', '');
    const [stopLoss, setStopLoss] = useProfitdockPersistentState('profitdock.flipper.stopLoss', '');
    const [positions, setPositions] = useState<FlipperPosition[]>([]);
    const [feedback, setFeedback] = useState(localize('No positions'));
    const [isRunning, setIsRunning] = useState(false);
    const [stats, setStats] = useState({ lost: 0, runs: 0, totalPnl: 0, won: 0 });
    const cleanupRef = useRef<Map<number, () => void>>(new Map());
    const runningRef = useRef(false);
    const currentRoundRef = useRef(0);
    const currentRunIdRef = useRef(0);
    const processedRunIdsRef = useRef<Set<number>>(new Set());
    const runCountRef = useRef(0);
    const sessionPnlRef = useRef(0);

    const lossStreakRef = useRef(0);
    const nextLegSlotRef = useRef<0 | 1>(0);
    const selectedMarketInfoRef = useRef<MarketSymbol | null>(null);
    const martingaleOneRef = useRef(martingaleOne);
    const martingaleTwoRef = useRef(martingaleTwo);
    // Direct ref-based martingale tracking — bypasses the store entirely
    const stakeOneRef = useRef(0);
    const stakeTwoRef = useRef(0);
    const baseStakeOneRef = useRef(0);
    const baseStakeTwoRef = useRef(0);
    const entryPointRef = useRef(entryPoint);
    const turboRef = useRef(turbo);
    const durationTicksRef = useRef(durationTicks);
    const predictionOneRef = useRef(predictionOne);
    const predictionTwoRef = useRef(predictionTwo);
    const switchMarketRef = useRef(switchMarket);
    const switchMarketSymbolsRef = useRef(switchMarketSymbols);
    const switchOnLossRef = useRef(switchOnLoss);
    const lossesToSwitchRef = useRef(lossesToSwitch);
    const roundsRef = useRef(rounds);
    const takeProfitRef = useRef(takeProfit);
    const stopLossRef = useRef(stopLoss);
    const customLegsRef = useRef(customLegs);

    const [quoteOne, setQuoteOne] = useState<{ askPrice: number; payout: number; error?: string } | null>(null);
    const [quoteTwo, setQuoteTwo] = useState<{ askPrice: number; payout: number; error?: string } | null>(null);

    useEffect(() => {
        turboRef.current = turbo;
    }, [turbo]);
    useEffect(() => {
        durationTicksRef.current = durationTicks;
    }, [durationTicks]);
    useEffect(() => {
        predictionOneRef.current = predictionOne;
    }, [predictionOne]);
    useEffect(() => {
        predictionTwoRef.current = predictionTwo;
    }, [predictionTwo]);
    useEffect(() => {
        switchMarketRef.current = switchMarket;
    }, [switchMarket]);
    useEffect(() => {
        switchMarketSymbolsRef.current = switchMarketSymbols;
    }, [switchMarketSymbols]);
    useEffect(() => {
        switchOnLossRef.current = switchOnLoss;
    }, [switchOnLoss]);
    useEffect(() => {
        lossesToSwitchRef.current = lossesToSwitch;
    }, [lossesToSwitch]);
    useEffect(() => {
        roundsRef.current = rounds;
    }, [rounds]);
    useEffect(() => {
        takeProfitRef.current = takeProfit;
    }, [takeProfit]);
    useEffect(() => {
        stopLossRef.current = stopLoss;
    }, [stopLoss]);
    useEffect(() => {
        customLegsRef.current = customLegs;
    }, [customLegs]);

    const selectedLegs = useMemo(() => getSelectedLegs(customLegs), [customLegs]);
    const selectedPair = useMemo(
        () => ({
            key: getPairKeyFromLegs(customLegs),
            label: getPairLabelFromLegs(customLegs),
            legs: customLegs,
        }),
        [customLegs]
    );
    const selectedMarketInfo = useMemo(
        () => markets.find(market => market.symbol === selectedMarket) || markets[0],
        [markets, selectedMarket]
    );
    const selectedSwitchMarkets = useMemo(
        () =>
            markets.filter(market =>
                switchMarketSymbols.length
                    ? switchMarketSymbols.includes(market.symbol)
                    : market.symbol === selectedMarket
            ),
        [markets, selectedMarket, switchMarketSymbols]
    );

    useEffect(() => {
        selectedMarketInfoRef.current = selectedMarketInfo || null;
    }, [selectedMarketInfo]);

    useEffect(() => {
        martingaleOneRef.current = martingaleOne;
    }, [martingaleOne]);
    useEffect(() => {
        martingaleTwoRef.current = martingaleTwo;
    }, [martingaleTwo]);

    useEffect(() => {
        entryPointRef.current = entryPoint;
    }, [entryPoint]);

    const ensureTradingApi = useCallback(
        async (forceReconnect = false) => {
            if (!forceReconnect && hasTradingSession()) {
                return getDerivApi() || null;
            }

            if (!hasRecoverableSession()) {
                return null;
            }

            try {
                await api_base.init(true);
                return hasTradingSession() ? getDerivApi() || null : null;
            } catch (error) {
                console.warn('[Flipper Switcher] Trading session recovery failed.', error);
                return null;
            }
        },
        [hasRecoverableSession]
    );

    useEffect(() => {
        let isCancelled = false;

        const fetchQuotes = async () => {
            if (isRunning) return;
            const api = await ensureTradingApi();
            if (!api || isCancelled) return;

            const duration = toPositiveInteger(durationTicks, 1);

            const fetchLegQuote = async (leg: StrategyLeg | null, stake: string, pred: string) => {
                if (!leg || !selectedMarketInfoRef.current) return null;
                const currentStake = toPositiveNumber(stake, 0);
                if (currentStake <= 0) return null;

                let val = pred;
                if (!val) {
                    if (leg.predictionMode === 'barrier') {
                        val = leg.contractType.includes('DIGIT') ? '5' : '0.1';
                    } else {
                        val = entryPoint || '0';
                    }
                }

                const parsedPred = leg.contractType.includes('DIGIT')
                    ? Math.max(0, Math.min(9, Math.trunc(Number(val))))
                    : val;

                try {
                    const quote = await requestQuote(
                        api,
                        createProposalPayload({
                            amount: currentStake,
                            contractType: leg.contractType,
                            currency,
                            duration,
                            prediction: parsedPred,
                            predictionMode: leg.predictionMode,
                            symbol: selectedMarketInfoRef.current.symbol,
                        })
                    );
                    return { askPrice: quote.askPrice, payout: quote.payout || 0 };
                } catch (error: any) {
                    const msg =
                        error?.error?.message ||
                        error?.message ||
                        (typeof error === 'string' ? error : 'Error fetching quote');
                    return { askPrice: 0, payout: 0, error: msg };
                }
            };

            const [q1, q2] = await Promise.all([
                fetchLegQuote(selectedLegs?.[0] || null, stakeOne, predictionOne),
                fetchLegQuote(selectedLegs?.[1] || null, stakeTwo, predictionTwo),
            ]);

            if (!isCancelled) {
                setQuoteOne(q1);
                setQuoteTwo(q2);
            }
        };

        const timer = setTimeout(fetchQuotes, 500);
        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [
        selectedLegs,
        stakeOne,
        stakeTwo,
        predictionOne,
        predictionTwo,
        entryPoint,
        turbo,
        durationTicks,
        selectedMarket,
        currency,
        isRunning,
        ensureTradingApi,
    ]);

    useEffect(() => {
        let isCancelled = false;

        const loadMarkets = async () => {
            if (!api_base.active_symbols.length && api_base.active_symbols_promise) {
                await api_base.active_symbols_promise.catch(() => undefined);
            } else if (!api_base.active_symbols.length && connectionStatus === CONNECTION_STATUS.OPENED) {
                await api_base.getActiveSymbols().catch(() => undefined);
            }

            if (!isCancelled) {
                const orderedMarkets = getMarketsWithoutStepBoomCrashRange(api_base.active_symbols as MarketSymbol[]);
                setMarkets(orderedMarkets);
                setSelectedMarket(previous =>
                    orderedMarkets.some(market => market.symbol === previous)
                        ? previous
                        : orderedMarkets.find(market => market.symbol === '1HZ10V')?.symbol ||
                          orderedMarkets[0]?.symbol ||
                          previous
                );
                setSwitchMarketSymbols(previous =>
                    previous.filter(symbol => orderedMarkets.some(market => market.symbol === symbol))
                );
            }
        };

        void loadMarkets();

        return () => {
            isCancelled = true;
        };
    }, [connectionStatus]);

    useEffect(() => {
        return () => {
            cleanupRef.current.forEach(cleanup => cleanup());
            cleanupRef.current.clear();
            runningRef.current = false;
        };
    }, []);

    const waitForSettlement = (
        api: ApiLike,
        contractId: number,
        onUpdate: (contract: any) => void
    ): Promise<{ profit: number; won: boolean }> => {
        return new Promise((resolve, reject) => {
            let cleanup = null;
            let resolved = false;
            subscribeToContract(
                api,
                contractId,
                contract => {
                    onUpdate(contract);
                    const status = contract.status;
                    if (!resolved && (status === 'won' || status === 'lost')) {
                        resolved = true;
                        if (cleanup) cleanup();
                        // Use status field directly — never infer win/loss from profit amount
                        resolve({ profit: Number(contract.profit ?? 0), won: status === 'won' });
                    }
                },
                errorMsg => {
                    if (!resolved) {
                        resolved = true;
                        if (cleanup) cleanup();
                        reject(new Error(errorMsg));
                    }
                }
            )
                .then(fn => {
                    cleanup = fn;
                    if (resolved) cleanup();
                })
                .catch(reject);
        });
    };

    const runFlipperLoop = async () => {
        try {
            let currentStakeOne = toPositiveNumber(stakeOne, 0);
            let currentStakeTwo = toPositiveNumber(stakeTwo, 0);
            baseStakeOneRef.current = currentStakeOne;
            baseStakeTwoRef.current = currentStakeTwo;

            let currentLossStreakOne = 0;
            let currentLossStreakTwo = 0;
            let currentRunCount = 0;
            let currentSessionPnl = 0;

            const getSessionStopMessage = () => {
                const maxRuns = toPositiveInteger(roundsRef.current, 0);
                const takeProfitLimit = toPositiveNumber(takeProfitRef.current);
                const stopLossLimit = toPositiveNumber(stopLossRef.current);

                if (maxRuns > 0 && currentRunCount >= maxRuns) {
                    return localize('Rounds limit reached. Stopped.');
                }

                if (takeProfitLimit > 0 && currentSessionPnl >= takeProfitLimit) {
                    return localize('Take profit reached. Stopped.');
                }

                if (stopLossLimit > 0 && currentSessionPnl <= -stopLossLimit) {
                    return localize('Stop loss reached. Stopped.');
                }

                return '';
            };

            const updatePositionsUi = (contract: any, legIndex: number, activeLegs: any) => {
                const liveContract = contract;
                transactions.pushTransaction({
                    ...contract,
                    accountID: getActiveTransactionAccountId(),
                });
                const status = contract.status;
                const isSettled = status === 'won' || status === 'lost';
                setPositions(prev => {
                    const existing = prev.find(p => p.contractId === contract.contract_id);
                    if (existing) {
                        return prev.map(p =>
                            p.contractId === contract.contract_id
                                ? {
                                      ...p,
                                      entrySpot:
                                          contract.entry_tick_display_value || contract.entry_tick || p.entrySpot,
                                      exitSpot:
                                          contract.exit_tick_display_value ||
                                          contract.exit_tick ||
                                          (isSettled
                                              ? liveContract.current_spot_display_value || liveContract.current_spot
                                              : p.exitSpot),
                                      profit: contract.profit != null ? Number(contract.profit) : p.profit,
                                      status: isSettled ? 'closed' : 'live',
                                  }
                                : p
                        );
                    } else {
                        return [
                            ...prev,
                            {
                                buyPrice: Number(contract.buy_price) || 0,
                                contractId: contract.contract_id,
                                contractType: contract.contract_type,
                                entrySpot: contract.entry_tick_display_value || contract.entry_tick,
                                exitSpot:
                                    contract.exit_tick_display_value ||
                                    contract.exit_tick ||
                                    liveContract.current_spot_display_value ||
                                    liveContract.current_spot,
                                label: activeLegs[legIndex].label,
                                legIndex,
                                market: contract.underlying,
                                profit: Number(contract.profit || 0),
                                runId: currentRunIdRef.current,
                                stake: Number(contract.buy_price) || 0,
                                status: isSettled ? 'closed' : 'live',
                            },
                        ];
                    }
                });
            };

            const waitForEntryTrigger = async (
                marketSymbol: string,
                api: ApiLike,
                activeLegs: [StrategyLeg, StrategyLeg]
            ) => {
                const hasEntryDigit = entryPointRef.current !== '';
                const shouldWaitForDigitEntry = activeLegs.some(isDigitEntryContract);
                if (!hasEntryDigit || !shouldWaitForDigitEntry) {
                    if (!turboRef.current) await new Promise(r => setTimeout(r, 500));
                    return;
                }

                return new Promise<void>(resolve => {
                    const sub = api.onMessage().subscribe(message => {
                        const data = normalizeApiMessage(message);
                        if (data.msg_type === 'tick' && data.tick?.symbol === marketSymbol) {
                            const digit = getLastDigit(Number(data.tick.quote), Number(data.tick.pip_size || 2));
                            const target = Math.max(0, Math.min(9, Math.trunc(Number(entryPointRef.current || 0))));
                            if (digit === target) {
                                sub.unsubscribe();
                                resolve();
                            }
                        }
                    });
                    api.send({ subscribe: 1, ticks: marketSymbol }).catch(() => {});
                });
            };

            while (runningRef.current) {
                const activeLegs = selectedLegs;
                const baseMarketInfo = selectedMarketInfoRef.current;
                if (!activeLegs || !baseMarketInfo) {
                    setIsRunning(false);
                    runningRef.current = false;
                    break;
                }

                const preRunStopMessage = getSessionStopMessage();
                if (preRunStopMessage) {
                    setFeedback(preRunStopMessage);
                    break;
                }

                const api: any = await ensureTradingApi();

                const marketCandidates =
                    switchMarketRef.current && switchMarketSymbolsRef.current.length > 0
                        ? selectedSwitchMarkets
                        : [selectedMarketInfoRef.current];
                const currentMarketIndex = marketCandidates.findIndex(
                    m => m.symbol === selectedMarketInfoRef.current.symbol
                );
                const orderedCandidates = [
                    ...marketCandidates.slice(Math.max(currentMarketIndex, 0)),
                    ...marketCandidates.slice(0, Math.max(currentMarketIndex, 0)),
                ];

                // --- VIRTUAL MODE FOR FLIPPER ---
                if (store.client.is_dummy_active) {
                    if (store.client.dummy_balance <= 0.35) {
                        console.warn('[Flipper Virtual] Insufficient balance:', store.client.dummy_balance);
                        setIsRunning(false);
                        runningRef.current = false;
                        window.alert('Insufficient balance. Your virtual balance is too low to trade.');
                        break;
                    }
                    await virtualEngine['_requestTicks']?.(orderedCandidates[0].symbol);
                    // No need to override `api` here; the global interceptor in api-base.ts
                    // automatically routes proposal/buy/sell to virtualEngine and lets ticks pass through!
                }

                if (!api) {
                    setIsRunning(false);
                    runningRef.current = false;
                    break;
                }

                // orderedCandidates moved above Virtual Mode logic

                await waitForEntryTrigger(orderedCandidates[0].symbol, api, activeLegs);
                if (!runningRef.current) break;

                const duration = toPositiveInteger(durationTicksRef.current, 1);

                const getPredictionValue = (refValue: string, leg: StrategyLeg) => {
                    let val = refValue;
                    if (!val) {
                        val = leg.predictionMode === 'barrier' ? '+0.25' : entryPointRef.current || '0';
                    }
                    if (leg.contractType.includes('DIGIT')) {
                        return Math.max(0, Math.min(9, Math.trunc(Number(val))));
                    }
                    return val;
                };

                const predOne = getPredictionValue(predictionOneRef.current, activeLegs[0]);
                const predTwo = getPredictionValue(predictionTwoRef.current, activeLegs[1]);

                let quoteBundle = null;
                for (const marketInfo of orderedCandidates) {
                    try {
                        const [firstQuote, secondQuote] = await Promise.all([
                            requestQuote(
                                api,
                                createProposalPayload({
                                    amount: currentStakeOne,
                                    contractType: activeLegs[0].contractType,
                                    currency,
                                    duration,
                                    prediction: predOne,
                                    predictionMode: activeLegs[0].predictionMode,
                                    symbol: marketInfo.symbol,
                                })
                            ),
                            requestQuote(
                                api,
                                createProposalPayload({
                                    amount: currentStakeTwo,
                                    contractType: activeLegs[1].contractType,
                                    currency,
                                    duration,
                                    prediction: predTwo,
                                    predictionMode: activeLegs[1].predictionMode,
                                    symbol: marketInfo.symbol,
                                })
                            ),
                        ]);
                        quoteBundle = { firstQuote, marketInfo, secondQuote };
                        break;
                    } catch (e) {
                        if (!switchMarketRef.current || orderedCandidates.length <= 1) throw e;
                    }
                }

                if (!quoteBundle) {
                    setFeedback('No supported market available.');
                    break;
                }

                if (quoteBundle.marketInfo.symbol !== selectedMarketInfoRef.current.symbol) {
                    selectedMarketInfoRef.current = quoteBundle.marketInfo;
                    setSelectedMarket(quoteBundle.marketInfo.symbol);
                }

                currentRunIdRef.current = Date.now();
                let firstId: any, secondId: any;

                try {
                    const [b1, b2] = await Promise.all([
                        buyQuote(api, quoteBundle.firstQuote),
                        buyQuote(api, quoteBundle.secondQuote),
                    ]);
                    firstId = b1.contract_id;
                    secondId = b2.contract_id;
                } catch (err: any) {
                    setFeedback('Buy failed: ' + (err?.message || String(err)));
                    break;
                }

                const [r1, r2] = await Promise.all([
                    waitForSettlement(api, firstId, c => updatePositionsUi(c, 0, activeLegs)),
                    waitForSettlement(api, secondId, c => updatePositionsUi(c, 1, activeLegs)),
                ]);

                const netProfit = r1.profit + r2.profit;
                currentSessionPnl = Number((currentSessionPnl + netProfit).toFixed(2));
                sessionPnlRef.current = currentSessionPnl;
                currentRunCount++;

                console.log(
                    '[FLIPPER]',
                    'round',
                    currentRunCount,
                    '| leg1:',
                    r1.won ? 'WON' : 'LOST',
                    'profit=',
                    r1.profit,
                    '→ nextStake=',
                    currentStakeOne,
                    '| leg2:',
                    r2.won ? 'WON' : 'LOST',
                    'profit=',
                    r2.profit,
                    '→ nextStake=',
                    currentStakeTwo
                );

                // Each leg reacts ONLY to its own settlement status from the API
                if (r1.won) {
                    currentLossStreakOne = 0;
                    currentStakeOne = baseStakeOneRef.current;
                } else {
                    currentLossStreakOne++;
                    const normMult = normalizeMartingaleMultiplier(toPositiveNumber(martingaleOneRef.current, 1), 1);
                    currentStakeOne = roundMartingaleStake(currentStakeOne * normMult);
                }

                if (r2.won) {
                    currentLossStreakTwo = 0;
                    currentStakeTwo = baseStakeTwoRef.current;
                } else {
                    currentLossStreakTwo++;
                    const normMult = normalizeMartingaleMultiplier(toPositiveNumber(martingaleTwoRef.current, 1), 1);
                    currentStakeTwo = roundMartingaleStake(currentStakeTwo * normMult);
                }

                console.log(
                    '[FLIPPER] after update — stake1=',
                    currentStakeOne,
                    'streak1=',
                    currentLossStreakOne,
                    'stake2=',
                    currentStakeTwo,
                    'streak2=',
                    currentLossStreakTwo
                );

                const won = r1.won || r2.won;
                const lostBatch = !won;
                setStakeOne(roundStakeValue(currentStakeOne));
                setStakeTwo(roundStakeValue(currentStakeTwo));
                setStats(prev => ({
                    lost: prev.lost + (lostBatch ? 1 : 0),
                    runs: currentRunCount,
                    totalPnl: currentSessionPnl,
                    won: prev.won + (won ? 1 : 0),
                }));

                const lossesT = toPositiveInteger(lossesToSwitchRef.current, 1);
                const postRunStopMessage = getSessionStopMessage();

                if (postRunStopMessage) {
                    setFeedback(postRunStopMessage);
                    break;
                }

                // Switch market if EITHER side has escalated past the threshold
                if (switchOnLossRef.current && (currentLossStreakOne >= lossesT || currentLossStreakTwo >= lossesT)) {
                    // Reset streaks so we don't switch on EVERY subsequent round until a win,
                    // but DO NOT reset stakes — the escalated martingale stake must carry over
                    // to the new market to recover the loss.
                    currentLossStreakOne = 0;
                    currentLossStreakTwo = 0;
                    const cIdx = marketCandidates.findIndex(m => m.symbol === selectedMarketInfoRef.current.symbol);
                    if (cIdx >= 0 && marketCandidates.length > 1) {
                        const nextM = marketCandidates[(cIdx + 1) % marketCandidates.length];
                        selectedMarketInfoRef.current = nextM;
                        setSelectedMarket(nextM.symbol);
                        setFeedback(
                            `Switched market to ${nextM.display_name || nextM.symbol} after ${lossesT} losses on a leg.`
                        );
                        if (!turboRef.current) await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }
        } catch (error) {
            console.error('[FlipperLoop Error]', error);
            setFeedback(error instanceof Error ? error.message : 'Flipper Switcher stopped due to an error.');
        } finally {
            setIsRunning(false);
            runningRef.current = false;
        }
    };

    const resetStakeInputsToInitial = useCallback(() => {
        if (baseStakeOneRef.current > 0) {
            stakeOneRef.current = baseStakeOneRef.current;
            setStakeOne(roundStakeValue(baseStakeOneRef.current));
        }

        if (baseStakeTwoRef.current > 0) {
            stakeTwoRef.current = baseStakeTwoRef.current;
            setStakeTwo(roundStakeValue(baseStakeTwoRef.current));
        }
    }, []);

    const handleRun = () => {
        if (runningRef.current) {
            runningRef.current = false;
            setIsRunning(false);
            resetStakeInputsToInitial();
            setFeedback(localize('Flipper Switcher will stop after the current contracts settle.'));
            return;
        }

        if (!selectedLegs) {
            setFeedback(localize('Select two contracts before running Flipper Switcher.'));
            return;
        }

        const firstStake = toPositiveNumber(stakeOne, 0);
        const secondStake = toPositiveNumber(stakeTwo, 0);

        if (firstStake <= 0 || secondStake <= 0) {
            setFeedback(localize('Enter a stake for both selected contracts before running Flipper Switcher.'));
            return;
        }

        if (entryPoint !== '') {
            const targetDigit = Number(entryPoint);
            if (!Number.isInteger(targetDigit) || targetDigit < 0 || targetDigit > 9) {
                setFeedback(localize('Entry point must be a digit from 0 to 9.'));
                return;
            }
        }

        const quoteError = quoteOne?.error || quoteTwo?.error;
        if (quoteError) {
            setFeedback(quoteError);
            return;
        }

        currentRoundRef.current = 0;
        currentRunIdRef.current = 0;
        processedRunIdsRef.current = new Set();
        runCountRef.current = 0;
        sessionPnlRef.current = 0;
        lossStreakRef.current = 0;
        // Initialize direct ref-based martingale tracking
        baseStakeOneRef.current = firstStake;
        baseStakeTwoRef.current = secondStake;
        stakeOneRef.current = firstStake;
        stakeTwoRef.current = secondStake;
        setStakeOne(roundStakeValue(firstStake));
        setStakeTwo(roundStakeValue(secondStake));
        runningRef.current = true;
        setIsRunning(true);
        setStats({ lost: 0, runs: 0, totalPnl: 0, won: 0 });
        // runFlipperLoop handles entry-digit waiting internally via waitForEntryTrigger.
        // Always start the loop — never hang here with the ref set but nothing running.
        if (entryPoint !== '') {
            setFeedback(localize('Waiting for entry digit to appear...'));
        }
        void runFlipperLoop();
    };

    useEffect(() => {
        emitProfitdockTradeStatus({
            canStop: isRunning,
            feature: 'flipper',
            label: isRunning ? localize('Flipper running') : localize('Flipper stopped'),
            running: isRunning,
        });
    }, [isRunning]);

    useEffect(
        () =>
            subscribeProfitdockTradeStop(request => {
                if (request.feature && request.feature !== 'flipper') return;

                runningRef.current = false;
                setIsRunning(false);
                resetStakeInputsToInitial();
                setFeedback(localize('Flipper Switcher will stop after the current contracts settle.'));
            }),
        [resetStakeInputsToInitial]
    );

    useEffect(
        () =>
            subscribeProfitdockTradeStart(request => {
                if (request.feature !== 'flipper' || isRunning) return;
                handleRun();
            }),
        [isRunning]
    );

    const handleStrategyButton = (leg: StrategyLeg) => {
        setCustomLegs(previous => {
            const existingIndex = previous.findIndex(activeLeg => activeLeg?.contractType === leg.contractType);

            if (existingIndex >= 0) {
                const next = [...previous] as SelectedStrategyLegs;
                next[existingIndex] = null;
                nextLegSlotRef.current = existingIndex as 0 | 1;
                return next;
            }

            const emptySlot = previous[0] ? (previous[1] ? null : 1) : 0;
            const slot = (emptySlot ?? nextLegSlotRef.current) as 0 | 1;
            const next = [...previous] as SelectedStrategyLegs;
            next[slot] = leg;
            nextLegSlotRef.current = slot === 0 ? 1 : 0;

            return next;
        });
    };

    const switchMarketCount = selectedSwitchMarkets.length || (selectedMarketInfo ? 1 : 0);

    return (
        <div className='flipper-page'>
            <div className='flipper-page__strategy-grid'>
                {BUTTONS.map(button => (
                    <button
                        key={button.contractType}
                        type='button'
                        className={`flipper-page__strategy-button ${
                            selectedPair.legs.some(leg => leg?.contractType === button.contractType)
                                ? 'flipper-page__strategy-button--active'
                                : ''
                        }`}
                        onClick={() => handleStrategyButton(button)}
                    >
                        <TradeTypeIcon type={button.contractType} size='sm' />
                        <span>{button.label}</span>
                    </button>
                ))}
            </div>

            <section className='flipper-page__active-card' aria-label={localize('Selected Flipper strategies')}>
                {selectedPair.legs.map((leg, index) => {
                    const quote = index === 0 ? quoteOne : quoteTwo;
                    return (
                        <div className='flipper-page__active-row' key={leg?.contractType || `empty-${index}`}>
                            <strong>
                                #{index + 1} - {leg?.label || localize('Select contract')}
                            </strong>
                            <label className='flipper-page__stake-label'>
                                <span>{localize('Stake')}</span>
                                <div className='flipper-page__stake-input-wrapper'>
                                    <input
                                        value={index === 0 ? stakeOne : stakeTwo}
                                        onChange={event =>
                                            index === 0
                                                ? setStakeOne(event.target.value)
                                                : setStakeTwo(event.target.value)
                                        }
                                        inputMode='decimal'
                                    />
                                    {quote && (
                                        <div className='flipper-page__quote-display'>
                                            {quote.error ? (
                                                <span className='flipper-page__quote-error'>{quote.error}</span>
                                            ) : (
                                                <span className='flipper-page__quote-payout'>
                                                    {localize('Payout')}: {formatMoney(quote.payout, currency)}
                                                    <span>{formatMoney(quote.payout - quote.askPrice, currency)}</span>
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </label>
                            <label>
                                {localize('Mult x')}
                                <input
                                    value={index === 0 ? martingaleOne : martingaleTwo}
                                    onChange={event =>
                                        index === 0
                                            ? setMartingaleOne(event.target.value)
                                            : setMartingaleTwo(event.target.value)
                                    }
                                    inputMode='decimal'
                                />
                            </label>
                            {leg?.predictionMode && leg?.predictionMode !== 'none' && (
                                <label>
                                    {leg?.predictionMode === 'barrier' ? localize('Barrier') : localize('Prediction')}
                                    <input
                                        value={index === 0 ? predictionOne : predictionTwo}
                                        onChange={event =>
                                            index === 0
                                                ? setPredictionOne(event.target.value)
                                                : setPredictionTwo(event.target.value)
                                        }
                                        inputMode='text'
                                    />
                                </label>
                            )}
                        </div>
                    );
                })}
            </section>

            <section className='flipper-page__control-panel'>
                <label className='flipper-page__field flipper-page__field--wide'>
                    {localize('Market')}
                    <div className='flipper-page__select-wrap'>
                        <MarketIcon type={selectedMarketInfo?.symbol || selectedMarket} size='sm' />
                        <select value={selectedMarket} onChange={event => setSelectedMarket(event.target.value)}>
                            {markets.map(market => (
                                <option key={market.symbol} value={market.symbol}>
                                    {market.display_name}
                                </option>
                            ))}
                        </select>
                    </div>
                </label>
                <label className='flipper-page__field'>
                    {localize('Ticks')}
                    <input
                        value={durationTicks}
                        onChange={event => setDurationTicks(event.target.value)}
                        inputMode='numeric'
                    />
                </label>
                <label className='flipper-page__field flipper-page__field--wide'>
                    {localize('Entry Point (digit)')}
                    <input
                        value={entryPoint}
                        onChange={event => setEntryPoint(event.target.value)}
                        inputMode='numeric'
                    />
                </label>
                <button
                    type='button'
                    className={`flipper-page__toggle ${switchMarket ? 'flipper-page__toggle--on' : ''}`}
                    onClick={() => {
                        setSwitchMarket(true);
                        setIsSwitchMarketPickerOpen(true);
                    }}
                >
                    {localize("Switch Mark't")}:{' '}
                    {switchMarket ? `${switchMarketCount} ${localize('market(s)')}` : 'OFF'}
                </button>
                <button
                    type='button'
                    className={`flipper-page__toggle ${switchOnLoss ? 'flipper-page__toggle--on' : ''}`}
                    onClick={() => setSwitchOnLoss(previous => !previous)}
                >
                    {localize('Switch on Loss')}: {switchOnLoss ? 'ON' : 'OFF'}
                </button>
                <label className='flipper-page__field'>
                    {localize('Losses to switch')}
                    <input
                        value={lossesToSwitch}
                        onChange={event => setLossesToSwitch(event.target.value)}
                        inputMode='numeric'
                    />
                </label>
                <button
                    type='button'
                    className={`flipper-page__toggle ${turbo ? 'flipper-page__toggle--on' : ''}`}
                    onClick={() => setTurbo(previous => !previous)}
                >
                    {localize('Turbo')}: {turbo ? 'ON' : 'OFF'}
                </button>
                <label className='flipper-page__field'>
                    {localize('Rounds')}
                    <input value={rounds} onChange={event => setRounds(event.target.value)} inputMode='numeric' />
                </label>
                <label className='flipper-page__field flipper-page__field--wide'>
                    {localize('Take Profit ($)')}
                    <input
                        value={takeProfit}
                        onChange={event => setTakeProfit(event.target.value)}
                        inputMode='decimal'
                    />
                </label>
                <label className='flipper-page__field'>
                    {localize('Stop Loss ($)')}
                    <input value={stopLoss} onChange={event => setStopLoss(event.target.value)} inputMode='decimal' />
                </label>
                <button type='button' className='flipper-page__run' onClick={handleRun}>
                    <span className='flipper-page__play' />
                    {isRunning ? localize('Stop') : localize('Run')}
                </button>
                <div className={`flipper-page__status ${isRunning ? 'flipper-page__status--on' : ''}`}>
                    {isRunning ? 'ON' : 'OFF'}
                </div>

                <div className='flipper-page__positions'>
                    <div>{localize('Type|Market')}</div>
                    <div>{localize('Entry|Exit spot')}</div>
                    <div>{localize('Buy price & P/L')}</div>
                    {positions.length ? (
                        positions.map(position => (
                            <React.Fragment key={position.contractId}>
                                <span>
                                    {position.label} - {position.market}
                                </span>
                                <span>
                                    {position.entrySpot ?? '--'} | {position.exitSpot ?? '--'}
                                </span>
                                <span>
                                    {position.buyPrice.toFixed(2)} - {formatMoney(position.profit, currency)}
                                </span>
                            </React.Fragment>
                        ))
                    ) : (
                        <span className='flipper-page__no-positions'>{localize('No positions')}</span>
                    )}
                </div>
            </section>

            {isSwitchMarketPickerOpen && (
                <div
                    className='flipper-page__market-modal-backdrop'
                    role='presentation'
                    onClick={() => setIsSwitchMarketPickerOpen(false)}
                >
                    <section
                        className='flipper-page__market-modal'
                        role='dialog'
                        aria-modal='true'
                        aria-label={localize('Switch market selection')}
                        onClick={event => event.stopPropagation()}
                    >
                        <header>
                            <div>
                                <span>{localize("Switch Mark't")}</span>
                                <h3>{localize('Markets used after loss threshold')}</h3>
                            </div>
                            <button
                                type='button'
                                onClick={() => setIsSwitchMarketPickerOpen(false)}
                                aria-label={localize('Close')}
                            >
                                x
                            </button>
                        </header>
                        <div className='flipper-page__market-modal-actions'>
                            <button
                                type='button'
                                onClick={() => {
                                    setSwitchMarket(true);
                                    setSwitchMarketSymbols(markets.map(market => market.symbol));
                                }}
                            >
                                {localize('Select all')}
                            </button>
                            <button
                                type='button'
                                onClick={() => {
                                    setSwitchMarket(false);
                                    setSwitchMarketSymbols([]);
                                }}
                            >
                                {localize('Turn off')}
                            </button>
                        </div>
                        <div className='flipper-page__market-table'>
                            {markets.map(market => {
                                const isSelected = switchMarketSymbols.length
                                    ? switchMarketSymbols.includes(market.symbol)
                                    : market.symbol === selectedMarket;
                                return (
                                    <button
                                        type='button'
                                        key={market.symbol}
                                        className={
                                            isSelected
                                                ? 'flipper-page__market-row flipper-page__market-row--selected'
                                                : 'flipper-page__market-row'
                                        }
                                        onClick={() => {
                                            setSwitchMarket(true);
                                            setSwitchMarketSymbols(previous =>
                                                toggleMarketSymbol(previous, market.symbol)
                                            );
                                        }}
                                    >
                                        <span className='flipper-page__market-check'>
                                            {isSelected ? localize('On') : ''}
                                        </span>
                                        <MarketIcon type={market.symbol} size='sm' />
                                        <span>{market.display_name}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <footer>
                            <span>
                                {localize('Selected')}: {switchMarket ? switchMarketCount : 0}
                            </span>
                            <button type='button' onClick={() => setIsSwitchMarketPickerOpen(false)}>
                                {localize('Done')}
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            <button
                type='button'
                className='flipper-page__reset'
                onClick={() => {
                    setPositions([]);
                    currentRoundRef.current = 0;
                    currentRunIdRef.current = 0;
                    processedRunIdsRef.current = new Set();
                    runCountRef.current = 0;
                    sessionPnlRef.current = 0;
                    lossStreakRef.current = 0;
                    stakeOneRef.current = 0;
                    stakeTwoRef.current = 0;
                    setStats({ lost: 0, runs: 0, totalPnl: 0, won: 0 });
                    setFeedback(localize('No positions'));
                }}
            >
                {localize('Reset')}
            </button>

            <div className='flipper-page__feedback'>
                {feedback}
                {stats.runs
                    ? ` ${localize('Runs')}: ${stats.runs} | ${localize('P/L')}: ${formatMoney(stats.totalPnl, currency)}`
                    : ''}
            </div>
        </div>
    );
});

class FlipperErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; errorMsg: string }> {
    state = { hasError: false, errorMsg: '' };

    static getDerivedStateFromError(error: unknown) {
        return { hasError: true, errorMsg: String(error) };
    }

    componentDidCatch(error: unknown) {
        console.error('[FLIPPER SWITCHER CRASHED]', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 24, color: 'white', background: '#1a1a2e', borderRadius: 8, margin: 16 }}>
                    <p style={{ fontWeight: 600, marginBottom: 8 }}>⚠️ Flipper Switcher hit an error and stopped.</p>
                    <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 16 }}>{this.state.errorMsg}</p>
                    <button
                        style={{
                            padding: '8px 16px',
                            background: '#6c47ff',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                        }}
                        onClick={() => this.setState({ hasError: false, errorMsg: '' })}
                    >
                        Reload this tab
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const FlipperSwitcherPageWithBoundary = () => (
    <FlipperErrorBoundary>
        <FlipperSwitcherPage />
    </FlipperErrorBoundary>
);

export default FlipperSwitcherPageWithBoundary;
