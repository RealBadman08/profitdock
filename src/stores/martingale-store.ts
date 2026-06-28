import { useSyncExternalStore } from 'react';
import { normalizeMartingaleMultiplier, roundMartingaleStake } from '@/hooks/useMartingale';

type MartingalePosition = {
    currentStake: number;
    lossStreak: number;
    originalStake: number;
};

type MartingaleSnapshot = Record<string, MartingalePosition>;

const DEFAULT_POSITION: MartingalePosition = {
    currentStake: 0,
    lossStreak: 0,
    originalStake: 0,
};

const positions: MartingaleSnapshot = {};
const listeners = new Set<() => void>();

const normalizeStake = (stake: number) => roundMartingaleStake(Math.max(Number(stake) || 0, 0));

const getPosition = (key: string): MartingalePosition => positions[key] || DEFAULT_POSITION;

const emit = () => {
    listeners.forEach(listener => listener());
};

export const martingaleStore = {
    getState: () => ({
        clear(prefix?: string) {
            Object.keys(positions).forEach(key => {
                if (!prefix || key.startsWith(prefix)) {
                    delete positions[key];
                }
            });
            emit();
        },
        getCurrentStake(key: string, fallback = 0) {
            const position = positions[key];
            const result = position ? position.currentStake : normalizeStake(fallback);
            console.info('[MARTINGALE_STORE] getCurrentStake', key, '→', result, position ? '(from store)' : '(fallback)', position || 'NO_KEY');
            return result;
        },
        getLossStreak(key: string) {
            return getPosition(key).lossStreak;
        },
        init(key: string, stake: number) {
            const normalized = normalizeStake(stake);
            console.info('[MARTINGALE_STORE] init', key, 'stake=', stake, '→ normalized=', normalized);
            positions[key] = {
                currentStake: normalized,
                lossStreak: 0,
                originalStake: normalized,
            };
            emit();
            return normalized;
        },
        onLoss(key: string, multiplier: string | number) {
            const current = getPosition(key);
            const originalStake = current.originalStake || current.currentStake;
            const currentStake = current.currentStake || originalStake;
            const normalizedMultiplier = normalizeMartingaleMultiplier(multiplier, 1);

            console.info('[MARTINGALE_STORE] onLoss', key, 'currentStake=', currentStake, 'multiplier_raw=', multiplier, 'multiplier_normalized=', normalizedMultiplier, 'originalStake=', originalStake);

            // Guard: if the key was never init'd, both stakes are 0 –
            // don't write a zero-stake entry that would poison getCurrentStake.
            if (currentStake <= 0) {
                console.warn('[MARTINGALE_STORE] onLoss BLOCKED — key not initialized, currentStake=', currentStake);
                return 0;
            }

            const nextStake = roundMartingaleStake(
                currentStake * normalizedMultiplier
            );

            console.info('[MARTINGALE_STORE] onLoss', key, '→ nextStake=', nextStake, '(', currentStake, '*', normalizedMultiplier, ')');

            positions[key] = {
                currentStake: nextStake,
                lossStreak: current.lossStreak + 1,
                originalStake,
            };
            emit();
            return nextStake;
        },
        onWin(key: string) {
            const current = getPosition(key);
            const nextStake = normalizeStake(current.originalStake || current.currentStake);

            console.info('[MARTINGALE_STORE] onWin', key, 'originalStake=', current.originalStake, 'currentStake=', current.currentStake, '→ nextStake=', nextStake);

            positions[key] = {
                currentStake: nextStake,
                lossStreak: 0,
                originalStake: nextStake,
            };
            emit();
            return nextStake;
        },
        reset(key: string) {
            const current = getPosition(key);
            const nextStake = normalizeStake(current.originalStake);

            positions[key] = {
                currentStake: nextStake,
                lossStreak: 0,
                originalStake: nextStake,
            };
            emit();
            return nextStake;
        },
    }),
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};

export const useMartingaleStore = (key: string) =>
    useSyncExternalStore(
        martingaleStore.subscribe,
        () => getPosition(key),
        () => getPosition(key)
    );
