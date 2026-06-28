import { useCallback, useRef, useState } from 'react';

export const roundMartingaleStake = (value: number) => Number(value.toFixed(2));

export const normalizeMartingaleMultiplier = (value: string | number, fallback = 1) => {
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const getNextMartingaleStake = ({
    currentStake,
    multiplier,
    originalStake,
    won,
}: {
    currentStake: number;
    multiplier: string | number;
    originalStake: number;
    won: boolean;
}) => {
    if (won) {
        return roundMartingaleStake(originalStake);
    }

    return roundMartingaleStake(currentStake * normalizeMartingaleMultiplier(multiplier, 1));
};

export const runMartingaleSelfTest = () => {
    let stake = 1;
    const original = 1;
    const multiplier = 2;
    const sequence = ['loss', 'loss', 'loss', 'win', 'loss', 'win'] as const;
    const expected = [1, 2, 4, 8, 1, 2];

    sequence.forEach((result, index) => {
        if (stake !== expected[index]) {
            throw new Error(`Trade ${index + 1}: expected ${expected[index]}, got ${stake}`);
        }

        stake = getNextMartingaleStake({
            currentStake: stake,
            multiplier,
            originalStake: original,
            won: result === 'win',
        });
    });

    return true;
};

export function useMartingale() {
    const originalStakeRef = useRef(0);
    const currentStakeRef = useRef(0);
    const lossStreakRef = useRef(0);
    const [currentStake, setCurrentStakeState] = useState(0);
    const [lossStreak, setLossStreakState] = useState(0);

    const setCurrentStake = useCallback((stake: number) => {
        const rounded = roundMartingaleStake(Math.max(stake, 0));
        currentStakeRef.current = rounded;
        setCurrentStakeState(rounded);
        return rounded;
    }, []);

    const setLossStreak = useCallback((nextLossStreak: number) => {
        const normalized = Math.max(0, Math.trunc(nextLossStreak));
        lossStreakRef.current = normalized;
        setLossStreakState(normalized);
        return normalized;
    }, []);

    const init = useCallback(
        (startingStake: number) => {
            const normalized = roundMartingaleStake(Math.max(startingStake, 0));
            originalStakeRef.current = normalized;
            setCurrentStake(normalized);
            setLossStreak(0);
            return normalized;
        },
        [setCurrentStake, setLossStreak]
    );

    const onWin = useCallback(() => {
        setLossStreak(0);
        return setCurrentStake(originalStakeRef.current);
    }, [setCurrentStake, setLossStreak]);

    const onLoss = useCallback(
        (multiplier: string | number) => {
            setLossStreak(lossStreakRef.current + 1);
            return setCurrentStake(
                getNextMartingaleStake({
                    currentStake: currentStakeRef.current,
                    multiplier,
                    originalStake: originalStakeRef.current,
                    won: false,
                })
            );
        },
        [setCurrentStake, setLossStreak]
    );

    const reset = useCallback(() => {
        setLossStreak(0);
        return setCurrentStake(originalStakeRef.current);
    }, [setCurrentStake, setLossStreak]);

    const getCurrentStake = useCallback(() => currentStakeRef.current, []);
    const getOriginalStake = useCallback(() => originalStakeRef.current, []);

    return {
        currentStake,
        getCurrentStake,
        getOriginalStake,
        init,
        lossStreak,
        onLoss,
        onWin,
        reset,
    };
}
