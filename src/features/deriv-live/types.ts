export type Tone = 'emerald' | 'rose' | 'amber' | 'cyan' | 'violet' | 'slate';

export type MarketSymbol = {
    symbol: string;
    display_name: string;
    market: string;
    submarket: string;
    exchange_is_open?: 0 | 1;
    pip?: number | string;
};

export type TickEntry = {
    epoch: number;
    quote: number;
    displayQuote: string;
    digit: number;
};

export type SequenceTile = {
    id: string;
    label: string;
    tone: Tone;
};

export type ModuleSummary = {
    primaryLabel: string;
    primaryTone: Tone;
    primaryCount: number;
    primaryPercentage: number;
    secondaryLabel: string;
    secondaryTone: Tone;
    secondaryCount: number;
    secondaryPercentage: number;
    sequence: SequenceTile[];
    currentLabel: string;
    currentStreak: number;
    neutralLabel?: string;
    neutralCount?: number;
};

export type DigitStat = {
    digit: number;
    count: number;
    percentage: number;
};

export type AnalyticsSummary = {
    lastDigit: number;
    digitStats: DigitStat[];
    evenOdd: ModuleSummary;
    riseFall: ModuleSummary;
    overUnder: ModuleSummary;
    matchesDiffers: ModuleSummary;
    sampleSize: number;
    comparisonSampleSize: number;
    averagePrice: number;
    lowestPrice: number;
    highestPrice: number;
    range: number;
    standardDeviation: number;
    netChange: number;
    netChangePercent: number;
    tickRatePerMinute: number;
    latestDigits: number[];
    latestQuotes: TickEntry[];
    mostCommonDigits: DigitStat[];
    leastCommonDigits: DigitStat[];
};

export type TickFeedState = {
    isLoading: boolean;
    isConnected: boolean;
    error: string | null;
    ticks: TickEntry[];
    currentPrice: number | null;
    previousPrice: number | null;
    priceDisplay: string;
    priceDelta: number;
    priceDeltaPercent: number;
    pipSize: number;
    analytics: AnalyticsSummary | null;
};

export type ProposalSnapshot = {
    askPrice: number;
    payout: number;
    displayValue: string;
    proposalId: string;
    longcode?: string;
    spot?: number;
};

export type ProposalStreamState = {
    isLoading: boolean;
    error: string | null;
    subscriptionId?: string;
    proposal?: ProposalSnapshot;
};

export type TradeFamilyKey = 'rise_fall' | 'even_odd' | 'over_under' | 'match_diff';

export type TradeButtonConfig = {
    contractType: string;
    label: string;
    tone: Tone;
};

export type TradeFamilyConfig = {
    key: TradeFamilyKey;
    title: string;
    description: string;
    requiresBarrier: boolean;
    buttons: TradeButtonConfig[];
};

export type TokenConnectionState = {
    isConnecting: boolean;
    isConnected: boolean;
    error: string | null;
    loginid?: string;
    currency?: string;
    balance?: number;
    token?: string;
};

export type ProfitTableTrade = {
    contract_id: number | null;
    contract_type?: string;
    underlying_symbol?: string;
    buy_price: number;
    sell_price: number;
    payout: number;
    purchase_time: number;
    sell_time?: number | null;
    transaction_id: number;
    longcode?: string;
    shortcode?: string;
    duration_type?: string | null;
};

export type MirrorLogEntry = {
    id: string;
    timestamp: number;
    tone: Tone;
    title: string;
    detail: string;
};

export type MirroredTradeEntry = {
    leaderContractId: number;
    followerContractId?: number;
    leaderLoginId?: string;
    followerLoginId?: string;
    symbol: string;
    contractType: string;
    stake: number;
    status: 'queued' | 'mirrored' | 'skipped' | 'failed';
    reason?: string;
    openedAt: number;
};
