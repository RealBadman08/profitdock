import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateAnalytics } from './analytics';
import {
    buildTickEntry,
    clampTickCount,
    formatQuote,
    getOrderedRequiredMarkets,
    getPipSizeForSymbol,
    normalizeApiMessage,
} from './api';
import { MAX_TICK_BUFFER } from './constants';
import { MarketSymbol, TickEntry, TickFeedState } from './types';

type UseLiveTickFeedOptions = {
    analysisDigit: number;
    symbol: string;
    tickCount: number;
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

const DERIV_OPTIONS_PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';

const INITIAL_STATE: TickFeedState = {
    isLoading: true,
    isConnected: false,
    error: null,
    ticks: [],
    currentPrice: null,
    previousPrice: null,
    priceDisplay: '--',
    priceDelta: 0,
    priceDeltaPercent: 0,
    pipSize: 2,
    analytics: null,
};

const createFeedState = (
    buffer: TickEntry[],
    tickCount: number,
    analysisDigit: number,
    pipSize: number,
    isLoading: boolean,
    isConnected: boolean,
    error: string | null
): TickFeedState => {
    const currentPrice = buffer[buffer.length - 1]?.quote ?? null;
    const previousPrice = buffer[buffer.length - 2]?.quote ?? null;
    const visibleTicks = buffer.slice(-clampTickCount(tickCount));
    const priceDelta = currentPrice !== null && previousPrice !== null ? currentPrice - previousPrice : 0;
    const priceDeltaPercent = previousPrice ? (priceDelta / previousPrice) * 100 : 0;

    return {
        isLoading,
        isConnected,
        error,
        ticks: buffer,
        currentPrice,
        previousPrice,
        priceDisplay: formatQuote(currentPrice, pipSize),
        priceDelta,
        priceDeltaPercent,
        pipSize,
        analytics: calculateAnalytics(visibleTicks, analysisDigit),
    };
};

export const useLiveTickFeed = ({ analysisDigit, symbol, tickCount }: UseLiveTickFeedOptions) => {
    const [buffer, setBuffer] = useState<TickEntry[]>([]);
    const [markets, setMarkets] = useState<MarketSymbol[]>(() => getOrderedRequiredMarkets([]));
    const [pipSize, setPipSize] = useState(2);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const tickSubscriptionIdRef = useRef<string | null>(null);
    const currentSymbolRef = useRef(symbol);

    useEffect(() => {
        currentSymbolRef.current = symbol;
    }, [symbol]);

    useEffect(() => {
        setMarkets(getOrderedRequiredMarkets([]));
    }, []);

    useEffect(() => {
        if (!symbol) {
            return undefined;
        }

        let isCancelled = false;
        let socket: WebSocket | null = null;
        let hasRequestedStream = false;
        let timeoutId: number | undefined;

        const send = (payload: Record<string, unknown>) => {
            if (socket?.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(payload));
            }
        };

        const clearConnectionTimeout = () => {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
                timeoutId = undefined;
            }
        };

        const handleHistory = (data: TickHistoryResponse) => {
            const nextPipSize = getPipSizeForSymbol({}, currentSymbolRef.current);
            const historyTicks =
                data.history?.times?.map((epoch, index) =>
                    buildTickEntry(Number(data.history?.prices?.[index] ?? 0), epoch, nextPipSize)
                ) ?? [];

            if (!isCancelled) {
                setPipSize(nextPipSize);
                setBuffer(historyTicks);
                setIsConnected(historyTicks.length > 0);
                setIsLoading(false);
                setError(null);
            }
        };

        const handleTick = (data: TickStreamResponse) => {
            if (!data || data.msg_type !== 'tick' || data.tick?.symbol !== currentSymbolRef.current) {
                return;
            }

            const nextPipSize =
                typeof data.tick.pip_size === 'number'
                    ? data.tick.pip_size
                    : getPipSizeForSymbol({}, currentSymbolRef.current);
            const nextTick = buildTickEntry(data.tick.quote, data.tick.epoch, nextPipSize);

            if (data.subscription?.id) {
                tickSubscriptionIdRef.current = data.subscription.id;
            }

            if (isCancelled) {
                return;
            }

            setPipSize(nextPipSize);
            setBuffer(previous => [...previous, nextTick].slice(-MAX_TICK_BUFFER));
            setIsConnected(true);
            setIsLoading(false);
            setError(null);
        };

        const openPublicTickSocket = () => {
            setIsLoading(true);
            setError(null);
            setIsConnected(false);
            setBuffer([]);
            tickSubscriptionIdRef.current = null;

            socket = new WebSocket(DERIV_OPTIONS_PUBLIC_WS_URL);
            timeoutId = window.setTimeout(() => {
                if (!isCancelled) {
                    setIsLoading(false);
                    setIsConnected(false);
                    setError('Unable to open the live tick feed.');
                }
                socket?.close();
            }, 20000);

            socket.onopen = () => {
                send({
                    adjust_start_time: 1,
                    count: MAX_TICK_BUFFER,
                    end: 'latest',
                    start: 1,
                    style: 'ticks',
                    ticks_history: symbol,
                });
            };

            socket.onmessage = event => {
                const data = normalizeApiMessage<TickHistoryResponse & TickStreamResponse>(
                    JSON.parse(String(event.data))
                );

                if (!data) {
                    return;
                }

                if (data.error) {
                    clearConnectionTimeout();
                    if (!isCancelled) {
                        setIsLoading(false);
                        setIsConnected(false);
                        setError(data.error.message || 'Unable to open the live tick feed.');
                    }
                    return;
                }

                if (data.msg_type === 'history' || data.history) {
                    clearConnectionTimeout();
                    handleHistory(data);

                    if (!hasRequestedStream) {
                        hasRequestedStream = true;
                        send({
                            subscribe: 1,
                            ticks: symbol,
                        });
                    }
                    return;
                }

                handleTick(data);
            };

            socket.onerror = () => {
                clearConnectionTimeout();
                if (!isCancelled) {
                    setIsLoading(false);
                    setIsConnected(false);
                    setError('Unable to open the live tick feed.');
                }
            };

            socket.onclose = () => {
                clearConnectionTimeout();
                if (!isCancelled && !tickSubscriptionIdRef.current) {
                    setIsConnected(false);
                }
            };
        };

        openPublicTickSocket();

        return () => {
            isCancelled = true;
            clearConnectionTimeout();
            if (socket?.readyState === WebSocket.OPEN && tickSubscriptionIdRef.current) {
                send({ forget: tickSubscriptionIdRef.current });
            }
            socket?.close();
        };
    }, [symbol]);

    const state = useMemo(
        () => createFeedState(buffer, tickCount, analysisDigit, pipSize, isLoading, isConnected, error),
        [analysisDigit, buffer, error, isConnected, isLoading, pipSize, tickCount]
    );

    return {
        ...INITIAL_STATE,
        ...state,
        markets,
    };
};
