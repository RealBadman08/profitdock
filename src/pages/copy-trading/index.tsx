import React, { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ProfitDockSmoothPage, ProfitDockSmoothSection } from '@/components/profitdock-smooth-layout';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { getProfitdockOAuthToken } from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import './copy-trading.scss';

type TAccountType = 'real' | 'demo' | 'virtual' | 'unknown';

type TConnectedAccount = {
    account_name: string;
    account_type: TAccountType;
    balance: number;
    connection_status: 'connected' | 'authentication_expired' | 'deleted';
    copy_trading_enabled: boolean;
    created_at: string;
    currency: string;
    deriv_account_id: string;
    id: string;
    updated_at: string;
};

type TNotice = {
    message: string;
    tone: 'error' | 'info' | 'success';
} | null;

type TCopyTradingResponse = {
    account?: TConnectedAccount;
    accounts?: TConnectedAccount[];
    connected?: TConnectedAccount[];
    error?: string;
    message?: string;
    ok?: boolean;
};

const MAX_CONNECTED_ACCOUNTS = 20;

const requestCopyTrading = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const sessionToken = getProfitdockOAuthToken();
    const activeLoginid = localStorage.getItem('active_loginid') || (window as any).__profitdockActiveLoginid || '';

    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    if (sessionToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${sessionToken}`);
    }

    if (activeLoginid && !headers.has('X-Deriv-Loginid')) {
        headers.set('X-Deriv-Loginid', activeLoginid);
    }

    const response = await fetch(path, {
        ...init,
        credentials: 'include',
        headers,
    });
    const text = await response.text();
    let payload: TCopyTradingResponse = {};

    try {
        payload = (text ? JSON.parse(text) : {}) as TCopyTradingResponse;
    } catch {
        payload = { message: text || 'Copy Trading request failed.' };
    }

    if (!response.ok) {
        throw new Error(payload.message || 'Copy Trading request failed.');
    }

    return payload;
};

const keepRealAccounts = (accounts: TConnectedAccount[] = []) =>
    accounts.filter(account => account.account_type === 'real' && account.connection_status !== 'deleted');

const getAvatarInitials = (account: TConnectedAccount) => {
    const displayName = String(account.account_name || account.deriv_account_id || '').trim();
    const initials = displayName
        .replace(/[^a-z0-9 ]/gi, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part[0])
        .join('');

    return (initials || account.deriv_account_id || 'RA').slice(0, 2).toUpperCase();
};

const getAccountBalance = (account: TConnectedAccount) => {
    const balance = Number(account.balance);
    const amount = Number.isFinite(balance) ? balance.toFixed(2) : '0.00';
    return `${amount} ${account.currency || ''}`.trim();
};

const CopyTrading = observer(() => {
    const { connectionStatus, isAuthorized, isAuthorizing } = useApiBase();
    const { client } = useStore();
    const tokenInputRef = useRef<HTMLInputElement>(null);
    const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [accounts, setAccounts] = useState<TConnectedAccount[]>([]);
    const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [isTokenVisible, setIsTokenVisible] = useState(false);
    const [menuAccountId, setMenuAccountId] = useState<string | null>(null);
    const [notice, setNotice] = useState<TNotice>(null);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [replacementToken, setReplacementToken] = useState('');
    const [storedAuthToken, setStoredAuthToken] = useState('');

    const canManageAccounts = isAuthorized || connectionStatus === CONNECTION_STATUS.OPENED || !!storedAuthToken;
    const realAccounts = keepRealAccounts(accounts);
    const connectedAccountLimitReached = realAccounts.length >= MAX_CONNECTED_ACCOUNTS;

    useEffect(() => {
        const syncStoredToken = () => setStoredAuthToken(getProfitdockOAuthToken());
        syncStoredToken();

        const interval = window.setInterval(syncStoredToken, 1500);
        window.addEventListener('storage', syncStoredToken);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener('storage', syncStoredToken);
        };
    }, []);

    useEffect(() => {
        if (!notice) {
            return undefined;
        }

        const timeout = window.setTimeout(() => setNotice(null), 6500);
        return () => window.clearTimeout(timeout);
    }, [notice]);

    useEffect(() => {
        const closeMenu = (event: MouseEvent) => {
            if (!menuAccountId) return;
            const currentMenu = menuRefs.current[menuAccountId];
            if (currentMenu && !currentMenu.contains(event.target as Node)) {
                setMenuAccountId(null);
            }
        };

        document.addEventListener('mousedown', closeMenu);
        return () => document.removeEventListener('mousedown', closeMenu);
    }, [menuAccountId]);

    const loadAccounts = useCallback(async () => {
        if (!canManageAccounts) {
            setAccounts([]);
            return;
        }

        setIsLoading(true);
        try {
            const payload = await requestCopyTrading('/api/copy-trading/accounts');
            setAccounts(keepRealAccounts(payload.accounts || []));
        } catch (error) {
            setNotice({
                message: error instanceof Error ? error.message : 'Unable to load connected Copy Trading accounts.',
                tone: 'error',
            });
        } finally {
            setIsLoading(false);
            setHasLoadedOnce(true);
        }
    }, [canManageAccounts]);

    useEffect(() => {
        void loadAccounts();
    }, [loadAccounts]);

    // Refresh balances every 30 seconds
    useEffect(() => {
        if (!canManageAccounts) return undefined;

        const interval = window.setInterval(() => {
            void loadAccounts();
        }, 30_000);

        return () => window.clearInterval(interval);
    }, [canManageAccounts, loadAccounts]);

    // Refresh immediately after each copy trade completes
    useEffect(() => {
        const onCopyTradingResult = () => {
            void loadAccounts();
        };

        window.addEventListener('profitdock:copy-trading-result', onCopyTradingResult);
        return () => window.removeEventListener('profitdock:copy-trading-result', onCopyTradingResult);
    }, [loadAccounts]);

    const updateAccountInState = (updatedAccount: TConnectedAccount) => {
        if (updatedAccount.account_type !== 'real') return;
        setAccounts(previous =>
            keepRealAccounts(previous.map(account => (account.id === updatedAccount.id ? updatedAccount : account)))
        );
    };

    const handleAddAccount = async () => {
        const token = tokenInputRef.current?.value.trim() || '';

        if (!canManageAccounts) {
            setNotice({ message: 'Log in to ProfitDock before connecting Copy Trading accounts.', tone: 'error' });
            return;
        }

        if (!token) {
            setNotice({ message: 'Enter a Deriv API token to add an account.', tone: 'error' });
            return;
        }

        if (connectedAccountLimitReached) {
            setNotice({ message: 'You can connect up to 20 real Deriv accounts.', tone: 'error' });
            return;
        }

        setPendingAction('connect');
        try {
            const payload = await requestCopyTrading('/api/copy-trading/accounts', {
                body: JSON.stringify({ token }),
                method: 'POST',
            });

            setAccounts(keepRealAccounts(payload.accounts || payload.connected || []));
            if (tokenInputRef.current) tokenInputRef.current.value = '';
            setNotice({ message: 'Real Deriv account added securely.', tone: 'success' });
        } catch (error) {
            setNotice({
                message: error instanceof Error ? error.message : 'Unable to connect that Deriv account.',
                tone: 'error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleToggleCopying = async (account: TConnectedAccount, enabled: boolean) => {
        if (account.connection_status !== 'connected') {
            setNotice({ message: 'Reconnect this account before enabling copied trades.', tone: 'error' });
            return;
        }

        setPendingAction(`toggle-${account.id}`);
        try {
            const payload = await requestCopyTrading('/api/copy-trading/account', {
                body: JSON.stringify({
                    account_id: account.id,
                    copy_trading_enabled: enabled,
                }),
                method: 'PATCH',
            });

            if (payload.account) updateAccountInState(payload.account);
            setNotice({
                message: enabled
                    ? 'Copied trades enabled for this account.'
                    : 'Copied trades disabled for this account.',
                tone: 'success',
            });
        } catch (error) {
            setNotice({
                message: error instanceof Error ? error.message : 'Unable to update Copy Trading for this account.',
                tone: 'error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleStartEditAccount = (account: TConnectedAccount) => {
        setEditingAccountId(account.id);
        setReplacementToken('');
        setMenuAccountId(null);
    };

    const handleReplaceAccountToken = async (account: TConnectedAccount) => {
        const token = replacementToken.trim();
        if (!token) {
            setNotice({ message: 'Paste the replacement Deriv API token first.', tone: 'error' });
            return;
        }

        setPendingAction(`replace-${account.id}`);
        try {
            const payload = await requestCopyTrading('/api/copy-trading/accounts', {
                body: JSON.stringify({ token }),
                method: 'POST',
            });
            const nextAccounts = keepRealAccounts(payload.accounts || payload.connected || []);
            const accountWasUpdated = nextAccounts.some(item => item.deriv_account_id === account.deriv_account_id);

            setAccounts(nextAccounts);
            setEditingAccountId(null);
            setReplacementToken('');
            setNotice({
                message: accountWasUpdated
                    ? 'Saved credential replaced for this account.'
                    : 'Token connected account(s), but not the account you selected.',
                tone: accountWasUpdated ? 'success' : 'info',
            });
        } catch (error) {
            setNotice({
                message: error instanceof Error ? error.message : 'Unable to replace this account token.',
                tone: 'error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleDisconnectAccount = async (account: TConnectedAccount) => {
        const confirmed = window.confirm(`Delete ${account.deriv_account_id} from Copy Trading?`);
        if (!confirmed) return;

        setPendingAction(`delete-${account.id}`);
        setMenuAccountId(null);
        try {
            await requestCopyTrading('/api/copy-trading/account', {
                body: JSON.stringify({ account_id: account.id }),
                method: 'DELETE',
            });

            setAccounts(previous => previous.filter(item => item.id !== account.id));
            setNotice({ message: 'Deriv account deleted from Copy Trading.', tone: 'success' });
        } catch (error) {
            setNotice({
                message: error instanceof Error ? error.message : 'Unable to delete this account.',
                tone: 'error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    return (
        <ProfitDockSmoothPage className='copy-trading' maxWidth='78rem'>
            <ProfitDockSmoothSection className='copy-trading__panel' ariaLabel='Copy Trading account manager'>
                <div className='copy-trading__token-section'>
                    <div className='copy-trading__input-shell'>
                        <input
                            autoComplete='off'
                            disabled={isAuthorizing || pendingAction === 'connect' || connectedAccountLimitReached}
                            id='copy-trading-token-input'
                            placeholder='Enter Deriv API token'
                            ref={tokenInputRef}
                            type={isTokenVisible ? 'text' : 'password'}
                        />
                        <button
                            aria-label={isTokenVisible ? 'Hide Deriv API token' : 'Show Deriv API token'}
                            className='copy-trading__eye-button'
                            onClick={() => setIsTokenVisible(previous => !previous)}
                            type='button'
                        >
                            <svg aria-hidden='true' height='24' viewBox='0 0 24 24' width='24'>
                                <path
                                    d='M2.6 12s3.4-6 9.4-6 9.4 6 9.4 6-3.4 6-9.4 6-9.4-6-9.4-6Z'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                    strokeWidth='2'
                                />
                                <circle cx='12' cy='12' fill='none' r='3' stroke='currentColor' strokeWidth='2' />
                            </svg>
                        </button>
                    </div>
                    <button
                        className='copy-trading__add-button'
                        disabled={
                            !canManageAccounts ||
                            isAuthorizing ||
                            pendingAction === 'connect' ||
                            connectedAccountLimitReached
                        }
                        onClick={() => void handleAddAccount()}
                        type='button'
                    >
                        {pendingAction === 'connect' ? 'Adding account...' : 'Add Account'}
                    </button>
                </div>

                <div className='copy-trading__section-heading' style={{ marginTop: '2.4rem' }}>
                    <button
                        aria-label='Refresh connected accounts'
                        className='copy-trading__refresh-button'
                        disabled={!canManageAccounts || isLoading}
                        onClick={() => void loadAccounts()}
                        type='button'
                    >
                        <svg aria-hidden='true' viewBox='0 0 24 24'>
                            <path
                                d='M20 12a8 8 0 0 1-13.66 5.66M4 12A8 8 0 0 1 17.66 6.34M17 3v4h-4M7 21v-4h4'
                                fill='none'
                                stroke='currentColor'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth='2.2'
                            />
                        </svg>
                    </button>
                </div>

                {!canManageAccounts ? (
                    <div className='copy-trading__empty'>
                        Log in to ProfitDock before managing Copy Trading accounts.
                    </div>
                ) : null}

                <div className='copy-trading__account-list'>
                    {!hasLoadedOnce && isLoading ? (
                        <div className='copy-trading__empty'>Loading accounts...</div>
                    ) : realAccounts.length > 0 || client.virtual_cr_accounts.length > 0 ? (
                        [
                            ...realAccounts.map(a => ({ isVirtual: false, acc: a, id: a.id })),
                            ...client.virtual_cr_accounts.map(a => ({ isVirtual: true, acc: a as any, id: a.id })),
                        ].map((item, index) => {
                            if (item.isVirtual) {
                                const acc = item.acc as any; // TVirtualCRAccount
                                const isEnabled = acc.copy_trading_enabled;
                                const avatarTone = index % 5;
                                return (
                                    <article className='copy-trading__account-card' key={acc.id} style={{ opacity: 1 }}>
                                        <div className={`copy-trading__avatar copy-trading__avatar--${avatarTone}`}>
                                            {acc.deriv_account_id.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className='copy-trading__account-text'>
                                            <strong>{acc.deriv_account_id}</strong>
                                            <span>
                                                {acc.label !== acc.deriv_account_id ? `${acc.label} · ` : ''}
                                                {acc.balance.toFixed(2)} {acc.currency}
                                            </span>
                                        </div>
                                        <label
                                            className={`copy-trading__switch ${isEnabled ? 'copy-trading__switch--enabled' : 'copy-trading__switch--disabled'}`}
                                        >
                                            <input
                                                checked={isEnabled}
                                                onChange={e =>
                                                    client.toggleVirtualCRAccount(acc.id, e.currentTarget.checked)
                                                }
                                                type='checkbox'
                                            />
                                            <span />
                                        </label>
                                        <div
                                            className='copy-trading__menu-anchor'
                                            ref={element => {
                                                menuRefs.current[acc.id] = element;
                                            }}
                                        >
                                            <button
                                                aria-expanded={menuAccountId === acc.id}
                                                aria-label='Account actions'
                                                className='copy-trading__menu-button'
                                                onClick={() =>
                                                    setMenuAccountId(previous => (previous === acc.id ? null : acc.id))
                                                }
                                                type='button'
                                            >
                                                <span />
                                                <span />
                                                <span />
                                            </button>
                                            {menuAccountId === acc.id ? (
                                                <div className='copy-trading__menu' role='menu'>
                                                    <div
                                                        style={{
                                                            padding: '8px 16px',
                                                            fontSize: '12px',
                                                            color: '#818cf8',
                                                            fontWeight: 600,
                                                            borderBottom: '1px solid #333',
                                                        }}
                                                    >
                                                        Virtual Account
                                                    </div>
                                                    <button
                                                        className='copy-trading__menu-danger'
                                                        onClick={() => {
                                                            if (window.confirm(`Delete ${acc.deriv_account_id}?`)) {
                                                                client.removeVirtualCRAccount(acc.id);
                                                                setMenuAccountId(null);
                                                            }
                                                        }}
                                                        type='button'
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    </article>
                                );
                            } else {
                                const account = item.acc as TConnectedAccount;
                                const isPending = pendingAction?.endsWith(account.id);
                                const isEnabled =
                                    account.copy_trading_enabled && account.connection_status === 'connected';
                                const avatarTone = index % 5;

                                return (
                                    <article className='copy-trading__account-card' key={account.id}>
                                        <div className={`copy-trading__avatar copy-trading__avatar--${avatarTone}`}>
                                            {getAvatarInitials(account)}
                                        </div>
                                        <div className='copy-trading__account-text'>
                                            <strong>{account.deriv_account_id}</strong>
                                            <span>{getAccountBalance(account)}</span>
                                        </div>
                                        <label
                                            className={`copy-trading__switch ${isEnabled ? 'copy-trading__switch--enabled' : 'copy-trading__switch--disabled'}`}
                                        >
                                            <input
                                                checked={isEnabled}
                                                disabled={account.connection_status !== 'connected' || isPending}
                                                onChange={event =>
                                                    void handleToggleCopying(account, event.currentTarget.checked)
                                                }
                                                type='checkbox'
                                            />
                                            <span />
                                        </label>
                                        <div
                                            className='copy-trading__menu-anchor'
                                            ref={element => {
                                                menuRefs.current[account.id] = element;
                                            }}
                                        >
                                            <button
                                                aria-expanded={menuAccountId === account.id}
                                                aria-label='Account actions'
                                                className='copy-trading__menu-button'
                                                disabled={isPending}
                                                onClick={() =>
                                                    setMenuAccountId(previous =>
                                                        previous === account.id ? null : account.id
                                                    )
                                                }
                                                type='button'
                                            >
                                                <span />
                                                <span />
                                                <span />
                                            </button>
                                            {menuAccountId === account.id ? (
                                                <div className='copy-trading__menu' role='menu'>
                                                    <button
                                                        onClick={() => handleStartEditAccount(account)}
                                                        type='button'
                                                    >
                                                        Edit token
                                                    </button>
                                                    <button
                                                        className='copy-trading__menu-danger'
                                                        onClick={() => void handleDisconnectAccount(account)}
                                                        type='button'
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>

                                        {editingAccountId === account.id ? (
                                            <div className='copy-trading__replace-row'>
                                                <input
                                                    autoComplete='off'
                                                    disabled={isPending}
                                                    onChange={event => setReplacementToken(event.currentTarget.value)}
                                                    placeholder='Paste replacement Deriv API token'
                                                    type='password'
                                                    value={replacementToken}
                                                />
                                                <button
                                                    disabled={isPending}
                                                    onClick={() => void handleReplaceAccountToken(account)}
                                                    type='button'
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    disabled={isPending}
                                                    onClick={() => {
                                                        setEditingAccountId(null);
                                                        setReplacementToken('');
                                                    }}
                                                    type='button'
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : null}
                                    </article>
                                );
                            }
                        })
                    ) : (
                        <div className='copy-trading__empty'>
                            No accounts connected yet. Add a Deriv API token or Virtual Account to begin.
                        </div>
                    )}
                </div>

                {notice ? (
                    <div className={`copy-trading__notice copy-trading__notice--${notice.tone}`}>{notice.message}</div>
                ) : null}
            </ProfitDockSmoothSection>
        </ProfitDockSmoothPage>
    );
});

export default CopyTrading;
