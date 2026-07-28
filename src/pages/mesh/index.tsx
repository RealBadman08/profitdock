import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { MarketIcon } from '@/components/market/market-icon';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import {
    getStoredProfitdockAccounts,
    getStoredProfitdockActiveCurrency,
    hasUsableProfitdockStoredSession,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { isExcludedSyntheticMarket, normalizeApiMessage } from '@/features/deriv-live/api';
import { getProfitdockActiveSymbols } from '@/features/deriv-live/markets';
import { MarketSymbol } from '@/features/deriv-live/types';
import { useApiBase } from '@/hooks/useApiBase';
import { useProfitdockPersistentState } from '@/hooks/useProfitdockPersistentState';
import { useStore } from '@/hooks/useStore';
import { getProfitdockPublicSocketUrl } from '@/external/bot-skeleton/services/api/appId';
import {
    emitProfitdockTradeStatus,
    subscribeProfitdockTradeStart,
    subscribeProfitdockTradeStop,
} from '@/utils/profitdock-trade-controller';
import { ProposalOpenContract } from '@deriv/api-types';
import './mesh.scss';

type ApiLike = {
    connection?: { readyState?: number };
    onMessage: () => { subscribe: (callback: (message: unknown) => void) => { unsubscribe: () => void } };
    send: (payload: Record<string, unknown>) => Promise<Record<string, any>>;
};

type MeshContractType = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD' | 'DIGITMATCH' | 'DIGITDIFF';
type SignalKind = 'over' | 'under' | 'even' | 'odd' | 'matches' | 'differs';
type MeshMarket = MarketSymbol & { display_order?: number; supportedContracts: string[] };
type StoredAccount = {
    account_type?: string;
    currency?: string;
    is_virtual?: boolean;
    loginid: string;
    token?: string;
};
type PublicRequestResponse = {
    active_symbols?: MarketSymbol[];
    contracts_for?: { available?: Array<{ contract_type?: string }> };
    error?: { message?: string };
    history?: { prices?: number[]; times?: number[] };
    msg_type?: string;
    pip_size?: number;
    subscription?: { id?: string };
    tick?: { epoch: number; pip_size?: number; quote: number; symbol: string };
};
type DigitModel = {
    counts: number[];
    frequencies: number[];
    rank: number[];
    gap: number[];
    total: number;
};
type MeshSignal = {
    accent: string;
    barrier?: number;
    buttonText: string;
    contractType: MeshContractType;
    expected: number;
    id: SignalKind;
    label: string;
    observed: number;
    recommendedDigit?: number;
    textColor: string;
    z: number;
};
type BuyResponse = {
    buy?: { buy_price?: number; contract_id?: number; longcode?: string; transaction_id?: number };
    error?: { code?: string; message?: string };
};
type ProposalResponse = {
    error?: { code?: string; message?: string };
    proposal?: { ask_price?: number; id?: string; longcode?: string; spot?: number };
};
type OpenContractResponse = {
    error?: { message?: string };
    msg_type?: string;
    proposal_open_contract?: ProposalOpenContract;
    subscription?: { id?: string };
};

const DERIV_PUBLIC_WS_URL = getProfitdockPublicSocketUrl();
const ENABLED_Z_SCORE = 2;
const DIGIT_CONTRACTS = new Set(['DIGITOVER', 'DIGITEVEN', 'DIGITMATCH']);
const SIGNAL_META: Record<SignalKind, { accent: string; textColor: string; label: string }> = {
    over: { accent: '#22c55e', label: 'Over', textColor: '#061406' },
    under: { accent: '#e8445a', label: 'Under', textColor: '#ffffff' },
    even: { accent: '#60a5fa', label: 'Even', textColor: '#040c20' },
    odd: { accent: '#a855f7', label: 'Odd', textColor: '#ffffff' },
    matches: { accent: '#f97316', label: 'Matches', textColor: '#ffffff' },
    differs: { accent: '#06b6d4', label: 'Differs', textColor: '#041414' },
};

const publicRequest = <T extends PublicRequestResponse>(payload: Record<string, unknown>, timeoutMs = 14000) =>
    new Promise<T>((resolve, reject) => {
        const reqId = Date.now() + Math.floor(Math.random() * 100000);
        const socket = new WebSocket(DERIV_PUBLIC_WS_URL);
        const timeout = window.setTimeout(() => {
            socket.close();
            reject(new Error('Deriv request timed out.'));
        }, timeoutMs);

        socket.onopen = () => {
            socket.send(JSON.stringify({ ...payload, req_id: reqId }));
        };
        socket.onmessage = event => {
            const data = JSON.parse(String(event.data)) as T & { req_id?: number };
            if (data.req_id !== reqId) return;
            window.clearTimeout(timeout);
            socket.close();
            if (data.error) {
                reject(new Error(data.error.message || 'Deriv request failed.'));
                return;
            }
            resolve(data);
        };
        socket.onerror = () => {
            window.clearTimeout(timeout);
            socket.close();
            reject(new Error('Unable to reach Deriv.'));
        };
    });

const getDigitFromPrice = (price: number, pipSize: number) => Number(price.toFixed(pipSize).slice(-1));

const getPipSizeFromMarket = (market?: MarketSymbol | null) => {
    const pip = typeof market?.pip === 'number' ? market.pip : Number(market?.pip);
    if (Number.isFinite(pip) && pip > 0) {
        return Math.max(0, Math.round(Math.abs(Math.log10(pip))));
    }
    return 2;
};

const buildDigitModel = (history: number[]): DigitModel => {
    const counts = new Array(10).fill(0);
    const gap = new Array(10).fill(history.length);
    history.forEach((digit, index) => {
        if (digit >= 0 && digit <= 9) {
            counts[digit] += 1;
            gap[digit] = history.length - 1 - index;
        }
    });
    const total = history.length || 1;
    const frequencies = counts.map(count => count / total);
    const rank = new Array(10).fill(0);
    frequencies
        .map((frequency, digit) => ({ digit, frequency }))
        .sort((left, right) => right.frequency - left.frequency || left.digit - right.digit)
        .forEach((entry, index) => {
            rank[entry.digit] = index;
        });

    return { counts, frequencies, rank, gap, total: history.length };
};

const zScore = (observed: number, expected: number, n: number) => {
    const stdDev = Math.sqrt((expected * (1 - expected)) / Math.max(n, 1));
    return stdDev === 0 ? 0 : (observed - expected) / stdDev;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
const formatZ = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}σ`;
const clampDigitValue = (value: string | number, fallback = 5) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(0, Math.min(9, Math.round(numericValue)));
};
const isDemoLoginId = (loginid?: string) => /^(VR|VRTC|VRW)/i.test(String(loginid || ''));
const isDemoAccount = (account?: Partial<StoredAccount> | null) =>
    account?.account_type === 'demo' || account?.is_virtual === true || isDemoLoginId(account?.loginid);
const getActiveTransactionAccountId = () => api_base.account_id || localStorage.getItem('active_loginid') || undefined;
const getDerivApi = () => api_base.api as ApiLike | undefined;
const isDerivSocketOpen = () => Number(getDerivApi()?.connection?.readyState) === WebSocket.OPEN;
const hasTradingSession = () => {
    const activeLoginId = localStorage.getItem('active_loginid') || '';
    const selectedAccountOk =
        !isCustomLegacyOAuthDomain() || !activeLoginId || !api_base.account_id || api_base.account_id === activeLoginId;

    return Boolean(
        isDerivSocketOpen() &&
            selectedAccountOk &&
            (isCustomLegacyOAuthDomain() ? api_base.has_authenticated_profitdock_socket : api_base.is_authorized)
    );
};

const getStoredDemoAccount = () => getStoredProfitdockAccounts().find(account => isDemoAccount(account)) || null;

const getAccountListDemoAccount = (accountList: Array<Partial<StoredAccount>>) =>
    accountList.find(account => isDemoAccount(account)) || null;

const getActiveStoredAccount = () => {
    const activeLoginId = localStorage.getItem('active_loginid') || api_base.account_id || '';
    const accounts = getStoredProfitdockAccounts();
    return accounts.find(account => account.loginid === activeLoginId) || accounts[0] || null;
};

const buildSignals = (
    model: DigitModel,
    manualBarriers: Partial<Record<'over' | 'under', number>>,
    selectedDigit: number
): MeshSignal[] => {
    const getOverSignal = () => {
        const candidates = Array.from({ length: 8 }, (_, index) => index + 1).map(barrier => {
            const overCount = model.counts.slice(barrier + 1).reduce((sum, count) => sum + count, 0);
            const observed = overCount / Math.max(model.total, 1);
            const expected = (9 - barrier) / 10;
            return { barrier, expected, observed, z: zScore(observed, expected, model.total) };
        });
        return candidates.find(candidate => candidate.barrier === manualBarriers.over) || candidates.sort((left, right) => Math.abs(right.z) - Math.abs(left.z))[0];
    };

    const getUnderSignal = () => {
        const candidates = Array.from({ length: 8 }, (_, index) => index + 1).map(barrier => {
            const underCount = model.counts.slice(0, barrier).reduce((sum, count) => sum + count, 0);
            const observed = underCount / Math.max(model.total, 1);
            const expected = barrier / 10;
            return { barrier, expected, observed, z: zScore(observed, expected, model.total) };
        });
        return candidates.find(candidate => candidate.barrier === manualBarriers.under) || candidates.sort((left, right) => Math.abs(right.z) - Math.abs(left.z))[0];
    };

    const over = getOverSignal();
    const under = getUnderSignal();
    const evenObserved =
        model.counts.filter((_, digit) => digit % 2 === 0).reduce((sum, count) => sum + count, 0) /
        Math.max(model.total, 1);
    const oddObserved = 1 - evenObserved;
    const selectedDigitStats = {
        digit: selectedDigit,
        frequency: model.frequencies[selectedDigit] || 0,
        z: zScore(model.frequencies[selectedDigit] || 0, 0.1, model.total),
    };
    const matchDigit = selectedDigitStats;
    const differDigit = selectedDigitStats;

    const createSignal = (
        id: SignalKind,
        contractType: MeshContractType,
        values: Pick<MeshSignal, 'barrier' | 'expected' | 'observed' | 'recommendedDigit' | 'z'>
    ): MeshSignal => ({
        ...SIGNAL_META[id],
        ...values,
        buttonText: 'Execute',
        contractType,
        id,
    });

    return [
        createSignal('over', 'DIGITOVER', over),
        createSignal('under', 'DIGITUNDER', under),
        createSignal('even', 'DIGITEVEN', { expected: 0.5, observed: evenObserved, z: zScore(evenObserved, 0.5, model.total) }),
        createSignal('odd', 'DIGITODD', { expected: 0.5, observed: oddObserved, z: zScore(oddObserved, 0.5, model.total) }),
        createSignal('matches', 'DIGITMATCH', {
            expected: 0.1,
            observed: matchDigit.frequency,
            recommendedDigit: matchDigit.digit,
            z: matchDigit.z,
        }),
        createSignal('differs', 'DIGITDIFF', {
            expected: 0.1,
            observed: differDigit.frequency,
            recommendedDigit: differDigit.digit,
            z: differDigit.z,
        }),
    ];
};

const getRankColor = (rank: number) => {
    if (rank === 0) return { background: '#22c55e', foreground: '#061406' };
    if (rank === 1) return { background: '#60a5fa', foreground: '#040c20' };
    if (rank === 8) return { background: '#eab308', foreground: '#1a1200' };
    if (rank === 9) return { background: '#e8445a', foreground: '#ffffff' };
    return { background: '#3a3a3a', foreground: '#888888' };
};

const getBadgeClass = (z: number) => {
    const absoluteZ = Math.abs(z);
    if (absoluteZ >= 3) return 'mesh-page__z-badge--strong';
    if (absoluteZ >= 2) return 'mesh-page__z-badge--moderate';
    if (absoluteZ >= 1) return 'mesh-page__z-badge--marginal';
    return 'mesh-page__z-badge--none';
};

const subscribeToContract = async (
    api: ApiLike,
    contractId: number,
    onUpdate: (contract: ProposalOpenContract) => void,
    onError: (message: string) => void
) => {
    let subscriptionId = '';
    const messageSubscription = api.onMessage().subscribe(message => {
        const data = normalizeApiMessage<OpenContractResponse>(message);
        if (data?.msg_type !== 'proposal_open_contract') return;
        if (data.error) {
            onError(data.error.message || 'Unable to monitor Mesh contract.');
            return;
        }
        if (data.proposal_open_contract?.contract_id === contractId) {
            if (data.subscription?.id) subscriptionId = data.subscription.id;
            onUpdate(data.proposal_open_contract);
        }
    });

    try {
        const response = normalizeApiMessage<OpenContractResponse>(
            await api.send({ contract_id: contractId, proposal_open_contract: 1, subscribe: 1 })
        );
        if (response?.error) throw new Error(response.error.message || 'Unable to monitor Mesh contract.');
        if (response?.subscription?.id) subscriptionId = response.subscription.id;
        if (response?.proposal_open_contract) onUpdate(response.proposal_open_contract);
    } catch (error) {
        messageSubscription.unsubscribe();
        onError(error instanceof Error ? error.message : 'Unable to monitor Mesh contract.');
        return () => undefined;
    }

    return () => {
        messageSubscription.unsubscribe();
        if (subscriptionId) void api.send({ forget: subscriptionId }).catch(() => undefined);
    };
};

const waitForSettlement = (api: ApiLike, contractId: number, onUpdate: (contract: ProposalOpenContract) => void) =>
    new Promise<number>((resolve, reject) => {
        let cleanup: (() => void) | null = null;
        let resolved = false;

        subscribeToContract(
            api,
            contractId,
            contract => {
                onUpdate(contract);
                if (!resolved && (contract.status === 'won' || contract.status === 'lost')) {
                    resolved = true;
                    cleanup?.();
                    resolve(Number(contract.profit || 0));
                }
            },
            errorMessage => {
                if (!resolved) {
                    resolved = true;
                    cleanup?.();
                    reject(new Error(errorMessage));
                }
            }
        )
            .then(cleanupFn => {
                cleanup = cleanupFn;
                if (resolved) cleanup?.();
            })
            .catch(reject);
    });

const requestDirectBuy = async ({
    api,
    currency,
    duration,
    signal,
    stake,
    symbol,
}: {
    api: ApiLike;
    currency: string;
    duration: number;
    signal: MeshSignal;
    stake: number;
    symbol: string;
}) => {
    const buyPayload: Record<string, unknown> = {
        buy: 1,
        price: String(stake),
        parameters: {
            amount: stake,
            basis: 'stake',
            contract_type: signal.contractType,
            currency,
            duration,
            duration_unit: 't',
        }
    };
    
    (buyPayload.parameters as Record<string, unknown>)[isCustomLegacyOAuthDomain() ? 'underlying_symbol' : 'symbol'] = symbol;

    if (signal.barrier !== undefined) (buyPayload.parameters as Record<string, unknown>).barrier = String(signal.barrier);
    if (signal.recommendedDigit !== undefined) (buyPayload.parameters as Record<string, unknown>).barrier = String(signal.recommendedDigit);

    const buyResponse = normalizeApiMessage<BuyResponse>(await api.send(buyPayload));
    if (buyResponse?.error || !buyResponse?.buy?.contract_id) {
        throw new Error(
            [buyResponse?.error?.code, buyResponse?.error?.message || 'Unable to place Mesh bulk trade.']
                .filter(Boolean)
                .join(': ')
        );
    }

    return buyResponse.buy;
};

const DigitRing = ({
    digit,
    frequency,
    isHit,
    rank,
    gap,
    z,
}: {
    digit: number;
    frequency: number;
    isHit: boolean;
    rank: number;
    gap: number;
    z: number;
}) => {
    const radius = 23;
    const circumference = 2 * Math.PI * radius;
    const color = getRankColor(rank);
    const dash = Math.max(0.01, frequency) * circumference;
    const deviationColor = z > 0 ? '#22c55e' : z < 0 ? '#e8445a' : '#64748b';

    return (
        <div className={`mesh-page__digit-ring ${isHit ? 'mesh-page__digit-ring--hit' : ''}`}>
            {isHit && <div className='mesh-page__digit-indicator' />}
            <svg viewBox='0 0 58 58'>
                <circle className='mesh-page__digit-track' cx='29' cy='29' fill='none' r={radius} strokeWidth='5' />
                <circle
                    className='mesh-page__digit-arc'
                    cx='29'
                    cy='29'
                    fill='none'
                    r={radius}
                    stroke={isHit ? '#ffffff' : color.background}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeLinecap='round'
                    strokeWidth='5'
                />
                <text fill={color.foreground} x='29' y='34'>
                    {digit}
                </text>
            </svg>
            <div className='mesh-page__digit-stats'>
                <span>{formatPercent(frequency)}</span>
                <div className='mesh-page__digit-metrics'>
                    <span style={{ color: deviationColor }}>{formatZ(z)}</span>
                    <span className='mesh-page__digit-gap'>{gap}t ago</span>
                </div>
            </div>
        </div>
    );
};

const MeshOrbit = ({
    historyDigits,
    lastHit,
    model,
}: {
    historyDigits: number[];
    lastHit: { digit: number; nonce: number } | null;
    model: DigitModel;
}) => {
    const centerX = 250;
    const centerY = 190;
    const orbitRadius = 112;
    const currentDigit = lastHit?.digit ?? historyDigits[historyDigits.length - 1] ?? 0;
    const points = Array.from({ length: 10 }, (_, digit) => {
        const angle = -Math.PI / 2 + (digit / 10) * Math.PI * 2;
        const frequency = model.frequencies[digit] || 0;
        const count = model.counts[digit] || 0;
        const isCurrent = digit === currentDigit;
        const tone = digit % 2 === 0 ? 'cool' : 'warm';

        return {
            count,
            digit,
            frequency,
            isCurrent,
            radius: Math.max(18, Math.min(42, 19 + frequency * 108)),
            tone,
            x: centerX + Math.cos(angle) * orbitRadius,
            y: centerY + Math.sin(angle) * orbitRadius,
        };
    });
    const trailPairs = [];

    for (let index = historyDigits.length - 1; index > 0; index--) {
        const fromDigit = historyDigits[index - 1];
        const toDigit = historyDigits[index];

        if (points[fromDigit] && points[toDigit] && fromDigit !== toDigit) {
            trailPairs.push({
                from: points[fromDigit],
                key: `${index}-${fromDigit}-${toDigit}`,
                to: points[toDigit],
            });
        }
    }

    return (
        <section className='mesh-page__orbit' aria-label='Mesh digit analysis animation'>
            <svg className='mesh-page__orbit-svg' viewBox='0 0 500 386' role='img'>
                <circle className='mesh-page__orbit-guide' cx={centerX} cy={centerY} r={orbitRadius} />
                {trailPairs.map((line, index) => (
                    <line
                        className={`mesh-page__orbit-trail-line ${
                            index === 0 ? 'mesh-page__orbit-trail-line--current' : ''
                        }`}
                        key={line.key}
                        opacity={index === 0 ? 0.95 : 0.42}
                        x1={line.from.x}
                        x2={line.to.x}
                        y1={line.from.y}
                        y2={line.to.y}
                    />
                ))}
                {points.map(point => (
                    <g
                        className={`mesh-page__orbit-node ${
                            point.isCurrent ? 'mesh-page__orbit-node--hit' : ''
                        }`}
                        key={`${point.digit}-${point.isCurrent ? lastHit?.nonce || 0 : point.count}`}
                        style={
                            {
                                '--mesh-node-fill': point.tone === 'cool' ? '#5b6f8d' : '#a98363',
                                '--mesh-node-text': '#f8fafc',
                            } as React.CSSProperties
                        }
                        transform={`translate(${point.x} ${point.y})`}
                    >
                        {point.isCurrent && (
                            <>
                                <circle className='mesh-page__orbit-pulse' r={point.radius + 7} />
                                <circle className='mesh-page__orbit-hot-ring' r={point.radius + 4} />
                            </>
                        )}
                        <circle className='mesh-page__orbit-bubble' r={point.radius} />
                        <text className='mesh-page__orbit-digit' y='-3'>
                            {point.digit}
                        </text>
                        <text className='mesh-page__orbit-percent' y='8'>
                            {Math.round(point.frequency * 100)}%
                        </text>
                        <text className='mesh-page__orbit-count' y={point.radius + 11}>
                            {point.count}
                        </text>
                    </g>
                ))}
            </svg>
        </section>
    );
};
const SignalCard = ({
    isExecuting,
    manualBarrier,
    onBarrierChange,
    onExecute,
    signal,
}: {
    isExecuting: boolean;
    manualBarrier?: number;
    onBarrierChange: (kind: 'over' | 'under', barrier: number) => void;
    onExecute: () => void;
    signal: MeshSignal;
}) => {
    const enabled = Math.abs(signal.z) >= ENABLED_Z_SCORE;

    return (
        <article
            className={`mesh-page__signal-card ${enabled ? 'mesh-page__signal-card--active' : ''}`}
            id={`mesh-card-${signal.id}`}
            style={
                {
                    '--mesh-accent': signal.accent,
                    '--mesh-button-text': signal.textColor,
                } as React.CSSProperties
            }
        >
            <div className='mesh-page__signal-head'>
                <h3>{signal.label}</h3>
            </div>
            <div className='mesh-page__metric-grid'>
                {(signal.id === 'over' || signal.id === 'under') && (
                    <div className='mesh-page__metric mesh-page__metric--wide'>
                        <span>Barrier</span>
                        <div className='mesh-page__barrier-container'>
                            <div className='mesh-page__barrier-row'>
                                {Array.from({ length: 5 }, (_, index) => index).map(barrier => (
                                    <button
                                        className={barrier === (manualBarrier ?? signal.barrier) ? 'mesh-page__barrier--active' : ''}
                                        key={barrier}
                                        onClick={() => onBarrierChange(signal.id, barrier)}
                                        type='button'
                                    >
                                        {barrier}
                                    </button>
                                ))}
                            </div>
                            <div className='mesh-page__barrier-row'>
                                {Array.from({ length: 5 }, (_, index) => index + 5).map(barrier => (
                                    <button
                                        className={barrier === (manualBarrier ?? signal.barrier) ? 'mesh-page__barrier--active' : ''}
                                        key={barrier}
                                        onClick={() => onBarrierChange(signal.id, barrier)}
                                        type='button'
                                    >
                                        {barrier}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {signal.recommendedDigit !== undefined && (
                    <div className='mesh-page__metric'>
                        <span>Best digit</span>
                        <strong>{signal.recommendedDigit}</strong>
                    </div>
                )}
                <div className='mesh-page__metric'>
                    <span>Expected</span>
                    <strong>{formatPercent(signal.expected)}</strong>
                </div>
                <div className='mesh-page__metric'>
                    <span>Observed</span>
                    <strong>{formatPercent(signal.observed)}</strong>
                </div>
            </div>
            <button className='mesh-page__execute' disabled={!enabled || isExecuting} onClick={onExecute} type='button'>
                {isExecuting ? 'Executing' : signal.buttonText}
            </button>
        </article>
    );
};

const TRADE_CATEGORIES = [
    { label: 'Matches / Differs', value: 'matches_differs', buttons: [
        { label: 'Matches', contractType: 'DIGITMATCH', kind: 'matches', color: '#45a7a1' },
        { label: 'Differs', contractType: 'DIGITDIFF', kind: 'differs', color: '#dd3a3c' }
    ]},
    { label: 'Even / Odd', value: 'even_odd', buttons: [
        { label: 'Even', contractType: 'DIGITEVEN', kind: 'even', color: '#45a7a1' },
        { label: 'Odd', contractType: 'DIGITODD', kind: 'odd', color: '#dd3a3c' }
    ]},
    { label: 'Over / Under', value: 'over_under', buttons: [
        { label: 'Over', contractType: 'DIGITOVER', kind: 'over', color: '#45a7a1' },
        { label: 'Under', contractType: 'DIGITUNDER', kind: 'under', color: '#dd3a3c' }
    ]}
];

const MeshPage = observer(() => {
    const { accountList, activeLoginid, authData, connectionStatus } = useApiBase();
    const { transactions } = useStore();
    const [markets, setMarkets] = useState<MeshMarket[]>([]);
    const [selectedMarket, setSelectedMarket] = useProfitdockPersistentState('profitdock.mesh.market', '');
    const [digits, setDigits] = useState<number[]>([]);
    const [pipSize, setPipSize] = useState(2);
    const [lastHit, setLastHit] = useState<{ digit: number; nonce: number } | null>(null);
    const [isLoadingMarkets, setIsLoadingMarkets] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [manualBarriers, setManualBarriers] = useProfitdockPersistentState<Partial<Record<'over' | 'under', number>>>(
        'profitdock.mesh.barriers',
        {}
    );
    const [stakeValue, setStakeValue] = useProfitdockPersistentState('profitdock.mesh.stake', '1');
    const [feedback, setFeedback] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [flashByCard, setFlashByCard] = useState<Partial<Record<SignalKind, string>>>({});
    const [selectedDigitStr, setSelectedDigitStr] = useProfitdockPersistentState('profitdock.mesh.digit', '5');
    const [selectedTradeCategory, setSelectedTradeCategory] = useProfitdockPersistentState('profitdock.mesh.tradeCategory', 'matches_differs');
    const [numberOfTradesStr, setNumberOfTradesStr] = useProfitdockPersistentState('profitdock.mesh.numberOfTrades', '1');
    const [numberOfTicksStr, setNumberOfTicksStr] = useProfitdockPersistentState('profitdock.mesh.numberOfTicks', '1');
    const windowSize = 1000;
    const selectedDigit = clampDigitValue(selectedDigitStr, 5);
    const tickSocketRef = useRef<WebSocket | null>(null);
    const tickSubscriptionIdRef = useRef<string | null>(null);
    const runningRef = useRef(false);

    const currency = authData?.currency || getStoredProfitdockActiveCurrency() || 'USD';
    const selectedMarketInfo = useMemo(
        () => markets.find(market => market.symbol === selectedMarket) || markets[0] || null,
        [markets, selectedMarket]
    );
    const model = useMemo(() => buildDigitModel(digits), [digits]);
    const activeAccount = useMemo(() => {
        const accountFromHook =
            accountList.find(account => account.loginid === activeLoginid) || accountList.find(account => isDemoAccount(account));
        return accountFromHook || getActiveStoredAccount();
    }, [accountList, activeLoginid]);
    const demoAccount = useMemo(
        () => getAccountListDemoAccount(accountList) || getStoredDemoAccount(),
        [accountList]
    );

    const ensureTradingApi = useCallback(async () => {
        const currentAccount = activeAccount;
        if (!currentAccount?.loginid) {
            throw new Error('Log in to an account before Mesh can execute trades.');
        }

        if (localStorage.getItem('active_loginid') !== currentAccount.loginid) {
            localStorage.setItem('active_loginid', currentAccount.loginid);
            if (currentAccount.token) {
                localStorage.setItem('authToken', currentAccount.token);
            }
        }

        if (!hasTradingSession()) {
            if (!isCustomLegacyOAuthDomain() || !hasUsableProfitdockStoredSession()) {
                throw new Error('Log in before executing Mesh trades.');
            }
            await api_base.init(true);
        }

        const api = getDerivApi();
        const resolvedAccount = getActiveStoredAccount();
        const activeLoginId = localStorage.getItem('active_loginid') || api_base.account_id || resolvedAccount?.loginid || '';

        if (!api || !hasTradingSession()) {
            throw new Error('ProfitDock is still reconnecting to the trading session.');
        }

        return api;
    }, [activeAccount]);

    useEffect(() => {
        let isCancelled = false;

        const loadMarkets = async () => {
            setIsLoadingMarkets(true);
            setError(null);
            try {
                let activeSymbols = await getProfitdockActiveSymbols();
                if (!activeSymbols.length) {
                    const response = await publicRequest<PublicRequestResponse>({ active_symbols: 'brief' });
                    activeSymbols = response.active_symbols || [];
                }

                const candidates = activeSymbols.filter(
                    market => market.exchange_is_open !== 0 && !isExcludedSyntheticMarket(market)
                );
                const supported: MeshMarket[] = [];

                for (const market of candidates.sort((left, right) => (left.display_order || 0) - (right.display_order || 0))) {
                    if (isCancelled) return;
                    try {
                        const response = await publicRequest<PublicRequestResponse>({ contracts_for: market.symbol });
                        const availableContracts =
                            response.contracts_for?.available
                                ?.map(contract => String(contract.contract_type || '').toUpperCase())
                                .filter(Boolean) || [];
                        if (availableContracts.some(contractType => DIGIT_CONTRACTS.has(contractType))) {
                            supported.push({ ...market, supportedContracts: availableContracts });
                            setMarkets([...supported]);
                            setIsLoadingMarkets(false);
                            setSelectedMarket(previous =>
                                previous && supported.some(item => item.symbol === previous)
                                    ? previous
                                    : supported.find(item => item.symbol === 'R_100')?.symbol || supported[0].symbol
                            );
                        }
                    } catch {
                        // Skip symbols whose contracts cannot be confirmed.
                    }
                }

                if (isCancelled) return;
                setMarkets(supported);
                setSelectedMarket(previous =>
                    supported.some(market => market.symbol === previous)
                        ? previous
                        : supported.find(market => market.symbol === 'R_100')?.symbol || supported[0]?.symbol || ''
                );
            } catch (caughtError) {
                if (!isCancelled) {
                    setError(caughtError instanceof Error ? caughtError.message : 'Unable to load Mesh markets.');
                }
            } finally {
                if (!isCancelled) setIsLoadingMarkets(false);
            }
        };

        void loadMarkets();

        return () => {
            isCancelled = true;
        };
    }, [connectionStatus]);

    useEffect(() => {
        if (!selectedMarket) return undefined;

        let isCancelled = false;
        let hasRequestedStream = false;
        const marketPipSize = getPipSizeFromMarket(selectedMarketInfo);
        setIsLoadingHistory(true);
        setError(null);
        setDigits([]);
        tickSubscriptionIdRef.current = null;
        tickSocketRef.current?.close();

        const socket = new WebSocket(DERIV_PUBLIC_WS_URL);
        tickSocketRef.current = socket;
        const send = (payload: Record<string, unknown>) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
        };

        const timeout = window.setTimeout(() => {
            if (!isCancelled) {
                setIsLoadingHistory(false);
                setError('Unable to load the Mesh tick window.');
            }
            socket.close();
        }, 18000);

        socket.onopen = () => {
            send({
                count: 1000,
                end: 'latest',
                style: 'ticks',
                ticks_history: selectedMarket,
            });
        };

        socket.onmessage = event => {
            const data = normalizeApiMessage<PublicRequestResponse>(JSON.parse(String(event.data)));
            if (!data || isCancelled) return;
            if (data.error) {
                window.clearTimeout(timeout);
                setIsLoadingHistory(false);
                setError(data.error.message || 'Unable to load the Mesh tick window.');
                return;
            }

            if (data.history?.prices) {
                window.clearTimeout(timeout);
                const nextPipSize = typeof data.pip_size === 'number' ? data.pip_size : marketPipSize;
                setPipSize(nextPipSize);
                setDigits(data.history.prices.map(price => getDigitFromPrice(Number(price), nextPipSize)).slice(-windowSize));
                setIsLoadingHistory(false);
                if (!hasRequestedStream) {
                    hasRequestedStream = true;
                    send({ subscribe: 1, ticks: selectedMarket });
                }
                return;
            }

            if (data.msg_type === 'tick' && data.tick?.symbol === selectedMarket) {
                const nextPipSize = typeof data.tick.pip_size === 'number' ? data.tick.pip_size : pipSize;
                const digit = getDigitFromPrice(data.tick.quote, nextPipSize);
                if (data.subscription?.id) tickSubscriptionIdRef.current = data.subscription.id;
                setPipSize(nextPipSize);
                setLastHit({ digit, nonce: Date.now() });
                setDigits(previous => [...previous, digit].slice(-windowSize));
            }
        };

        socket.onerror = () => {
            window.clearTimeout(timeout);
            if (!isCancelled) {
                setIsLoadingHistory(false);
                setError('Unable to open the Mesh tick stream.');
            }
        };

        return () => {
            isCancelled = true;
            window.clearTimeout(timeout);
            if (socket.readyState === WebSocket.OPEN && tickSubscriptionIdRef.current) {
                send({ forget: tickSubscriptionIdRef.current });
            }
            socket.close();
        };
    }, [selectedMarket, windowSize]);

    const flashCard = (cardId: SignalKind, color: string) => {
        setFlashByCard(previous => ({ ...previous, [cardId]: color }));
        window.setTimeout(() => {
            setFlashByCard(previous => ({ ...previous, [cardId]: undefined }));
        }, 600);
    };

    const handleRun = async (button: { contractType: string; kind: string; label: string }) => {
        if (runningRef.current) return;
        const count = Math.max(1, Math.min(100, Math.trunc(Number(numberOfTradesStr))));
        const stake = Number(stakeValue);

        if (!Number.isFinite(stake) || stake <= 0) {
            setFeedback('Enter a valid stake.');
            return;
        }
        if (!selectedMarketInfo) {
            setFeedback('Select a market first.');
            return;
        }

        setIsRunning(true);
        setFeedback(null);
        runningRef.current = true;

        try {
            const api = await ensureTradingApi();
            const signal: MeshSignal = {
                id: button.kind as SignalKind,
                contractType: button.contractType as MeshContractType,
                barrier: selectedDigit,
                recommendedDigit: selectedDigit,
                accent: '#22c55e',
                textColor: '#fff',
                buttonText: '',
                expected: 0,
                label: '',
                observed: 0,
                z: 0
            };

            const promises = Array.from({ length: count }).map(async () => {
                if (!runningRef.current) return;
                const buy = await requestDirectBuy({
                    api,
                    currency,
                    duration: Math.max(1, Math.min(10, Math.trunc(Number(numberOfTicksStr)))),
                    signal,
                    stake,
                    symbol: selectedMarketInfo.symbol,
                });

                const contractId = Number(buy.contract_id);
                const updateTransaction = (contract: ProposalOpenContract) => {
                    transactions.pushTransaction({
                        ...contract,
                        accountID: getActiveTransactionAccountId(),
                        source: 'mesh',
                    } as ProposalOpenContract & { accountID?: string; source?: string });
                };
                
                await waitForSettlement(api, contractId, updateTransaction);
            });

            await Promise.allSettled(promises);

            if (runningRef.current) {
                setFeedback(`Successfully completed ${count} bulk trade(s).`);
            }
        } catch (caughtError) {
            setFeedback(caughtError instanceof Error ? caughtError.message : 'Unable to place Mesh trade.');
        } finally {
            setIsRunning(false);
            runningRef.current = false;
        }
    };


    useEffect(() => {
        emitProfitdockTradeStatus({
            canStart: Boolean(selectedMarketInfo),
            canStop: isRunning,
            feature: 'mesh',
            label: isRunning ? 'Mesh running' : 'Mesh ready',
            running: isRunning,
        });
    }, [isRunning, selectedMarketInfo]);

    useEffect(
        () =>
            subscribeProfitdockTradeStart(request => {
                if (request.feature !== 'mesh') return;
                // void handleRun(); - Auto-run needs to be updated if used remotely, ignoring for now since it requires specific button
            }),
        [handleRun]
    );

    useEffect(
        () =>
            subscribeProfitdockTradeStop(request => {
                if (request.feature && request.feature !== 'mesh') return;

                runningRef.current = false;
                setIsRunning(false);
                setFeedback('Mesh trading stopped.');
            }),
        []
    );

    const getButtonFrequency = (kind: string) => {
        if (kind === 'matches') return model.frequencies[selectedDigit] || 0;
        if (kind === 'differs') return 1 - (model.frequencies[selectedDigit] || 0);
        if (kind === 'even') return model.frequencies.filter((_, i) => i % 2 === 0).reduce((a,b)=>a+b,0);
        if (kind === 'odd') return 1 - model.frequencies.filter((_, i) => i % 2 === 0).reduce((a,b)=>a+b,0);
        if (kind === 'over') return model.counts.slice(selectedDigit + 1).reduce((a,b)=>a+b,0) / Math.max(model.total, 1);
        if (kind === 'under') return model.counts.slice(0, selectedDigit).reduce((a,b)=>a+b,0) / Math.max(model.total, 1);
        return 0;
    };

    return (
        <div className='mesh-page'>
            <div className='mesh-page__shell'>
                <section className='mesh-page__topbar'>
                    <div className="mesh-page__topbar-row">
                        <label className='mesh-page__market-field' htmlFor='mesh-market'>
                            <span className='mesh-page__input-label'>Market</span>
                            <div className='mesh-page__select-wrap'>
                                <select
                                    disabled={(isLoadingMarkets && !markets.length) || !markets.length || isRunning}
                                    id='mesh-market'
                                    onChange={event => setSelectedMarket(event.target.value)}
                                    value={selectedMarket}
                                >
                                    {markets.map(market => (
                                        <option key={market.symbol} value={market.symbol}>
                                            {market.display_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </label>
                        <label className='mesh-page__market-field' htmlFor='mesh-trade-type'>
                            <span className='mesh-page__input-label'>Trade Type</span>
                            <div className='mesh-page__select-wrap'>
                                <select
                                    disabled={isRunning}
                                    id='mesh-trade-type'
                                    onChange={event => setSelectedTradeCategory(event.target.value)}
                                    value={selectedTradeCategory}
                                >
                                    {TRADE_CATEGORIES.map(category => (
                                        <option key={category.value} value={category.value}>
                                            {category.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </label>
                    </div>
                    <div className="mesh-page__topbar-row">
                        <label className='mesh-page__market-field' htmlFor='mesh-ticks'>
                            <span className='mesh-page__input-label'>Number of Ticks</span>
                            <div className='mesh-page__select-wrap'>
                                <input
                                    disabled={isRunning}
                                    id='mesh-ticks'
                                    inputMode='numeric'
                                    max='10'
                                    min='1'
                                    onChange={event => {
                                        const next = event.target.value;
                                        if (next === '' || Number(next) <= 10) setNumberOfTicksStr(next);
                                    }}
                                    placeholder='1-10'
                                    type='number'
                                    value={numberOfTicksStr}
                                />
                            </div>
                        </label>
                        <label className='mesh-page__market-field' htmlFor='mesh-prediction'>
                            <span className='mesh-page__input-label'>Prediction</span>
                            <div className='mesh-page__select-wrap'>
                                <select
                                    disabled={isRunning}
                                    id='mesh-prediction'
                                    onChange={event => setSelectedDigitStr(event.target.value)}
                                    value={selectedDigitStr}
                                >
                                    {Array.from({ length: 10 }, (_, digit) => (
                                        <option key={digit} value={digit}>
                                            {digit}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </label>
                    </div>
                </section>

                {error && <div className='mesh-page__notice'>{error}</div>}
                {feedback && <div className='mesh-page__notice mesh-page__notice--trade'>{feedback}</div>}

                <MeshOrbit historyDigits={digits} lastHit={lastHit} model={model} />

                <div className='mesh-page__bottom-controls'>
                    <div className='mesh-page__bottom-inputs'>
                        <label className='mesh-page__market-field' htmlFor='mesh-bottom-ticks'>
                            <span className='mesh-page__input-label'>Ticks</span>
                            <div className='mesh-page__select-wrap'>
                                <input
                                    disabled={isRunning}
                                    id='mesh-bottom-ticks'
                                    inputMode='numeric'
                                    max='10'
                                    min='1'
                                    onChange={event => {
                                        const next = event.target.value;
                                        if (next === '' || Number(next) <= 10) setNumberOfTicksStr(next);
                                    }}
                                    type='number'
                                    value={numberOfTicksStr}
                                />
                            </div>
                        </label>
                        <label className='mesh-page__market-field' htmlFor='mesh-stake'>
                            <span className='mesh-page__input-label'>Stake</span>
                            <div className='mesh-page__select-wrap'>
                                <input
                                    disabled={isRunning}
                                    id='mesh-stake'
                                    inputMode='decimal'
                                    onChange={event => setStakeValue(event.target.value)}
                                    placeholder='Stake'
                                    type='number'
                                    value={stakeValue}
                                />
                            </div>
                        </label>
                        <label className='mesh-page__market-field' htmlFor='mesh-trades'>
                            <span className='mesh-page__input-label'>No of Trades</span>
                            <div className='mesh-page__select-wrap'>
                                <input
                                    disabled={isRunning}
                                    id='mesh-trades'
                                    inputMode='numeric'
                                    max='100'
                                    min='1'
                                    onChange={event => {
                                        const next = event.target.value;
                                        if (next === '' || Number(next) <= 100) setNumberOfTradesStr(next);
                                    }}
                                    placeholder='1-100'
                                    type='number'
                                    value={numberOfTradesStr}
                                />
                            </div>
                        </label>
                    </div>

                    <div className='mesh-page__action-bars'>
                        {TRADE_CATEGORIES.find(c => c.value === selectedTradeCategory)?.buttons.map(button => {
                            const frequency = getButtonFrequency(button.kind);
                            return (
                                <button
                                    key={button.kind}
                                    className={`mesh-page__action-bar mesh-page__action-bar--${button.kind}`}
                                    disabled={isRunning || !markets.length}
                                    onClick={() => handleRun(button)}
                                    style={{ '--action-color': button.color } as React.CSSProperties}
                                    type='button'
                                >
                                    <div className="mesh-page__action-label">{isRunning ? 'Running...' : button.label}</div>
                                    <div className="mesh-page__action-percent">{formatPercent(frequency)}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
            {Object.entries(flashByCard).map(([card, color]) =>
                color ? <style key={card}>{`#mesh-card-${card}{border-color:${color}!important;box-shadow:0 0 12px ${color}44!important;}`}</style> : null
            )}
        </div>
    );
});

export default MeshPage;
