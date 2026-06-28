import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import {
    DEFAULT_MARKET_SYMBOL,
    MAX_TICK_BUFFER,
    REQUIRED_MARKET_FALLBACKS,
    REQUIRED_MARKET_ORDER,
    SUPPORTED_COPY_CONTRACTS,
} from './constants';
import { MarketSymbol, ProfitTableTrade, TickEntry } from './types';

type ApiMessageShape<T> = T & {
    echo_req?: {
        passthrough?: {
            streamKey?: string;
        };
    };
};

const REQUIRED_MARKET_SET = new Set(REQUIRED_MARKET_ORDER);
const EXCLUDED_MARKET_SUBMARKETS = new Set(['crash_index', 'range_index', 'step_index']);

export const isExcludedSyntheticMarket = (market: MarketSymbol) => {
    const displayName = market.display_name.toLowerCase();
    const submarket = market.submarket?.toLowerCase();

    return (
        EXCLUDED_MARKET_SUBMARKETS.has(submarket || '') ||
        displayName.includes('boom') ||
        displayName.includes('crash') ||
        displayName.includes('range') ||
        displayName.includes('step')
    );
};

export const clampTickCount = (value: number) => {
    if (!Number.isFinite(value)) {
        return MAX_TICK_BUFFER;
    }

    return Math.min(MAX_TICK_BUFFER, Math.max(1, Math.trunc(value)));
};

export const normalizeApiMessage = <T>(raw: unknown): ApiMessageShape<T> | null => {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }

    const wrapper = raw as { data?: unknown };

    if (typeof wrapper.data === 'object' && wrapper.data !== null) {
        return wrapper.data as ApiMessageShape<T>;
    }

    return raw as ApiMessageShape<T>;
};

export const getOrderedRequiredMarkets = (activeSymbols: MarketSymbol[]) => {
    const eligibleMarkets = activeSymbols.filter(symbol => REQUIRED_MARKET_SET.has(symbol.display_name));
    const fallbackMap = new Map(REQUIRED_MARKET_FALLBACKS.map(symbol => [symbol.display_name, symbol]));
    const marketMap = new Map([
        ...REQUIRED_MARKET_FALLBACKS.map(symbol => [symbol.display_name, symbol] as const),
        ...eligibleMarkets.map(symbol => [symbol.display_name, symbol] as const),
    ]);

    return REQUIRED_MARKET_ORDER.map(displayName => marketMap.get(displayName) || fallbackMap.get(displayName)).filter(
        Boolean
    ) as MarketSymbol[];
};

export const getMarketsWithoutStepBoomCrashRange = (activeSymbols: MarketSymbol[]) =>
    getOrderedRequiredMarkets(activeSymbols).filter(market => !isExcludedSyntheticMarket(market));

export const getDefaultMarketSymbol = (markets: MarketSymbol[]) => {
    return markets.find(market => market.symbol === DEFAULT_MARKET_SYMBOL)?.symbol ?? markets[0]?.symbol ?? DEFAULT_MARKET_SYMBOL;
};

export const getPipSizeForSymbol = (pipSizes: Record<string, number>, symbol: string) => {
    const value = pipSizes[symbol];

    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const fallback = REQUIRED_MARKET_FALLBACKS.find(market => market.symbol === symbol)?.pip;
    const parsedFallback = typeof fallback === 'number' ? fallback : Number(fallback);

    if (Number.isFinite(parsedFallback) && parsedFallback > 0) {
        return Math.max(0, Math.round(Math.abs(Math.log10(parsedFallback))));
    }

    return 2;
};

export const formatQuote = (quote: number | null | undefined, pipSize: number) => {
    if (typeof quote !== 'number' || Number.isNaN(quote)) {
        return '--';
    }

    return quote.toLocaleString('en-US', {
        minimumFractionDigits: pipSize,
        maximumFractionDigits: pipSize,
        useGrouping: false,
    });
};

export const getDigitFromQuote = (quote: number, pipSize: number) => {
    const formatted = quote.toFixed(pipSize);
    return Number(formatted[formatted.length - 1]);
};

export const buildTickEntry = (quote: number, epoch: number, pipSize: number): TickEntry => ({
    epoch,
    quote,
    displayQuote: formatQuote(quote, pipSize),
    digit: getDigitFromQuote(quote, pipSize),
});

export const formatSignedValue = (value: number, digits = 2) => {
    const formatted = Math.abs(value).toFixed(digits);
    return `${value >= 0 ? '+' : '-'}${formatted}`;
};

export const getProposalStreamKey = (contractType: string) => `proposal:${contractType}`;

export const createAuthorizedDerivClient = async (token: string) => {
    const api = generateDerivApiInstance() as {
        authorize: (apiToken: string) => Promise<{ authorize?: Record<string, unknown>; error?: { message?: string } }>;
        disconnect: () => void;
    };

    const response = await api.authorize(token);

    if (response?.error) {
        api.disconnect();
        throw new Error(response.error.message || 'Authorization failed.');
    }

    return {
        api,
        authorize: response.authorize,
    };
};

export const disposeDerivClient = (api: { disconnect: () => void } | null | undefined) => {
    api?.disconnect();
};

export const fetchProfitTable = async (api: {
    send: (payload: unknown) => Promise<{ profit_table?: { transactions?: ProfitTableTrade[] }; error?: { message?: string } }>;
}) => {
    const response = await api.send({
        profit_table: 1,
        description: 1,
        limit: 50,
        sort: 'DESC',
    });

    if (response?.error) {
        throw new Error(response.error.message || 'Unable to fetch performance history.');
    }

    return response?.profit_table?.transactions ?? [];
};

export const formatEpochTime = (epoch: number | null | undefined) => {
    if (!epoch) {
        return '--';
    }

    return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(new Date(epoch * 1000));
};

export const canMirrorContract = (contractType: string | null | undefined) => {
    return SUPPORTED_COPY_CONTRACTS.has(String(contractType ?? '').toUpperCase());
};

export const buildMirrorBuyPayload = (params: {
    contractType: string;
    symbol: string;
    amount: number;
    currency: string;
    tickCount?: number | null;
    barrier?: number | string | null;
}) => {
    const contractType = params.contractType.toUpperCase();

    if (!canMirrorContract(contractType) || !params.symbol || !params.amount || !params.currency) {
        return null;
    }

    if (!params.tickCount || params.tickCount <= 0) {
        return null;
    }

    const request: {
        buy: string;
        price: number;
        parameters: {
            amount: number;
            basis: 'stake';
            contract_type: string;
            currency: string;
            duration: number;
            duration_unit: 't';
            symbol: string;
            barrier?: number | string;
        };
    } = {
        buy: '1',
        price: params.amount,
        parameters: {
            amount: params.amount,
            basis: 'stake',
            contract_type: contractType,
            currency: params.currency,
            duration: params.tickCount,
            duration_unit: 't',
            symbol: params.symbol,
        },
    };

    if (
        ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(contractType) &&
        params.barrier !== undefined &&
        params.barrier !== null
    ) {
        request.parameters.barrier = params.barrier;
    }

    return request;
};
