import React from 'react';

const readStoredValue = <T,>(key: string, fallback: T): T => {
    if (typeof window === 'undefined') return fallback;

    try {
        const rawValue = window.localStorage.getItem(key);
        return rawValue === null ? fallback : (JSON.parse(rawValue) as T);
    } catch {
        return fallback;
    }
};

export const useProfitdockPersistentState = <T,>(key: string, fallback: T) => {
    const [value, setValue] = React.useState<T>(() => readStoredValue(key, fallback));

    React.useEffect(() => {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Storage can be unavailable in private browsing; the in-memory value still works.
        }
    }, [key, value]);

    return [value, setValue] as const;
};
