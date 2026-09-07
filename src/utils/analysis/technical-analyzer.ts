/**
 * Technical Analysis Engine for Profitdock Flipper Switcher
 *
 * Calculates hardcoded indicators on incoming tick/candle streams to find optimal
 * entry points based on the active strategy leg (Rise/Fall, Higher/Lower, etc.).
 */

export type TickHistory = {
    epoch: number;
    quote: number;
}[];

// --- Core Mathematical Indicators ---

/**
 * Calculates Simple Moving Average (SMA)
 */
export const calculateSMA = (ticks: TickHistory, period: number): number | null => {
    if (ticks.length < period) return null;
    const slice = ticks.slice(-period);
    const sum = slice.reduce((acc, tick) => acc + tick.quote, 0);
    return sum / period;
};

/**
 * Calculates Relative Strength Index (RSI)
 */
export const calculateRSI = (ticks: TickHistory, period: number = 14): number | null => {
    if (ticks.length <= period) return null;

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = ticks.length - period; i < ticks.length; i++) {
        const difference = ticks[i].quote - ticks[i - 1].quote;
        if (difference >= 0) gains += difference;
        else losses -= difference;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
};

/**
 * Calculates Bollinger Bands (SMA, Upper, Lower)
 */
export const calculateBollingerBands = (ticks: TickHistory, period: number = 20, multiplier: number = 2) => {
    const sma = calculateSMA(ticks, period);
    if (sma === null || ticks.length < period) return null;

    const slice = ticks.slice(-period);
    const variance = slice.reduce((acc, tick) => acc + Math.pow(tick.quote - sma, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
        sma,
        upper: sma + standardDeviation * multiplier,
        lower: sma - standardDeviation * multiplier,
        bandwidth: (sma + standardDeviation * multiplier - (sma - standardDeviation * multiplier)) / sma,
    };
};

/**
 * Calculates MACD (Moving Average Convergence Divergence)
 */
const calculateEMA = (ticks: number[], period: number): number | null => {
    if (ticks.length < period) return null;
    const k = 2 / (period + 1);
    let ema = ticks[0];
    for (let i = 1; i < ticks.length; i++) {
        ema = ticks[i] * k + ema * (1 - k);
    }
    return ema;
};

export const calculateMACD = (
    ticks: TickHistory,
    shortPeriod: number = 12,
    longPeriod: number = 26,
    signalPeriod: number = 9
) => {
    if (ticks.length < longPeriod + signalPeriod) return null;

    const quotes = ticks.map(t => t.quote);
    const macdLine: number[] = [];

    // Calculate MACD line over a window to generate signal line
    for (let i = longPeriod; i <= quotes.length; i++) {
        const slice = quotes.slice(0, i);
        const shortEMA = calculateEMA(slice.slice(-shortPeriod), shortPeriod);
        const longEMA = calculateEMA(slice.slice(-longPeriod), longPeriod);
        if (shortEMA !== null && longEMA !== null) {
            macdLine.push(shortEMA - longEMA);
        }
    }

    if (macdLine.length < signalPeriod) return null;

    const currentMACD = macdLine[macdLine.length - 1];
    const signalLine = calculateEMA(macdLine.slice(-signalPeriod), signalPeriod);

    if (signalLine === null) return null;

    return {
        macdLine: currentMACD,
        signalLine,
        histogram: currentMACD - signalLine,
    };
};

/**
 * Calculates Average True Range (ATR) approximation for volatility over tick data
 */
export const calculateVolatilityATR = (ticks: TickHistory, period: number = 14): number | null => {
    if (ticks.length < period + 1) return null;

    let trSum = 0;
    for (let i = ticks.length - period; i < ticks.length; i++) {
        trSum += Math.abs(ticks[i].quote - ticks[i - 1].quote);
    }
    return trSum / period;
};

/**
 * Calculates Stochastic Oscillator (%K and %D)
 */
export const calculateStochastic = (ticks: TickHistory, kPeriod: number = 14, dPeriod: number = 3) => {
    if (ticks.length < kPeriod + dPeriod) return null;

    const kValues: number[] = [];

    for (let i = ticks.length - dPeriod; i <= ticks.length; i++) {
        const slice = ticks.slice(i - kPeriod, i);
        if (slice.length === 0) continue;
        const highestHigh = Math.max(...slice.map(t => t.quote));
        const lowestLow = Math.min(...slice.map(t => t.quote));
        const currentClose = slice[slice.length - 1].quote;

        if (highestHigh === lowestLow) {
            kValues.push(50);
        } else {
            kValues.push(((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100);
        }
    }

    if (kValues.length === 0) return null;

    const currentK = kValues[kValues.length - 1];
    const currentD = kValues.reduce((a, b) => a + b, 0) / kValues.length;

    return { percentK: currentK, percentD: currentD };
};

/**
 * Calculates Donchian Channels (Support / Resistance extremes)
 */
export const calculateDonchianChannels = (ticks: TickHistory, period: number = 20) => {
    if (ticks.length < period) return null;

    const slice = ticks.slice(-period);
    const upperChannel = Math.max(...slice.map(t => t.quote));
    const lowerChannel = Math.min(...slice.map(t => t.quote));
    const middleChannel = (upperChannel + lowerChannel) / 2;

    return { upperChannel, lowerChannel, middleChannel };
};

// --- Strategy Trigger Logic ---

/**
 * Evaluates the tick history against hardcoded strategies for the specific contract type.
 * Returns true if the condition to execute the trade is met.
 */
export const evaluateTechnicalStrategy = (
    contractType: string,
    ticks: TickHistory
): { trigger: boolean; reason: string; indicatorData?: any } => {
    if (ticks.length < 30) {
        return { trigger: false, reason: 'Insufficient ticks (need 30+)' };
    }

    const currentPrice = ticks[ticks.length - 1].quote;
    const previousPrice = ticks[ticks.length - 2].quote;

    switch (contractType) {
        case 'CALL': {
            // Rise Strategy: Fast SMA crosses over Slow SMA (Golden Cross) + MACD Histogram is positive
            const fastSMA = calculateSMA(ticks, 5);
            const slowSMA = calculateSMA(ticks, 15);
            const macd = calculateMACD(ticks);
            const rsi = calculateRSI(ticks);

            if (fastSMA === null || slowSMA === null || macd === null || rsi === null) {
                return { trigger: false, reason: 'Calculating indicators...' };
            }

            // Cross over + Uptrend + Not Overbought
            if (fastSMA > slowSMA && macd.histogram > 0 && rsi < 70 && currentPrice > fastSMA) {
                return {
                    trigger: true,
                    reason: `RSI: ${rsi.toFixed(1)}, MACD Hist: +${macd.histogram.toFixed(4)}, Golden Cross`,
                    indicatorData: { rsi, macd },
                };
            }
            return { trigger: false, reason: 'Waiting for bullish crossover...' };
        }

        case 'PUT': {
            // Fall Strategy: Fast SMA crosses under Slow SMA (Death Cross) + MACD Histogram is negative
            const fastSMA = calculateSMA(ticks, 5);
            const slowSMA = calculateSMA(ticks, 15);
            const macd = calculateMACD(ticks);
            const rsi = calculateRSI(ticks);

            if (fastSMA === null || slowSMA === null || macd === null || rsi === null) {
                return { trigger: false, reason: 'Calculating indicators...' };
            }

            // Cross under + Downtrend + Not Oversold
            if (fastSMA < slowSMA && macd.histogram < 0 && rsi > 30 && currentPrice < fastSMA) {
                return {
                    trigger: true,
                    reason: `RSI: ${rsi.toFixed(1)}, MACD Hist: ${macd.histogram.toFixed(4)}, Death Cross`,
                    indicatorData: { rsi, macd },
                };
            }
            return { trigger: false, reason: 'Waiting for bearish crossover...' };
        }

        case 'HIGHER': {
            // Higher Strategy: Bollinger Band Breakout (Upwards) with strong Volatility + Stochastic Overbought confirmation
            const bb = calculateBollingerBands(ticks);
            const atr = calculateVolatilityATR(ticks);
            const stoch = calculateStochastic(ticks);
            if (!bb || !atr || !stoch) return { trigger: false, reason: 'Calculating BB/ATR/Stoch...' };

            // Price aggressively pushes through the upper band with expanding volatility, and momentum is strong (%K > %D)
            if (
                currentPrice > bb.upper &&
                currentPrice - previousPrice > atr &&
                stoch.percentK > stoch.percentD &&
                stoch.percentK > 70
            ) {
                return {
                    trigger: true,
                    reason: 'Bullish BB Breakout + Stoch Momentum',
                    indicatorData: { bb, atr, stoch },
                };
            }
            return { trigger: false, reason: 'Waiting for upper BB breakout & momentum...' };
        }

        case 'LOWER': {
            // Lower Strategy: Bollinger Band Breakout (Downwards) with strong Volatility + Stochastic Oversold confirmation
            const bb = calculateBollingerBands(ticks);
            const atr = calculateVolatilityATR(ticks);
            const stoch = calculateStochastic(ticks);
            if (!bb || !atr || !stoch) return { trigger: false, reason: 'Calculating BB/ATR/Stoch...' };

            // Price aggressively pushes below the lower band with expanding volatility, momentum strong down
            if (
                currentPrice < bb.lower &&
                previousPrice - currentPrice > atr &&
                stoch.percentK < stoch.percentD &&
                stoch.percentK < 30
            ) {
                return {
                    trigger: true,
                    reason: 'Bearish BB Breakout + Stoch Momentum',
                    indicatorData: { bb, atr, stoch },
                };
            }
            return { trigger: false, reason: 'Waiting for lower BB breakout & momentum...' };
        }

        case 'ONETOUCH': {
            // Touch Strategy: Price approaching Donchian channel extremes with high ATR
            const donchian = calculateDonchianChannels(ticks, 20);
            const atr = calculateVolatilityATR(ticks, 10);
            if (!donchian || !atr) return { trigger: false, reason: 'Calculating Donchian/ATR...' };

            // If price makes a strong move (1.5x ATR) and is breaking new local highs/lows, it's trending hard enough to touch barriers
            const priceDelta = Math.abs(currentPrice - previousPrice);
            if (
                priceDelta > atr * 1.5 &&
                (currentPrice >= donchian.upperChannel || currentPrice <= donchian.lowerChannel)
            ) {
                return {
                    trigger: true,
                    reason: 'Donchian Breakout + Volatility spike',
                    indicatorData: { atr, donchian, priceDelta },
                };
            }
            return { trigger: false, reason: 'Waiting for Donchian breakout...' };
        }

        case 'NOTOUCH': {
            // No Touch Strategy: Low volatility consolidation
            const bb = calculateBollingerBands(ticks, 20, 2);
            if (!bb) return { trigger: false, reason: 'Calculating BB...' };

            // Bollinger Band Squeeze: Bandwidth is very narrow (consolidation)
            if (bb.bandwidth < 0.001) {
                return { trigger: true, reason: 'BB Squeeze (Consolidation)', indicatorData: { bb } };
            }
            return { trigger: false, reason: 'Waiting for consolidation (Squeeze)...' };
        }

        default:
            // Non-technical/unsupported types pass immediately if they end up here
            return { trigger: true, reason: 'No technical strategy configured, proceeding.' };
    }
};
