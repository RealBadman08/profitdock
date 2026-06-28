import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useStore } from '@/hooks/useStore';
import { normalizeMartingaleMultiplier, roundMartingaleStake } from '@/hooks/useMartingale';

import { emitProfitdockTradeStatus, subscribeProfitdockTradeStop } from '@/utils/profitdock-trade-controller';
import { ProposalOpenContract } from '@deriv/api-types';
import { localize } from '@deriv-com/translations';
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
    predictionMode?: 'barrier' | 'selected_tick';
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
        key: 'only_up_down',
        label: 'Only Ups / Only Downs',
        legs: [
            { contractType: 'RUNHIGH', label: 'Only Ups' },
            { contractType: 'RUNLOW', label: 'Only Downs' },
        ],
    },
    {
        key: 'rise_fall_equal',
        label: 'Rise = / Fall =',
        legs: [
            { contractType: 'CALLE', label: 'Rise =' },
            { contractType: 'PUTE', label: 'Fall =' },
        ],
    },
];

const BUTTONS = [
    STRATEGY_PAIRS[0].legs[0],
    STRATEGY_PAIRS[0].legs[1],
    STRATEGY_PAIRS[1].legs[0],
    STRATEGY_PAIRS[1].legs[1],
    STRATEGY_PAIRS[2].legs[0],
    STRATEGY_PAIRS[2].legs[1],
    STRATEGY_PAIRS[3].legs[0],
    STRATEGY_PAIRS[3].legs[1],
    STRATEGY_PAIRS[4].legs[0],
    STRATEGY_PAIRS[4].legs[1],
    STRATEGY_PAIRS[5].legs[0],
    STRATEGY_PAIRS[5].legs[1],
];

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

const hasTradingSession = () =>
    Boolean(
        isDerivSocketOpen() &&
            isSelectedProfitdockAccountSocket() &&
            (isCustomLegacyOAuthDomain() ? api_base.has_authenticated_profitdock_socket : api_base.is_authorized)
    );

const isRecoverableFlipperAuthError = (error: unknown) => {
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

const toPositiveNumber = (value: string | number, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toPositiveInteger = (value: string | number, fallback = 1) => {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const RUN_CONTRACT_TYPES = new Set(['RUNHIGH', 'RUNLOW']);

const getDurationForLeg = (leg: StrategyLeg, requestedDuration: number) => {
    if (!RUN_CONTRACT_TYPES.has(leg.contractType)) {
        return requestedDuration;
    }

    return Math.max(2, Math.min(5, requestedDuration));
};

const roundStakeValue = (value: number) => Number(value.toFixed(2)).toString();

const getLastDigit = (quote: number) => {
    const digits = String(quote).replace(/\D/g, '');
    return Number(digits.charAt(digits.length - 1)) || 0;
};

const formatMoney = (value: number, currency: string) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(2)} ${currency}`;

const toggleMarketSymbol = (symbols: string[], symbol: string) =>
    symbols.includes(symbol) ? symbols.filter(item => item !== symbol) : [...symbols, symbol];

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
    prediction: number;
    predictionMode?: 'barrier' | 'selected_tick';
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

    if (predictionMode === 'barrier') {
        payload.barrier = String(prediction);
    }

    if (predictionMode === 'selected_tick') {
        payload.selected_tick = prediction;
    }

    return payload;
};

const requestQuote = async (api: ApiLike, payload: Record<string, unknown>) => {
    const response = normalizeApiMessage<ProposalResponse>(await api.send(payload));

    if (response?.error) {
        throw new Error(getDerivErrorMessage(response.error, 'Unable to fetch a live quote.'));
    }

    if (!response?.proposal?.id || typeof response.proposal.ask_price !== 'number') {
        throw new Error('Deriv returned an incomplete live quote.');
    }

    return {
        askPrice: response.proposal.ask_price,
        longcode: response.proposal.longcode,
        proposalId: response.proposal.id,
        spot: response.proposal.spot,
    };
};

const buyQuote = async (api: ApiLike, proposalId: string, askPrice: number) => {
    const response = normalizeApiMessage<BuyResponse>(
        await api.send({
            buy: proposalId,
            price: String(askPrice),
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

const getNextPairKey = (key: string) => {
    const index = STRATEGY_PAIRS.findIndex(pair => pair.key === key);
    return STRATEGY_PAIRS[(index + 1) % STRATEGY_PAIRS.length].key;
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
    const { transactions } = useStore();
    const { authData, connectionStatus } = useApiBase();
    const currency = authData?.currency || getStoredProfitdockActiveCurrency() || 'USD';
    const hasRecoverableSession = useCallback(() => isCustomLegacyOAuthDomain() && hasUsableProfitdockStoredSession(), []);
    const [markets, setMarkets] = useState<MarketSymbol[]>(() => getMarketsWithoutStepBoomCrashRange([]));
    const [selectedMarket, setSelectedMarket] = useState('1HZ10V');
    const [customLegs, setCustomLegs] = useState<SelectedStrategyLegs>([null, null]);
    const [stakeOne, setStakeOne] = useState('');
    const [stakeTwo, setStakeTwo] = useState('');
    const [martingale, setMartingale] = useState('1.25');
    const [durationTicks, setDurationTicks] = useState('1');
    const [entryPoint, setEntryPoint] = useState('');
    const [predictionOne, setPredictionOne] = useState('');
    const [predictionTwo, setPredictionTwo] = useState('');
    const [switchMarket, setSwitchMarket] = useState(false);
    const [isSwitchMarketPickerOpen, setIsSwitchMarketPickerOpen] = useState(false);
    const [switchMarketSymbols, setSwitchMarketSymbols] = useState<string[]>([]);
    const [switchOnLoss, setSwitchOnLoss] = useState(true);
    const [turbo, setTurbo] = useState(false);
    const [lossesToSwitch, setLossesToSwitch] = useState('1');
    const [rounds, setRounds] = useState('');
    const [takeProfit, setTakeProfit] = useState('');
    const [stopLoss, setStopLoss] = useState('');
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
    const batchInFlightRef = useRef(false);
    const lossStreakRef = useRef(0);
    const nextLegSlotRef = useRef<0 | 1>(0);
    const selectedMarketInfoRef = useRef<MarketSymbol | null>(null);
    const martingaleRef = useRef(martingale);
    const executePairRef = useRef<(() => void) | null>(null);
    // Direct ref-based martingale tracking — bypasses the store entirely
    const stakeOneRef = useRef(0);
    const stakeTwoRef = useRef(0);
    const baseStakeOneRef = useRef(0);
    const baseStakeTwoRef = useRef(0);
    const waitingForEntryDigitRef = useRef(false);
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

    useEffect(() => { turboRef.current = turbo; }, [turbo]);
    useEffect(() => { durationTicksRef.current = durationTicks; }, [durationTicks]);
    useEffect(() => { predictionOneRef.current = predictionOne; }, [predictionOne]);
    useEffect(() => { predictionTwoRef.current = predictionTwo; }, [predictionTwo]);
    useEffect(() => { switchMarketRef.current = switchMarket; }, [switchMarket]);
    useEffect(() => { switchMarketSymbolsRef.current = switchMarketSymbols; }, [switchMarketSymbols]);
    useEffect(() => { switchOnLossRef.current = switchOnLoss; }, [switchOnLoss]);
    useEffect(() => { lossesToSwitchRef.current = lossesToSwitch; }, [lossesToSwitch]);
    useEffect(() => { roundsRef.current = rounds; }, [rounds]);
    useEffect(() => { takeProfitRef.current = takeProfit; }, [takeProfit]);
    useEffect(() => { stopLossRef.current = stopLoss; }, [stopLoss]);
    useEffect(() => { customLegsRef.current = customLegs; }, [customLegs]);

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
                switchMarketSymbols.length ? switchMarketSymbols.includes(market.symbol) : market.symbol === selectedMarket
            ),
        [markets, selectedMarket, switchMarketSymbols]
    );

    useEffect(() => {
        selectedMarketInfoRef.current = selectedMarketInfo || null;
    }, [selectedMarketInfo]);

    useEffect(() => {
        martingaleRef.current = martingale;
    }, [martingale]);

    useEffect(() => {
        entryPointRef.current = entryPoint;
    }, [entryPoint]);

    const ensureTradingApi = useCallback(async (forceReconnect = false) => {
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
    }, [hasRecoverableSession]);

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
                        : orderedMarkets.find(market => market.symbol === '1HZ10V')?.symbol || orderedMarkets[0]?.symbol || previous
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

    const waitForSettlement = (api: ApiLike, contractId: number, onUpdate: (contract: any) => void): Promise<number> => {
        return new Promise((resolve, reject) => {
            let cleanup = null;
            let resolved = false;
            subscribeToContract(
                api,
                contractId,
                (contract) => {
                    onUpdate(contract);
                    const status = contract.status;
                    if (!resolved && (status === 'won' || status === 'lost')) {
                        resolved = true;
                        if (cleanup) cleanup();
                        resolve(Number(contract.profit || 0));
                    }
                },
                (errorMsg) => {
                    if (!resolved) {
                        resolved = true;
                        if (cleanup) cleanup();
                        reject(new Error(errorMsg));
                    }
                }
            ).then(fn => {
                cleanup = fn;
                if (resolved) cleanup();
            }).catch(reject);
        });
    };

    const runFlipperLoop = async () => {
        let currentStakeOne = toPositiveNumber(stakeOne, 0);
        let currentStakeTwo = toPositiveNumber(stakeTwo, 0);
        baseStakeOneRef.current = currentStakeOne;
        baseStakeTwoRef.current = currentStakeTwo;

        let currentLossStreak = 0;
        let currentRunCount = 0;
        let currentSessionPnl = 0;

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
                    return prev.map(p => p.contractId === contract.contract_id ? {
                        ...p,
                        entrySpot: contract.entry_tick_display_value || contract.entry_tick || p.entrySpot,
                        exitSpot: contract.exit_tick_display_value || contract.exit_tick || (isSettled ? liveContract.current_spot_display_value || liveContract.current_spot : p.exitSpot),
                        profit: contract.profit != null ? Number(contract.profit) : p.profit,
                        status: isSettled ? 'closed' : 'live'
                    } : p);
                } else {
                    return [...prev, {
                        buyPrice: contract.buy_price,
                        contractId: contract.contract_id,
                        contractType: contract.contract_type,
                        entrySpot: contract.entry_tick_display_value || contract.entry_tick,
                        exitSpot: contract.exit_tick_display_value || contract.exit_tick || liveContract.current_spot_display_value || liveContract.current_spot,
                        label: activeLegs[legIndex].label,
                        legIndex,
                        market: contract.underlying,
                        profit: Number(contract.profit || 0),
                        runId: currentRunIdRef.current,
                        stake: contract.buy_price,
                        status: isSettled ? 'closed' : 'live'
                    }];
                }
            });
        };

        const waitForEntryTrigger = async (marketSymbol: string, api: ApiLike) => {
            const hasEntryDigit = entryPointRef.current !== '';
            if (!hasEntryDigit) {
                if (!turboRef.current) await new Promise(r => setTimeout(r, 500));
                return;
            }

            return new Promise<void>((resolve) => {
                let sub;
                sub = api.onMessage().subscribe((message) => {
                    const data = normalizeApiMessage(message);
                    if (data.msg_type === 'tick' && data.tick?.symbol === marketSymbol) {
                        const digit = getLastDigit(data.tick.quote);
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

            const api = await ensureTradingApi();
            if (!api) {
                setIsRunning(false);
                runningRef.current = false;
                break;
            }

            const marketCandidates = switchMarketRef.current && switchMarketSymbolsRef.current.length > 0 
                ? selectedSwitchMarkets : [selectedMarketInfoRef.current];
            const currentMarketIndex = marketCandidates.findIndex(m => m.symbol === selectedMarketInfoRef.current.symbol);
            const orderedCandidates = [
                ...marketCandidates.slice(Math.max(currentMarketIndex, 0)),
                ...marketCandidates.slice(0, Math.max(currentMarketIndex, 0)),
            ];

            await waitForEntryTrigger(orderedCandidates[0].symbol, api);
            if (!runningRef.current) break;

            const duration = turboRef.current ? 1 : toPositiveInteger(durationTicksRef.current, 1);
            const firstDuration = getDurationForLeg(activeLegs[0], duration);
            const secondDuration = getDurationForLeg(activeLegs[1], duration);
            const predOne = Math.max(0, Math.min(9, Math.trunc(Number(predictionOneRef.current || entryPointRef.current || 0))));
            const predTwo = Math.max(0, Math.min(9, Math.trunc(Number(predictionTwoRef.current || entryPointRef.current || 0))));

            let quoteBundle = null;
            for (const marketInfo of orderedCandidates) {
                try {
                    const [firstQuote, secondQuote] = await Promise.all([
                        requestQuote(api, createProposalPayload({ amount: currentStakeOne, contractType: activeLegs[0].contractType, currency, duration: firstDuration, prediction: predOne, predictionMode: activeLegs[0].predictionMode, symbol: marketInfo.symbol })),
                        requestQuote(api, createProposalPayload({ amount: currentStakeTwo, contractType: activeLegs[1].contractType, currency, duration: secondDuration, prediction: predTwo, predictionMode: activeLegs[1].predictionMode, symbol: marketInfo.symbol }))
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
            let firstId, secondId;
            try {
                const [b1, b2] = await Promise.all([
                    buyQuote(api, quoteBundle.firstQuote.proposalId, quoteBundle.firstQuote.askPrice),
                    buyQuote(api, quoteBundle.secondQuote.proposalId, quoteBundle.secondQuote.askPrice)
                ]);
                firstId = b1.contract_id;
                secondId = b2.contract_id;
            } catch (err) {
                setFeedback('Buy failed: ' + (err.message || String(err)));
                break;
            }

            const [p1, p2] = await Promise.all([
                waitForSettlement(api, firstId, (c) => updatePositionsUi(c, 0, activeLegs)),
                waitForSettlement(api, secondId, (c) => updatePositionsUi(c, 1, activeLegs))
            ]);

            const netProfit = p1 + p2;
            currentSessionPnl = Number((currentSessionPnl + netProfit).toFixed(2));
            currentRunCount++;
            
            const lostBatch = netProfit <= 0;
            const lostAnyLeg = p1 < 0 || p2 < 0;

            if (lostBatch) {
                currentLossStreak++;
                const multiplier = toPositiveNumber(martingaleRef.current, 1);
                const normMult = normalizeMartingaleMultiplier(multiplier, 1);
                currentStakeOne = roundMartingaleStake(currentStakeOne * normMult);
                currentStakeTwo = roundMartingaleStake(currentStakeTwo * normMult);
            } else {
                currentLossStreak = 0;
                currentStakeOne = baseStakeOneRef.current;
                currentStakeTwo = baseStakeTwoRef.current;
            }

            console.info('[FLIPPER]', 'stakeOne=', currentStakeOne, 'stakeTwo=', currentStakeTwo, 'netProfit=', netProfit);
            
            setStakeOne(roundStakeValue(currentStakeOne));
            setStakeTwo(roundStakeValue(currentStakeTwo));
            setStats(prev => ({
                lost: prev.lost + (lostBatch ? 1 : 0),
                runs: currentRunCount,
                totalPnl: currentSessionPnl,
                won: prev.won + (!lostBatch ? 1 : 0),
            }));

            if (switchOnLossRef.current && lostAnyLeg && currentLossStreak >= toPositiveInteger(lossesToSwitchRef.current, 1)) {
                currentLossStreak = 0;
                setCustomLegs(prev => {
                    const currentPairKey = getPairKeyFromLegs(prev);
                    if (currentPairKey === "custom" || currentPairKey === "none") return prev;
                    return STRATEGY_PAIRS.find(pair => pair.key === getNextPairKey(currentPairKey))?.legs || STRATEGY_PAIRS[0].legs;
                });
            }

            if (switchMarketRef.current && lostAnyLeg && orderedCandidates.length > 1) {
                const nextMarket = orderedCandidates[1];
                selectedMarketInfoRef.current = nextMarket;
                setSelectedMarket(nextMarket.symbol);
            }

            const maxR = toPositiveInteger(roundsRef.current, 0);
            const tp = toPositiveNumber(takeProfitRef.current);
            const sl = toPositiveNumber(stopLossRef.current);
            if ((maxR > 0 && currentRunCount >= maxR) || (tp > 0 && currentSessionPnl >= tp) || (sl > 0 && currentSessionPnl <= -sl)) {
                setFeedback('Limit reached. Stopped.');
                break;
            }
        }
        
        setIsRunning(false);
        runningRef.current = false;
    };

    const handleRun = () => {
        if (isRunning) {
            runningRef.current = false;
            setIsRunning(false);
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
        if (entryPoint !== '') {
            waitingForEntryDigitRef.current = true;
            setFeedback(localize('Waiting for entry digit to appear...'));
        } else {
            void runFlipperLoop();
        }
    };

    useEffect(() => {
        emitProfitdockTradeStatus({
            canStop: isRunning,
            feature: 'flipper',
            label: isRunning ? localize('Market Flipper running') : localize('Market Flipper stopped'),
            running: isRunning,
        });
    }, [isRunning]);

    useEffect(
        () =>
            subscribeProfitdockTradeStop(request => {
                if (request.feature && request.feature !== 'flipper') return;

                runningRef.current = false;
                setIsRunning(false);
                setFeedback(localize('Flipper Switcher will stop after the current contracts settle.'));
            }),
        []
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
            <div className='flipper-page__header'>
                <div className='flipper-page__title-card'>
                    <MarketIcon type={selectedMarketInfo?.symbol || selectedMarket} size='md' />
                    <strong>{localize('Market Flipper')}</strong>
                    <MarketIcon type={selectedMarketInfo?.symbol || selectedMarket} size='md' />
                </div>
            </div>

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

            <section className='flipper-page__active-card'>
                <h2>{localize('Active strategies (switch-on-loss - {{ losses }} loss)', { losses: lossesToSwitch || '1' })}</h2>
                {selectedPair.legs.map((leg, index) => (
                    <div className='flipper-page__active-row' key={leg?.contractType || `empty-${index}`}>
                        <strong>#{index + 1} - {leg?.label || localize('Select contract')}</strong>
                        <label>
                            {localize('Stake')}
                            <input
                                value={index === 0 ? stakeOne : stakeTwo}
                                onChange={event => (index === 0 ? setStakeOne(event.target.value) : setStakeTwo(event.target.value))}
                                inputMode='decimal'
                            />
                        </label>
                        <label>
                            {localize('Pred')}
                            <input
                                value={index === 0 ? predictionOne : predictionTwo}
                                onChange={event => (index === 0 ? setPredictionOne(event.target.value) : setPredictionTwo(event.target.value))}
                                inputMode='numeric'
                                disabled={!leg?.predictionMode}
                            />
                        </label>
                    </div>
                ))}
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
                <label className='flipper-page__field flipper-page__field--wide'>
                    {localize('Martingale x')}
                    <input value={martingale} onChange={event => setMartingale(event.target.value)} inputMode='decimal' />
                </label>
                <label className='flipper-page__field'>
                    {localize('Ticks')}
                    <input value={durationTicks} onChange={event => setDurationTicks(event.target.value)} inputMode='numeric' />
                </label>
                <label className='flipper-page__field flipper-page__field--wide'>
                    {localize('Entry Point (digit)')}
                    <input value={entryPoint} onChange={event => setEntryPoint(event.target.value)} inputMode='numeric' />
                </label>
                <button
                    type='button'
                    className={`flipper-page__toggle ${switchMarket ? 'flipper-page__toggle--on' : ''}`}
                    onClick={() => {
                        setSwitchMarket(true);
                        setIsSwitchMarketPickerOpen(true);
                    }}
                >
                    {localize('Switch Mark\'t')}: {switchMarket ? `${switchMarketCount} ${localize('market(s)')}` : 'OFF'}
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
                    <input value={lossesToSwitch} onChange={event => setLossesToSwitch(event.target.value)} inputMode='numeric' />
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
                    <input value={takeProfit} onChange={event => setTakeProfit(event.target.value)} inputMode='decimal' />
                </label>
                <label className='flipper-page__field'>
                    {localize('Stop Loss ($)')}
                    <input value={stopLoss} onChange={event => setStopLoss(event.target.value)} inputMode='decimal' />
                </label>
                <button type='button' className='flipper-page__run' onClick={handleRun}>
                    <span className='flipper-page__play' />
                    {isRunning ? localize('Stop') : localize('Run')}
                </button>
                <div className={`flipper-page__status ${isRunning ? 'flipper-page__status--on' : ''}`}>{isRunning ? 'ON' : 'OFF'}</div>

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
                                <span>{position.buyPrice.toFixed(2)} - {formatMoney(position.profit, currency)}</span>
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
                                <span>{localize('Switch Mark\'t')}</span>
                                <h3>{localize('Markets used after loss threshold')}</h3>
                            </div>
                            <button type='button' onClick={() => setIsSwitchMarketPickerOpen(false)} aria-label={localize('Close')}>
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
                                        className={isSelected ? 'flipper-page__market-row flipper-page__market-row--selected' : 'flipper-page__market-row'}
                                        onClick={() => {
                                            setSwitchMarket(true);
                                            setSwitchMarketSymbols(previous => toggleMarketSymbol(previous, market.symbol));
                                        }}
                                    >
                                        <span className='flipper-page__market-check'>{isSelected ? localize('On') : ''}</span>
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

export default FlipperSwitcherPage;

