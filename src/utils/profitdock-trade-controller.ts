export type ProfitdockTradeFeature = 'accumulators' | 'corsa' | 'flipper';

export type ProfitdockTradeStatus = {
    canStop?: boolean;
    feature: ProfitdockTradeFeature;
    label: string;
    running: boolean;
    updatedAt?: number;
};

type ProfitdockTradeStopRequest = {
    feature?: ProfitdockTradeFeature;
};

const PROFITDOCK_TRADE_STATUS_EVENT = 'profitdock:trade-status';
const PROFITDOCK_TRADE_STOP_EVENT = 'profitdock:trade-stop';

let latestTradeStatus: ProfitdockTradeStatus | null = null;
const tradeStatusByFeature: Partial<Record<ProfitdockTradeFeature, ProfitdockTradeStatus>> = {};

export const emitProfitdockTradeStatus = (status: ProfitdockTradeStatus) => {
    latestTradeStatus = {
        ...status,
        updatedAt: Date.now(),
    };
    tradeStatusByFeature[status.feature] = latestTradeStatus;

    if (typeof window === 'undefined') return;

    window.dispatchEvent(
        new CustomEvent<ProfitdockTradeStatus>(PROFITDOCK_TRADE_STATUS_EVENT, {
            detail: latestTradeStatus,
        })
    );
};

export const getProfitdockTradeStatus = (feature?: ProfitdockTradeFeature) => {
    if (feature) return tradeStatusByFeature[feature] || null;

    return Object.values(tradeStatusByFeature).find(status => status?.running) || latestTradeStatus;
};

export const requestProfitdockTradeStop = (feature?: ProfitdockTradeFeature) => {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(
        new CustomEvent<ProfitdockTradeStopRequest>(PROFITDOCK_TRADE_STOP_EVENT, {
            detail: { feature },
        })
    );
};

export const subscribeProfitdockTradeStatus = (handler: (status: ProfitdockTradeStatus) => void) => {
    if (typeof window === 'undefined') return () => undefined;

    const listener = (event: Event) => {
        const status = (event as CustomEvent<ProfitdockTradeStatus>).detail;
        if (status) handler(status);
    };

    window.addEventListener(PROFITDOCK_TRADE_STATUS_EVENT, listener);
    return () => window.removeEventListener(PROFITDOCK_TRADE_STATUS_EVENT, listener);
};

export const subscribeProfitdockTradeStop = (handler: (request: ProfitdockTradeStopRequest) => void) => {
    if (typeof window === 'undefined') return () => undefined;

    const listener = (event: Event) => {
        handler((event as CustomEvent<ProfitdockTradeStopRequest>).detail || {});
    };

    window.addEventListener(PROFITDOCK_TRADE_STOP_EVENT, listener);
    return () => window.removeEventListener(PROFITDOCK_TRADE_STOP_EVENT, listener);
};
