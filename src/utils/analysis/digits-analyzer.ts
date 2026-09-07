/**
 * Digits Analysis Engine for Profitdock Flipper Switcher
 *
 * Fetches and analyzes up to 1000 historical ticks for digit probability
 * distributions, momentum tracking, and specific entry sequences.
 */

import { TickHistory } from './technical-analyzer';

export type DigitStats = {
    digit: number;
    count: number;
    probability: number; // 0 to 100
    momentum: number; // Difference between recent 100 ticks prob and total 1000 ticks prob
};

export class DigitsAnalyzer {
    /**
     * Given an array of ticks (ideally 1000), calculates the frequency and momentum of each digit (0-9).
     */
    static calculateDigitStats(ticks: TickHistory): DigitStats[] {
        if (!ticks || ticks.length === 0) return [];

        const totalCount = ticks.length;
        const recentCount = Math.min(100, totalCount);

        const totalCounts = new Array(10).fill(0);
        const recentCounts = new Array(10).fill(0);

        // Count totals
        for (let i = 0; i < totalCount; i++) {
            const digit = this.getLastDigit(ticks[i].quote);
            totalCounts[digit]++;
            if (i >= totalCount - recentCount) {
                recentCounts[digit]++;
            }
        }

        const stats: DigitStats[] = [];
        for (let i = 0; i < 10; i++) {
            const totalProb = (totalCounts[i] / totalCount) * 100;
            const recentProb = (recentCounts[i] / recentCount) * 100;

            stats.push({
                digit: i,
                count: totalCounts[i],
                probability: totalProb,
                momentum: recentProb - totalProb,
            });
        }

        return stats.sort((a, b) => b.probability - a.probability);
    }

    /**
     * Extracts the last digit from a quote price.
     */
    static getLastDigit(quote: number, pipSize = 2): number {
        const formattedQuote = Number(quote).toFixed(Math.max(0, Math.trunc(pipSize)));
        const digits = formattedQuote.replace(/\D/g, '');
        return Number(digits.charAt(digits.length - 1)) || 0;
    }

    /**
     * Evaluates the specific "Over 5 / Under 4" logic requested by the user.
     * Triggers ONLY when the sequence touches 4 then 5, OR 5 then 4,
     * AND those digits are not gaining momentum, not the highest, and not the lowest.
     */
    static evaluateOverUnderSequence(ticks: TickHistory): { trigger: boolean; reason: string } {
        if (ticks.length < 1000) {
            return { trigger: false, reason: `Gathering ticks (${ticks.length}/1000)...` };
        }

        const stats = this.calculateDigitStats(ticks);

        // Find stats for 4 and 5
        const stat4 = stats.find(s => s.digit === 4);
        const stat5 = stats.find(s => s.digit === 5);

        if (!stat4 || !stat5) return { trigger: false, reason: 'Insufficient digit data.' };

        // Check Extremes (Cannot be the highest or lowest appearing)
        const highestProb = stats[0].probability;
        const lowestProb = stats[9].probability;

        if (stat4.probability === highestProb || stat5.probability === highestProb) {
            return { trigger: false, reason: '4 or 5 is the most frequent digit. Too risky.' };
        }
        if (stat4.probability === lowestProb || stat5.probability === lowestProb) {
            return { trigger: false, reason: '4 or 5 is the least frequent digit. Too risky.' };
        }

        // Check Momentum (Cannot be gaining momentum)
        if (stat4.momentum > 0 || stat5.momentum > 0) {
            return { trigger: false, reason: '4 or 5 is currently gaining momentum. Wait for cooldown.' };
        }

        // Check Sequence: Look at the last few ticks for a 4->5 or 5->4 pattern
        const lastDigits = ticks.slice(-5).map(t => this.getLastDigit(t.quote));

        // Find if 4->5 or 5->4 sequence just occurred
        let patternFound = false;
        let patternStr = '';

        for (let i = lastDigits.length - 1; i > 0; i--) {
            if (lastDigits[i] === 5 && lastDigits[i - 1] === 4) {
                patternFound = true;
                patternStr = '4 -> 5';
                break;
            }
            if (lastDigits[i] === 4 && lastDigits[i - 1] === 5) {
                patternFound = true;
                patternStr = '5 -> 4';
                break;
            }
        }

        if (patternFound) {
            return { trigger: true, reason: `Pattern ${patternStr} matched with safe momentum.` };
        }

        return { trigger: false, reason: 'Waiting for 4->5 or 5->4 touch sequence...' };
    }
}
