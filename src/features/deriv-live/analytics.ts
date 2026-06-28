import { DEFAULT_ANALYSIS_DIGIT, MAX_SEQUENCE_ITEMS } from './constants';
import { AnalyticsSummary, DigitStat, ModuleSummary, SequenceTile, TickEntry, Tone } from './types';

type ComparisonResult = {
    label: string;
    shortLabel: string;
    tone: Tone;
};

const EMPTY_DIGITS = Array.from({ length: 10 }, (_, digit) => digit);

const round = (value: number, digits = 1) => {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Number(value.toFixed(digits));
};

const getBalancedPercentages = (counts: number[], denominator: number) => {
    if (!denominator || !counts.length) {
        return counts.map(() => 0);
    }

    const raw_percentages = counts.map(count => (count / denominator) * 100);
    const floored_percentages = raw_percentages.map(value => Math.floor(value * 10) / 10);
    const floored_total_tenths = floored_percentages.reduce((total, value) => total + Math.round(value * 10), 0);
    const target_total_tenths = counts.some(count => count > 0) ? 1000 : 0;
    let remaining_tenths = target_total_tenths - floored_total_tenths;
    const remainders = raw_percentages
        .map((value, index) => ({
            index,
            remainder: value - floored_percentages[index],
        }))
        .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
    const adjusted_percentages = [...floored_percentages];
    const step = remaining_tenths >= 0 ? 1 : -1;

    while (remaining_tenths !== 0 && remainders.length) {
        for (const item of remainders) {
            if (remaining_tenths === 0) {
                break;
            }

            const next_value = adjusted_percentages[item.index] + step * 0.1;
            if (next_value >= 0) {
                adjusted_percentages[item.index] = round(next_value);
                remaining_tenths -= step;
            }
        }
    }

    return adjusted_percentages.map(value => Math.max(0, round(value)));
};

const toTile = (label: string, tone: Tone, index: number): SequenceTile => ({
    id: `${label}-${index}`,
    label,
    tone,
});

const countTrailingMatches = (items: string[]) => {
    if (!items.length) {
        return 0;
    }

    const current = items[items.length - 1];
    let streak = 0;

    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index] !== current) {
            break;
        }

        streak += 1;
    }

    return streak;
};

const createModuleSummary = (config: {
    primaryLabel: string;
    primaryTone: Tone;
    primaryCount: number;
    secondaryLabel: string;
    secondaryTone: Tone;
    secondaryCount: number;
    denominator: number;
    sequence: SequenceTile[];
    currentLabel: string;
    currentStreak: number;
    neutralLabel?: string;
    neutralCount?: number;
}): ModuleSummary => {
    const [primaryPercentage, secondaryPercentage] = getBalancedPercentages(
        [config.primaryCount, config.secondaryCount],
        config.denominator
    );

    return {
        primaryLabel: config.primaryLabel,
        primaryTone: config.primaryTone,
        primaryCount: config.primaryCount,
        primaryPercentage,
        secondaryLabel: config.secondaryLabel,
        secondaryTone: config.secondaryTone,
        secondaryCount: config.secondaryCount,
        secondaryPercentage,
        sequence: config.sequence,
        currentLabel: config.currentLabel,
        currentStreak: config.currentStreak,
        neutralLabel: config.neutralLabel,
        neutralCount: config.neutralCount,
    };
};

const getDigitStats = (ticks: TickEntry[], denominator: number): DigitStat[] => {
    const counts = new Map<number, number>();

    ticks.forEach(tick => {
        counts.set(tick.digit, (counts.get(tick.digit) ?? 0) + 1);
    });

    const percentages = getBalancedPercentages(
        EMPTY_DIGITS.map(digit => counts.get(digit) ?? 0),
        denominator
    );

    return EMPTY_DIGITS.map(digit => {
        const count = counts.get(digit) ?? 0;

        return {
            digit,
            count,
            percentage: percentages[digit],
        };
    });
};

const getEvenOddSummary = (ticks: TickEntry[], denominator: number): ModuleSummary => {
    const sequenceValues = ticks.slice(-MAX_SEQUENCE_ITEMS).map(tick => (tick.digit % 2 === 0 ? 'E' : 'O'));
    const evenCount = ticks.filter(tick => tick.digit % 2 === 0).length;
    const oddCount = denominator - evenCount;
    const currentIsEven = ticks[ticks.length - 1]?.digit % 2 === 0;

    return createModuleSummary({
        primaryLabel: 'Even',
        primaryTone: 'cyan',
        primaryCount: evenCount,
        secondaryLabel: 'Odd',
        secondaryTone: 'violet',
        secondaryCount: oddCount,
        denominator,
        sequence: sequenceValues.map((label, index) => toTile(label, label === 'E' ? 'cyan' : 'violet', index)),
        currentLabel: currentIsEven ? 'Even' : 'Odd',
        currentStreak: countTrailingMatches(sequenceValues),
    });
};

const getRiseFallSummary = (ticks: TickEntry[]): ModuleSummary => {
    const comparisons: ComparisonResult[] = [];

    for (let index = 1; index < ticks.length; index += 1) {
        const previous = ticks[index - 1];
        const current = ticks[index];

        if (current.quote > previous.quote) {
            comparisons.push({ label: 'Rise', shortLabel: 'R', tone: 'emerald' });
        } else if (current.quote < previous.quote) {
            comparisons.push({ label: 'Fall', shortLabel: 'F', tone: 'rose' });
        } else {
            comparisons.push({ label: 'Flat', shortLabel: '=', tone: 'slate' });
        }
    }

    const riseCount = comparisons.filter(item => item.label === 'Rise').length;
    const fallCount = comparisons.filter(item => item.label === 'Fall').length;
    const flatCount = comparisons.filter(item => item.label === 'Flat').length;
    const directionalDenominator = riseCount + fallCount;
    const labels = comparisons.map(item => item.label);
    const currentLabel = labels[labels.length - 1] ?? 'Waiting';

    return createModuleSummary({
        primaryLabel: 'Rise',
        primaryTone: 'emerald',
        primaryCount: riseCount,
        secondaryLabel: 'Fall',
        secondaryTone: 'rose',
        secondaryCount: fallCount,
        denominator: directionalDenominator,
        sequence: comparisons
            .slice(-MAX_SEQUENCE_ITEMS)
            .map((item, index) => toTile(item.shortLabel, item.tone, index)),
        currentLabel,
        currentStreak: countTrailingMatches(labels),
        neutralLabel: 'Flat',
        neutralCount: flatCount,
    });
};

const getOverUnderSummary = (ticks: TickEntry[], barrierDigit: number): ModuleSummary => {
    const comparisons = ticks.map(tick => {
        if (tick.digit > barrierDigit) {
            return { label: 'Over', shortLabel: 'O', tone: 'emerald' as Tone };
        }

        if (tick.digit < barrierDigit) {
            return { label: 'Under', shortLabel: 'U', tone: 'rose' as Tone };
        }

        return { label: 'Equal', shortLabel: '=', tone: 'slate' as Tone };
    });

    const overCount = comparisons.filter(item => item.label === 'Over').length;
    const underCount = comparisons.filter(item => item.label === 'Under').length;
    const equalCount = comparisons.filter(item => item.label === 'Equal').length;
    const directionalDenominator = overCount + underCount;
    const labels = comparisons.map(item => item.label);
    const currentLabel = labels[labels.length - 1] ?? 'Waiting';

    return createModuleSummary({
        primaryLabel: 'Over',
        primaryTone: 'emerald',
        primaryCount: overCount,
        secondaryLabel: 'Under',
        secondaryTone: 'rose',
        secondaryCount: underCount,
        denominator: directionalDenominator,
        sequence: comparisons.slice(-MAX_SEQUENCE_ITEMS).map((item, index) => toTile(item.shortLabel, item.tone, index)),
        currentLabel,
        currentStreak: countTrailingMatches(labels),
        neutralLabel: `Equal ${barrierDigit}`,
        neutralCount: equalCount,
    });
};

const getMatchesDiffersSummary = (ticks: TickEntry[]): ModuleSummary => {
    const comparisons: ComparisonResult[] = [];

    for (let index = 1; index < ticks.length; index += 1) {
        const previous = ticks[index - 1];
        const current = ticks[index];

        if (current.digit === previous.digit) {
            comparisons.push({ label: 'Matches', shortLabel: 'M', tone: 'cyan' });
        } else {
            comparisons.push({ label: 'Differs', shortLabel: 'D', tone: 'amber' });
        }
    }

    const denominator = Math.max(comparisons.length, 1);
    const matchCount = comparisons.filter(item => item.label === 'Matches').length;
    const differsCount = comparisons.length - matchCount;
    const labels = comparisons.map(item => item.label);

    return createModuleSummary({
        primaryLabel: 'Matches',
        primaryTone: 'cyan',
        primaryCount: matchCount,
        secondaryLabel: 'Differs',
        secondaryTone: 'amber',
        secondaryCount: differsCount,
        denominator,
        sequence: comparisons
            .slice(-MAX_SEQUENCE_ITEMS)
            .map((item, index) => toTile(item.shortLabel, item.tone, index)),
        currentLabel: labels[labels.length - 1] ?? 'Waiting',
        currentStreak: countTrailingMatches(labels),
    });
};

export const calculateAnalytics = (
    ticks: TickEntry[],
    barrierDigit = DEFAULT_ANALYSIS_DIGIT
): AnalyticsSummary | null => {
    if (!ticks.length) {
        return null;
    }

    const denominator = ticks.length;
    const prices = ticks.map(tick => tick.quote);
    const averagePrice = prices.reduce((total, price) => total + price, 0) / denominator;
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const variance =
        prices.reduce((total, price) => total + (price - averagePrice) ** 2, 0) / denominator;
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const elapsedSeconds = Math.max(ticks[ticks.length - 1].epoch - ticks[0].epoch, 1);
    const sortedDigits = [...getDigitStats(ticks, denominator)].sort((left, right) => {
        if (right.count !== left.count) {
            return right.count - left.count;
        }

        return left.digit - right.digit;
    });

    return {
        lastDigit: ticks[ticks.length - 1].digit,
        digitStats: getDigitStats(ticks, denominator),
        evenOdd: getEvenOddSummary(ticks, denominator),
        riseFall: getRiseFallSummary(ticks),
        overUnder: getOverUnderSummary(ticks, barrierDigit),
        matchesDiffers: getMatchesDiffersSummary(ticks),
        sampleSize: denominator,
        comparisonSampleSize: Math.max(denominator - 1, 0),
        averagePrice: round(averagePrice, 4),
        lowestPrice: round(lowestPrice, 4),
        highestPrice: round(highestPrice, 4),
        range: round(highestPrice - lowestPrice, 4),
        standardDeviation: round(Math.sqrt(variance), 4),
        netChange: round(lastPrice - firstPrice, 4),
        netChangePercent: round(firstPrice === 0 ? 0 : ((lastPrice - firstPrice) / firstPrice) * 100),
        tickRatePerMinute: round(((ticks.length - 1) / elapsedSeconds) * 60, 2),
        latestDigits: ticks.slice(-MAX_SEQUENCE_ITEMS).map(tick => tick.digit),
        latestQuotes: ticks.slice(-MAX_SEQUENCE_ITEMS),
        mostCommonDigits: sortedDigits.slice(0, 3),
        leastCommonDigits: [...sortedDigits].reverse().slice(0, 3),
    };
};
