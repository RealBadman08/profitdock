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

    const pushContract = useCallback(
        (contract: ProposalOpenContract) => {
            const liveContract = contract as ProposalOpenContract & {
                current_spot?: number | string;
                current_spot_display_value?: number | string;
            };
            transactions.pushTransaction({
                ...(contract as ProposalOpenContract),
                accountID: getActiveTransactionAccountId(),
            } as ProposalOpenContract);
            setPositions(previous =>
                previous.map(position =>
                    position.contractId === contract.contract_id
                        ? {
                              ...position,
                              entrySpot:
                                  contract.entry_tick_display_value ||
                                  contract.entry_tick ||
                                  position.entrySpot,
                              exitSpot:
                                  contract.exit_tick_display_value ||
                                  contract.exit_tick ||
                                  (contract.is_sold
                                      ? liveContract.current_spot_display_value || liveContract.current_spot
                                      : position.exitSpot),
                              profit: contract.profit != null ? Number(contract.profit) : position.profit,
                              status: contract.is_sold ? 'closed' : 'live',
                          }
                        : position
                )
            );

            if (contract.is_sold) {
                cleanupRef.current.get(contract.contract_id)?.();
                cleanupRef.current.delete(contract.contract_id);
            }
        },
        [transactions]
    );

    const monitorContract = useCallback(
        async (api: ApiLike, position: FlipperPosition) => {
            const cleanup = await subscribeToContract(
                api,
                position.contractId,
                pushContract,
                message => {
                    setPositions(previous =>
                        previous.map(item =>
                            item.contractId === position.contractId
                                ? {
                                      ...item,
                                      status: 'error',
                                  }
                                : item
                        )
                    );
                    setFeedback(message);
                }
            );
            cleanupRef.current.set(position.contractId, cleanup);
        },
        [pushContract]
    );

    const executePair = useCallback(async () => {
        const baseMarketInfo = selectedMarketInfoRef.current || selectedMarketInfo;
        const activeLegs = selectedLegs;

        if (batchInFlightRef.current || !baseMarketInfo) {
            return;
        }

        if (!activeLegs) {
            setFeedback(localize('Select two contracts before running Flipper Switcher.'));
            setIsRunning(false);
            runningRef.current = false;
            return;
        }

        const api = await ensureTradingApi();
        if (!api) {
            setFeedback(
                hasRecoverableSession()
                    ? localize('ProfitDock is still reconnecting to your Deriv trading session. Please try again in a moment.')
                    : localize('Log in to a Deriv account before running Flipper Switcher.')
            );
            setIsRunning(false);
            runningRef.current = false;
            return;
        }

        const configuredStakeOne = toPositiveNumber(stakeOne, 0);
        const configuredStakeTwo = toPositiveNumber(stakeTwo, 0);
        // Read stakes directly from refs — updated by the positions effect after each win/loss
        const amountOne = runningRef.current
            ? (stakeOneRef.current || configuredStakeOne)
            : configuredStakeOne;
        const amountTwo = runningRef.current
            ? (stakeTwoRef.current || configuredStakeTwo)
            : configuredStakeTwo;

        console.info(
            '[FLIPPER_TRADE]',
            'runningRef=', runningRef.current,
            'configuredStakeOne=', configuredStakeOne,
            'configuredStakeTwo=', configuredStakeTwo,
            'amountOne=', amountOne,
            'amountTwo=', amountTwo,
            'stakeOneRef=', stakeOneRef.current,
            'stakeTwoRef=', stakeTwoRef.current
        );

        const duration = turbo ? 1 : toPositiveInteger(durationTicks, 1);
        const predOne = Math.max(0, Math.min(9, Math.trunc(Number(predictionOne || entryPoint || 0))));
        const predTwo = Math.max(0, Math.min(9, Math.trunc(Number(predictionTwo || entryPoint || 0))));
        const [firstLeg, secondLeg] = activeLegs;
        const firstDuration = getDurationForLeg(firstLeg, duration);
        const secondDuration = getDurationForLeg(secondLeg, duration);

        if (amountOne <= 0 || amountTwo <= 0) {
            setFeedback(localize('Enter a stake for both selected contracts before running Flipper Switcher.'));
            setIsRunning(false);
            runningRef.current = false;
            return;
        }

        batchInFlightRef.current = true;
        setFeedback(localize('Requesting live quotes for both opposite contracts...'));

        try {
            const switchMarkets = selectedSwitchMarkets.length ? selectedSwitchMarkets : [baseMarketInfo];
            const currentMarketIndex = switchMarkets.findIndex(market => market.symbol === baseMarketInfo.symbol);
            const marketCandidates =
                switchMarket && switchMarkets.length > 1
                    ? [
                          ...switchMarkets.slice(Math.max(currentMarketIndex, 0)),
                          ...switchMarkets.slice(0, Math.max(currentMarketIndex, 0)),
                      ].filter(
                          (market, index, list) =>
                              market.symbol &&
                              list.findIndex(candidate => candidate.symbol === market.symbol) === index
                      )
                    : [baseMarketInfo];
            let quoteBundle:
                | {
                      firstQuote: Awaited<ReturnType<typeof requestQuote>>;
                      marketInfo: MarketSymbol;
                      secondQuote: Awaited<ReturnType<typeof requestQuote>>;
                  }
                | null = null;
            let lastQuoteError: unknown = null;

            for (const marketInfo of marketCandidates) {
                try {
                    const [firstQuote, secondQuote] = await Promise.all([
                        requestQuote(
                            api,
                            createProposalPayload({
                                amount: amountOne,
                                contractType: firstLeg.contractType,
                                currency,
                                duration: firstDuration,
                                prediction: predOne,
                                predictionMode: firstLeg.predictionMode,
                                symbol: marketInfo.symbol,
                            })
                        ),
                        requestQuote(
                            api,
                            createProposalPayload({
                                amount: amountTwo,
                                contractType: secondLeg.contractType,
                                currency,
                                duration: secondDuration,
                                prediction: predTwo,
                                predictionMode: secondLeg.predictionMode,
                                symbol: marketInfo.symbol,
                            })
                        ),
                    ]);

                    quoteBundle = {
                        firstQuote,
                        marketInfo,
                        secondQuote,
                    };
                    break;
                } catch (quoteError) {
                    lastQuoteError = quoteError;

                    if (!switchMarket || marketCandidates.length <= 1) {
                        throw quoteError;
                    }

                    setFeedback(
                        localize('{{ market }} is not available for this pair. Checking the next market...', {
                            market: marketInfo.display_name || marketInfo.symbol,
                        })
                    );
                }
            }

            if (!quoteBundle) {
                throw lastQuoteError instanceof Error
                    ? lastQuoteError
                    : new Error('No supported market is available for this Flipper pair right now.');
            }

            let { firstQuote, marketInfo, secondQuote } = quoteBundle;

            if (marketInfo.symbol !== selectedMarket) {
                selectedMarketInfoRef.current = marketInfo;
                setSelectedMarket(marketInfo.symbol);
            }

            setFeedback(localize('Quotes ready. Sending both buys now...'));
            let tradeApi = api;
            let firstBuy: Awaited<ReturnType<typeof buyQuote>>;
            let secondBuy: Awaited<ReturnType<typeof buyQuote>>;

            try {
                [firstBuy, secondBuy] = await Promise.all([
                    buyQuote(tradeApi, firstQuote.proposalId, firstQuote.askPrice),
                    buyQuote(tradeApi, secondQuote.proposalId, secondQuote.askPrice),
                ]);
            } catch (buyError) {
                if (!isRecoverableFlipperAuthError(buyError)) {
                    throw buyError;
                }

                setFeedback(localize('Refreshing Deriv trading session and retrying both buys...'));
                const refreshedApi = await ensureTradingApi(true);

                if (!refreshedApi) {
                    throw buyError;
                }

                tradeApi = refreshedApi;
                [firstQuote, secondQuote] = await Promise.all([
                    requestQuote(
                        tradeApi,
                        createProposalPayload({
                            amount: amountOne,
                            contractType: firstLeg.contractType,
                            currency,
                            duration: firstDuration,
                            prediction: predOne,
                            predictionMode: firstLeg.predictionMode,
                            symbol: marketInfo.symbol,
                        })
                    ),
                    requestQuote(
                        tradeApi,
                        createProposalPayload({
                            amount: amountTwo,
                            contractType: secondLeg.contractType,
                            currency,
                            duration: secondDuration,
                            prediction: predTwo,
                            predictionMode: secondLeg.predictionMode,
                            symbol: marketInfo.symbol,
                        })
                    ),
                ]);
                [firstBuy, secondBuy] = await Promise.all([
                    buyQuote(tradeApi, firstQuote.proposalId, firstQuote.askPrice),
                    buyQuote(tradeApi, secondQuote.proposalId, secondQuote.askPrice),
                ]);
            }

            const runId = currentRunIdRef.current + 1;
            currentRunIdRef.current = runId;
            processedRunIdsRef.current.delete(runId);

            const openedPositions: FlipperPosition[] = [
                {
                    buyPrice: firstBuy.buy_price || amountOne,
                    contractId: firstBuy.contract_id as number,
                    contractType: firstLeg.contractType,
                    entrySpot: firstQuote.spot,
                    label: firstLeg.label,
                    legIndex: 0,
                    market: marketInfo.symbol,
                    profit: 0,
                    runId,
                    stake: amountOne,
                    status: 'live',
                },
                {
                    buyPrice: secondBuy.buy_price || amountTwo,
                    contractId: secondBuy.contract_id as number,
                    contractType: secondLeg.contractType,
                    entrySpot: secondQuote.spot,
                    label: secondLeg.label,
                    legIndex: 1,
                    market: marketInfo.symbol,
                    profit: 0,
                    runId,
                    stake: amountTwo,
                    status: 'live',
                },
            ];

            setPositions(openedPositions);
            setFeedback(localize('Both opposite contracts are live.'));

            openedPositions.forEach(position => {
                const buy = position.legIndex === 0 ? firstBuy : secondBuy;
                const quote = position.legIndex === 0 ? firstQuote : secondQuote;

                transactions.pushTransaction({
                    accountID: getActiveTransactionAccountId(),
                    buy_price: position.buyPrice,
                    contract_id: position.contractId,
                    contract_type: position.contractType,
                    currency,
                    date_start: Math.floor(Date.now() / 1000),
                    display_name: marketInfo.display_name,
                    entry_tick: position.entrySpot,
                    is_completed: false,
                    longcode: buy.longcode || quote.longcode,
                    profit: 0,
                    transaction_ids: {
                        buy: buy.transaction_id || buy.contract_id,
                    },
                    underlying: marketInfo.symbol,
                    underlying_symbol: marketInfo.symbol,
                } as ProposalOpenContract);
                void monitorContract(tradeApi, position);
            });
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Flipper Switcher could not place the contracts.');
            setIsRunning(false);
            runningRef.current = false;
        } finally {
            batchInFlightRef.current = false;
        }
    }, [
        currency,
        durationTicks,
        ensureTradingApi,
        entryPoint,
        hasRecoverableSession,
        markets,
        monitorContract,
        predictionOne,
        predictionTwo,
        selectedMarket,
        selectedMarketInfo,
        selectedLegs,
        selectedSwitchMarkets,
        stakeOne,
        stakeTwo,
        switchMarket,
        turbo,
        transactions,
    ]);

    useEffect(() => {
        executePairRef.current = executePair;
    });

    // Entry Digit timing gate — subscribe to ticks and fire when last digit matches
    useEffect(() => {
        if (!isRunning || entryPointRef.current === '') return;

        const market = selectedMarketInfoRef.current || selectedMarketInfo;
        if (!market) return;

        let cancelled = false;
        let subscriptionId: string | null = null;
        let messageSub: { unsubscribe: () => void } | null = null;

        const setup = async () => {
            const api = await ensureTradingApi();
            if (cancelled || !api) return;

            messageSub = api.onMessage().subscribe((message: unknown) => {
                const data = normalizeApiMessage<{ msg_type?: string; tick?: { quote: number; symbol: string } }>(message);
                if (data.msg_type !== 'tick' || !data.tick || data.tick.symbol !== market.symbol) return;

                const digit = getLastDigit(data.tick.quote);
                const target = Math.max(0, Math.min(9, Math.trunc(Number(entryPointRef.current) || 0)));

                if (
                    entryPointRef.current !== '' &&
                    digit === target &&
                    waitingForEntryDigitRef.current &&
                    runningRef.current &&
                    !batchInFlightRef.current
                ) {
                    waitingForEntryDigitRef.current = false;
                    console.info('[FLIPPER_ENTRY_DIGIT]', 'Matched! digit=', digit, 'target=', target, 'quote=', data.tick.quote);
                    void executePairRef.current?.();
                }
            });

            try {
                const response = normalizeApiMessage<{ subscription?: { id?: string }; error?: { message?: string } }>(
                    await api.send({ subscribe: 1, ticks: market.symbol })
                );
                if (!cancelled && response?.subscription?.id) subscriptionId = response.subscription.id;
            } catch {
                // Will retry on next effect run
            }
        };

        void setup();

        return () => {
            cancelled = true;
            messageSub?.unsubscribe();
            if (subscriptionId) {
                const api = getDerivApi();
                if (api) void api.send({ forget: subscriptionId }).catch(() => undefined);
            }
        };
    }, [isRunning, selectedMarket, entryPoint, ensureTradingApi, selectedMarketInfo]);

    useEffect(() => {
        if (!positions.length) {
            return;
        }

        const runId = Math.max(...positions.map(position => position.runId || 0));
        const batchPositions = positions.filter(position => position.runId === runId);

        if (
            !runId ||
            batchPositions.length !== 2 ||
            batchPositions.some(position => position.status === 'live') ||
            processedRunIdsRef.current.has(runId)
        ) {
            return;
        }

        processedRunIdsRef.current.add(runId);

        const firstLegResult = batchPositions.find(position => position.legIndex === 0);
        const secondLegResult = batchPositions.find(position => position.legIndex === 1);
        const batchPnl = batchPositions.reduce((sum, position) => sum + position.profit, 0);
        const lostBatch = batchPnl < 0;
        const lostAnyLeg = batchPositions.some(position => position.profit < 0);
        const lossSwitchThreshold = toPositiveInteger(lossesToSwitch, 1);
        // Always read the latest martingale multiplier from the ref to avoid stale closure
        const martingaleMultiplier = toPositiveNumber(martingaleRef.current, 1);
        lossStreakRef.current = lostAnyLeg ? lossStreakRef.current + 1 : 0;
        runCountRef.current += 1;
        sessionPnlRef.current = Number((sessionPnlRef.current + batchPnl).toFixed(2));
        const completedRuns = runCountRef.current;
        const sessionPnl = sessionPnlRef.current;

        setStats(previous => ({
            lost: previous.lost + (lostBatch ? 1 : 0),
            runs: completedRuns,
            totalPnl: sessionPnl,
            won: previous.won + (batchPnl >= 0 ? 1 : 0),
        }));

        const stakeOneBefore = stakeOneRef.current || baseStakeOneRef.current;
        const stakeTwoBefore = stakeTwoRef.current || baseStakeTwoRef.current;
        const normalizedMultiplier = normalizeMartingaleMultiplier(martingaleMultiplier, 1);
        
        const firstLegLoss = firstLegResult ? firstLegResult.profit < 0 : false;
        const secondLegLoss = secondLegResult ? secondLegResult.profit < 0 : false;
        
        const nextStakeOne = firstLegLoss
            ? roundMartingaleStake(stakeOneBefore * normalizedMultiplier)
            : roundMartingaleStake(baseStakeOneRef.current);
        const nextStakeTwo = secondLegLoss
            ? roundMartingaleStake(stakeTwoBefore * normalizedMultiplier)
            : roundMartingaleStake(baseStakeTwoRef.current);
        // Write back to refs so the next executePair picks up the updated stakes
        stakeOneRef.current = nextStakeOne;
        stakeTwoRef.current = nextStakeTwo;

        console.info(
            '[MARTINGALE]', 'flipper:pair',
            'batchPnl=', batchPnl,
            'firstLegLoss=', firstLegLoss, 'secondLegLoss=', secondLegLoss,
            'stakeOneBefore=', stakeOneBefore, 'stakeOneAfter=', nextStakeOne,
            'stakeTwoBefore=', stakeTwoBefore, 'stakeTwoAfter=', nextStakeTwo,
            'multiplier=', normalizedMultiplier
        );
        setStakeOne(roundStakeValue(nextStakeOne));
        setStakeTwo(roundStakeValue(nextStakeTwo));

        if (switchOnLoss && lostAnyLeg && lossStreakRef.current >= lossSwitchThreshold) {
            lossStreakRef.current = 0;
            setCustomLegs(previous => {
                const currentPairKey = getPairKeyFromLegs(previous);
                if (currentPairKey === 'custom' || currentPairKey === 'none') {
                    return previous;
                }
                const nextPairKey = getNextPairKey(currentPairKey);
                const nextPair = STRATEGY_PAIRS.find(pair => pair.key === nextPairKey) || STRATEGY_PAIRS[0];
                return nextPair.legs;
            });
        }

        if (switchMarket && lostAnyLeg) {
            const switchMarkets = selectedSwitchMarkets.length ? selectedSwitchMarkets : markets;
            if (!switchMarkets.length) return;

            setSelectedMarket(previous => {
                const index = switchMarkets.findIndex(market => market.symbol === previous);
                const nextMarket = switchMarkets[(index + 1) % switchMarkets.length];
                selectedMarketInfoRef.current = nextMarket || selectedMarketInfoRef.current;
                return nextMarket?.symbol || previous;
            });
        }

        currentRoundRef.current += 1;
        const maxRounds = toPositiveInteger(rounds, 0);
        const takeProfitLimit = toPositiveNumber(takeProfit);
        const stopLossLimit = toPositiveNumber(stopLoss);
        const reachedTakeProfit = takeProfitLimit > 0 && sessionPnl >= takeProfitLimit;
        const reachedStopLoss = stopLossLimit > 0 && sessionPnl <= -stopLossLimit;

        const reachedRoundLimit = maxRounds > 0 && currentRoundRef.current >= maxRounds;

        if (!runningRef.current || reachedRoundLimit || reachedTakeProfit || reachedStopLoss) {
            runningRef.current = false;
            setIsRunning(false);
            setFeedback(
                reachedTakeProfit
                    ? localize('Session take profit reached.')
                    : reachedStopLoss
                      ? localize('Session stop loss reached.')
                      : reachedRoundLimit
                        ? localize('Round limit reached.')
                        : localize('Flipper run completed.')
            );
            return;
        }

        const hasEntryDigit = entryPointRef.current !== '';
        if (hasEntryDigit) {
            // Entry digit gate active — wait for matching tick instead of firing immediately
            waitingForEntryDigitRef.current = true;
        } else {
            const delayMs = turbo ? 0 : 500;
            const timer = window.setTimeout(() => {
                void executePairRef.current?.();
            }, delayMs);
            return () => window.clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [positions]);

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
            void executePair();
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
                    martingaleStore.getState().reset(FLIPPER_MARTINGALE_FIRST_KEY);
                    martingaleStore.getState().reset(FLIPPER_MARTINGALE_SECOND_KEY);
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

