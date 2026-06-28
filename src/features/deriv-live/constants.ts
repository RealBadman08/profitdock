import { MarketSymbol, TradeFamilyConfig } from './types';

export const DEFAULT_MARKET_SYMBOL = 'R_100';
export const DEFAULT_TICK_COUNT = 1000;
export const DEFAULT_ANALYSIS_DIGIT = 5;
export const DEFAULT_TRADE_DURATION = 5;
export const DEFAULT_STAKE = '10';
export const MAX_TICK_BUFFER = 1000;
export const MAX_SEQUENCE_ITEMS = 12;

export const REQUIRED_MARKET_ORDER = [
    'Volatility 100 Index',
    'Volatility 100 (1s) Index',
    'Volatility 10 (1s) Index',
    'Volatility 10 Index',
    'Volatility 50 Index',
    'Volatility 25 (1s) Index',
    'Volatility 75 (1s) Index',
    'Volatility 75 Index',
    'Volatility 50 (1s) Index',
    'Volatility 25 Index',
    'Bear Market Index',
    'Jump 10 Index',
    'Bull Market Index',
    'Volatility 15 (1s) Index',
    'Jump 100 Index',
    'Volatility 30 (1s) Index',
    'Volatility 90 (1s) Index',
    'Step Index 100',
    'Jump 75 Index',
    'Jump 25 Index',
    'Jump 50 Index',
    'Step Index 500',
    'Boom 500 Index',
    'Crash 500 Index',
    'Boom 1000 Index',
    'Crash 1000 Index',
    'Step Index 200',
    'Step Index 300',
    'Step Index 400',
    'Boom 300 Index',
    'Crash 300 Index',
    'Crash 900 Index',
    'Crash 600 Index',
    'Boom 600 Index',
    'Boom 900 Index',
    'Range Break 200 Index',
    'Boom 50 Index',
    'Range Break 100 Index',
    'Crash 50 Index',
    'Crash 150 Index',
    'Boom 150 Index',
] as const;

export const REQUIRED_MARKET_FALLBACKS: MarketSymbol[] = [
    { display_name: 'Volatility 100 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'random_index', symbol: 'R_100' },
    { display_name: 'Volatility 100 (1s) Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'random_index', symbol: '1HZ100V' },
    { display_name: 'Volatility 10 (1s) Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'random_index', symbol: '1HZ10V' },
    { display_name: 'Volatility 10 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'random_index', symbol: 'R_10' },
    { display_name: 'Volatility 50 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.0001, submarket: 'random_index', symbol: 'R_50' },
    { display_name: 'Volatility 25 (1s) Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'random_index', symbol: '1HZ25V' },
    { display_name: 'Volatility 75 (1s) Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'random_index', symbol: '1HZ75V' },
    { display_name: 'Volatility 75 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.0001, submarket: 'random_index', symbol: 'R_75' },
    { display_name: 'Volatility 50 (1s) Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'random_index', symbol: '1HZ50V' },
    { display_name: 'Volatility 25 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'random_index', symbol: 'R_25' },
    { display_name: 'Bear Market Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.0001, submarket: 'random_daily', symbol: 'RDBEAR' },
    { display_name: 'Jump 10 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'jump_index', symbol: 'JD10' },
    { display_name: 'Bull Market Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.0001, submarket: 'random_daily', symbol: 'RDBULL' },
    { display_name: 'Volatility 15 (1s) Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'random_index', symbol: '1HZ15V' },
    { display_name: 'Jump 100 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'jump_index', symbol: 'JD100' },
    { display_name: 'Volatility 30 (1s) Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'random_index', symbol: '1HZ30V' },
    { display_name: 'Volatility 90 (1s) Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'random_index', symbol: '1HZ90V' },
    { display_name: 'Step Index 100', exchange_is_open: 1, market: 'synthetic_index', pip: 0.1, submarket: 'step_index', symbol: 'stpRNG' },
    { display_name: 'Jump 75 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'jump_index', symbol: 'JD75' },
    { display_name: 'Jump 25 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'jump_index', symbol: 'JD25' },
    { display_name: 'Jump 50 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.01, submarket: 'jump_index', symbol: 'JD50' },
    { display_name: 'Step Index 500', exchange_is_open: 1, market: 'synthetic_index', pip: 0.1, submarket: 'step_index', symbol: 'stpRNG5' },
    { display_name: 'Boom 500 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'BOOM500' },
    { display_name: 'Crash 500 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'CRASH500' },
    { display_name: 'Boom 1000 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'BOOM1000' },
    { display_name: 'Crash 1000 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'CRASH1000' },
    { display_name: 'Step Index 200', exchange_is_open: 1, market: 'synthetic_index', pip: 0.1, submarket: 'step_index', symbol: 'stpRNG2' },
    { display_name: 'Step Index 300', exchange_is_open: 1, market: 'synthetic_index', pip: 0.1, submarket: 'step_index', symbol: 'stpRNG3' },
    { display_name: 'Step Index 400', exchange_is_open: 1, market: 'synthetic_index', pip: 0.1, submarket: 'step_index', symbol: 'stpRNG4' },
    { display_name: 'Boom 300 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'BOOM300N' },
    { display_name: 'Crash 300 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'CRASH300N' },
    { display_name: 'Crash 900 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'CRASH900' },
    { display_name: 'Crash 600 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'CRASH600' },
    { display_name: 'Boom 600 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'BOOM600' },
    { display_name: 'Boom 900 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'BOOM900' },
    { display_name: 'Range Break 200 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.1, submarket: 'range_index', symbol: 'RB200' },
    { display_name: 'Boom 50 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'BOOM50' },
    { display_name: 'Range Break 100 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.1, submarket: 'range_index', symbol: 'RB100' },
    { display_name: 'Crash 50 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.001, submarket: 'crash_index', symbol: 'CRASH50' },
    { display_name: 'Crash 150 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.00001, submarket: 'crash_index', symbol: 'CRASH150N' },
    { display_name: 'Boom 150 Index', exchange_is_open: 1, market: 'synthetic_index', pip: 0.00001, submarket: 'crash_index', symbol: 'BOOM150N' },
];

export const TRADE_FAMILY_CONFIGS: TradeFamilyConfig[] = [
    {
        key: 'rise_fall',
        title: 'Rise / Fall',
        description: 'Directional tick contracts with live proposal pricing.',
        requiresBarrier: false,
        buttons: [
            { contractType: 'CALL', label: 'Rise', tone: 'emerald' },
            { contractType: 'PUT', label: 'Fall', tone: 'rose' },
        ],
    },
    {
        key: 'even_odd',
        title: 'Even / Odd',
        description: 'Digit parity contracts built from the current live market.',
        requiresBarrier: false,
        buttons: [
            { contractType: 'DIGITEVEN', label: 'Even', tone: 'cyan' },
            { contractType: 'DIGITODD', label: 'Odd', tone: 'violet' },
        ],
    },
    {
        key: 'over_under',
        title: 'Over / Under',
        description: 'Digit threshold contracts using a live barrier selection.',
        requiresBarrier: true,
        buttons: [
            { contractType: 'DIGITOVER', label: 'Over', tone: 'amber' },
            { contractType: 'DIGITUNDER', label: 'Under', tone: 'rose' },
        ],
    },
    {
        key: 'match_diff',
        title: 'Matches / Differs',
        description: 'Digit prediction contracts priced from the current symbol stream.',
        requiresBarrier: true,
        buttons: [
            { contractType: 'DIGITMATCH', label: 'Matches', tone: 'cyan' },
            { contractType: 'DIGITDIFF', label: 'Differs', tone: 'amber' },
        ],
    },
];

export const SUPPORTED_COPY_CONTRACTS = new Set([
    'CALL',
    'PUT',
    'DIGITMATCH',
    'DIGITDIFF',
    'DIGITOVER',
    'DIGITUNDER',
    'DIGITEVEN',
    'DIGITODD',
]);

export const SOCIAL_LINKS = {
    whatsapp: 'https://wa.me/254799371481',
    telegram: 'https://t.me/DerivDigitMatch_King',
    tiktok: 'https://www.tiktok.com/@profitdocker?_r=1&_t=ZS-95CeJ3Yjesx',
} as const;
