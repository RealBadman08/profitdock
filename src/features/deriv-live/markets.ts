import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { MarketSymbol } from './types';

export const getProfitdockActiveSymbols = async (): Promise<MarketSymbol[]> => {
    const currentSymbols = Array.isArray(api_base.active_symbols) ? (api_base.active_symbols as MarketSymbol[]) : [];
    if (currentSymbols.length) return currentSymbols;

    try {
        if (api_base.active_symbols_promise) {
            await api_base.active_symbols_promise;
        } else {
            await api_base.getActiveSymbols();
        }
    } catch {
        // The page-level public request remains the last real-data fallback.
    }

    return Array.isArray(api_base.active_symbols) ? (api_base.active_symbols as MarketSymbol[]) : [];
};
