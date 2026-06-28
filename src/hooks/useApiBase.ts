import { useEffect, useState } from 'react';
import {
    account_list$,
    authData$,
    CONNECTION_STATUS,
    connectionStatus$,
    isAuthorized$,
    isAuthorizing$,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import {
    getStoredProfitdockActiveAccount,
    hasUsableProfitdockStoredSession,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { TAuthData } from '@/types/api-types';

const hasStoredProfitdockSession = () => {
    if (typeof window === 'undefined') return false;

    return window.location.hostname.includes('profitdock.site') && hasUsableProfitdockStoredSession();
};

const getStoredLoginid = () => {
    if (typeof window === 'undefined') return '';
    return getStoredProfitdockActiveAccount()?.loginid || localStorage.getItem('active_loginid') || '';
};

const isProfitdockDomain = () => typeof window !== 'undefined' && window.location.hostname.includes('profitdock.site');

const getStoredAccountList = (): TAuthData['account_list'] => {
    if (typeof window === 'undefined') return [];

    try {
        const stored_accounts = JSON.parse(localStorage.getItem('client.accounts') || '[]');
        if (Array.isArray(stored_accounts) && stored_accounts.length) {
            return stored_accounts;
        }

        const stored_client_accounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
        if (stored_client_accounts && typeof stored_client_accounts === 'object') {
            return Object.values(stored_client_accounts) as TAuthData['account_list'];
        }

        return [];
    } catch (error) {
        console.error('[ProfitDock Auth] Failed to parse stored account list:', error);
        return [];
    }
};

export const useApiBase = () => {
    const [connectionStatus, setConnectionStatus] = useState<CONNECTION_STATUS>(CONNECTION_STATUS.UNKNOWN);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);
    const [accountList, setAccountList] = useState<TAuthData['account_list']>(getStoredAccountList());
    const [authData, setAuthData] = useState<TAuthData | null>(null);
    const [activeLoginid, setActiveLoginid] = useState<string>(getStoredLoginid());

    useEffect(() => {
        const connectionStatusSubscription = connectionStatus$.subscribe(status => {
            setConnectionStatus(status as CONNECTION_STATUS);
        });

        const isAuthorizedSubscription = isAuthorized$.subscribe(isAuthorized => {
            setIsAuthorized(isAuthorized);
        });

        const isAuthorizingSubscription = isAuthorizing$.subscribe(isAuthorizing => {
            setIsAuthorizing(isAuthorizing);
        });
        const accountListSubscription = account_list$.subscribe(accountList => {
            if (accountList?.length) {
                setAccountList(accountList);
                return;
            }

            setAccountList(hasStoredProfitdockSession() ? getStoredAccountList() : []);
        });
        const authDataSubscription = authData$.subscribe(authData => {
            setAuthData(authData);
            setActiveLoginid(authData?.loginid ?? (hasStoredProfitdockSession() ? getStoredLoginid() : ''));
        });

        return () => {
            connectionStatusSubscription.unsubscribe();
            isAuthorizedSubscription.unsubscribe();
            isAuthorizingSubscription.unsubscribe();
            accountListSubscription.unsubscribe();
            authDataSubscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!isProfitdockDomain()) {
            return;
        }

        let previous_signature = '';
        const syncFromStoredSession = () => {
            const stored_loginid = getStoredLoginid();
            const stored_accounts = getStoredAccountList();
            const signature = JSON.stringify({
                account_ids: stored_accounts.map(account => account.loginid),
                has_auth_token: !!localStorage.getItem('authToken'),
                loginid: stored_loginid,
            });

            if (signature === previous_signature) {
                return;
            }

            previous_signature = signature;

            if (stored_accounts.length) {
                setAccountList(stored_accounts);
            }

            if (stored_loginid) {
                setActiveLoginid(stored_loginid);
                return;
            }

            if (stored_accounts[0]?.loginid) {
                setActiveLoginid(stored_accounts[0].loginid);
            }
        };

        syncFromStoredSession();
        const interval_id = window.setInterval(syncFromStoredSession, 400);
        window.addEventListener('focus', syncFromStoredSession);

        return () => {
            window.clearInterval(interval_id);
            window.removeEventListener('focus', syncFromStoredSession);
        };
    }, []);

    return { connectionStatus, isAuthorized, isAuthorizing, accountList, authData, activeLoginid };
};
