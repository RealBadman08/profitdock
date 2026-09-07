import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { TickHistory } from './technical-analyzer';

/**
 * Fetches historical ticks for a given symbol.
 * Uses the ticks_history API call.
 */
export const fetchHistoricalTicks = async (symbol: string, count: number = 1000): Promise<TickHistory | null> => {
    const api = api_base.api as any;
    if (!api || typeof api.send !== 'function') return null;

    try {
        const response = await api.send({
            ticks_history: symbol,
            adjust_start_time: 1,
            count: count,
            end: 'latest',
            style: 'ticks',
        });

        if (response.error || !response.history) {
            console.error(`[TickFetcher] Error fetching ticks for ${symbol}:`, response.error);
            return null;
        }

        const history = response.history;
        const prices = history.prices;
        const times = history.times;

        if (!prices || !times || prices.length !== times.length) {
            return null;
        }

        const ticks: TickHistory = [];
        for (let i = 0; i < prices.length; i++) {
            ticks.push({
                epoch: times[i],
                quote: prices[i],
            });
        }

        return ticks;
    } catch (error) {
        console.error(`[TickFetcher] Failed to fetch ticks for ${symbol}:`, error);
        return null;
    }
};
