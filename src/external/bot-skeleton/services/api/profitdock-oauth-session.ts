import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { clearAuthData, setLoggedStateCookie } from '@/utils/auth-utils';

const DERIV_CLIENT_ID = '339iXSWkH7NEGne7sMdQT';
const DERIV_OPTIONS_ACCOUNTS_URL = 'https://api.derivws.com/trading/v1/options/accounts';
const PROFITDOCK_OPTIONS_ACCOUNT_GROUP = 'row';
const PROFITDOCK_OPTIONS_ACCOUNT_CURRENCY = 'USD';
const PROFITDOCK_API_TIMEOUT_MS = 12000;
const PROFITDOCK_RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const PROFITDOCK_USE_OPTIONS_OAUTH = true;

type TProfitdockSessionError = Error & {
    code?: string;
    status?: number;
};

const getProfitdockApiError = (payload: any) => {
    const first_error = Array.isArray(payload?.errors) ? payload.errors[0] : null;

    return {
        code: first_error?.code || payload?.error?.code || payload?.code || payload?.error || '',
        message: first_error?.message || payload?.error?.message || payload?.message || '',
    };
};

const createProfitdockSessionError = (message: string, code?: string, status?: number) => {
    const error = new Error(message) as TProfitdockSessionError;
    error.code = code;
    error.status = status;
    return error;
};

const wait = (delay_ms: number) => new Promise(resolve => window.setTimeout(resolve, delay_ms));

const fetchProfitdockJson = async ({
    access_token,
    body,
    error_message,
    method = 'GET',
    url,
}: {
    access_token: string;
    body?: Record<string, unknown>;
    error_message: string;
    method?: 'GET' | 'POST';
    url: string;
}) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), PROFITDOCK_API_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            body: body ? JSON.stringify(body) : undefined,
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${access_token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                'Deriv-App-ID': DERIV_CLIENT_ID,
            },
            method,
            signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            const api_error = getProfitdockApiError(payload);
            throw createProfitdockSessionError(error_message || api_error.message || 'ProfitDock request failed.', api_error.code, response.status);
        }

        return payload;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw createProfitdockSessionError(`${error_message} Request timed out.`, 'RequestTimeout', 408);
        }

        const session_error = error as TProfitdockSessionError;
        if (session_error?.status || session_error?.code) {
            throw session_error;
        }

        throw createProfitdockSessionError(`${error_message} Network request failed.`);
    } finally {
        window.clearTimeout(timeout);
    }
};

const withProfitdockRetry = async <T>(task: () => Promise<T>, label: string, max_attempts = 2): Promise<T> => {
    let attempt = 0;
    let last_error: unknown;

    while (attempt < max_attempts) {
        try {
            return await task();
        } catch (error) {
            last_error = error;
            const session_error = error as TProfitdockSessionError;
            const is_retryable =
                !isProfitdockAuthSessionError(error) &&
                (!!PROFITDOCK_RETRYABLE_STATUS_CODES.has(Number(session_error?.status || 0)) ||
                    String(session_error?.code || '').toLowerCase() === 'requesttimeout');

            if (!is_retryable || attempt === max_attempts - 1) {
                throw error;
            }

            console.warn(`[ProfitDock Auth] ${label} failed on attempt ${attempt + 1}. Retrying once more.`, error);
            await wait(500 * (attempt + 1));
            attempt += 1;
        }
    }

    throw last_error;
};

export const isProfitdockAuthSessionError = (error: unknown) => {
    const session_error = error as TProfitdockSessionError | undefined;
    const error_code = String(session_error?.code || '').toLowerCase();
    const status_code = Number(session_error?.status || 0);

    return (
        status_code === 401 ||
        status_code === 403 ||
        ['unauthorized', 'unauthorizedaccess', 'accessdenied', 'accountnotfound', 'invalidtoken'].includes(
            error_code
        )
    );
};

type TStoredAccount = {
    account_type?: string;
    balance?: number | string;
    created_at?: string;
    currency?: string;
    group?: string;
    is_virtual?: boolean;
    loginid: string;
    token?: string;
};

type TOptionsAccountResponse = {
    account_id?: string;
    account_type?: string;
    balance?: number | string;
    created_at?: string;
    currency?: string;
    group?: string;
    id?: string;
    is_virtual?: boolean;
    loginid?: string;
};

type TOptionsAccountType = 'demo' | 'real';

const safeParse = <T>(raw_value: string | null, fallback: T): T => {
    if (!raw_value) {
        return fallback;
    }

    try {
        return JSON.parse(raw_value) as T;
    } catch (error) {
        console.error('[ProfitDock Auth] Failed to parse stored auth payload:', error);
        return fallback;
    }
};

export const isProfitdockOAuthSession = () => {
    if (typeof window === 'undefined') return false;

    return (
        PROFITDOCK_USE_OPTIONS_OAUTH &&
        isCustomLegacyOAuthDomain() &&
        !!localStorage.getItem('authToken') &&
        localStorage.getItem('callback_token')?.includes('"token_type":"oauth"') === true
    );
};

export const isProfitdockLegacySession = () => {
    // ProfitDock now restores only the new Deriv OAuth/Options API session. A
    // legacy callback token can show a logged-in shell, but it cannot trade via
    // the new API, so treat it as stale and force a fresh OAuth sign-in.
    return false;
};

export const getProfitdockOAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('authToken') || '';
};

export const getStoredProfitdockAccounts = (): TStoredAccount[] => {
    if (typeof window === 'undefined') return [];

    const stored_accounts = safeParse<TStoredAccount[]>(localStorage.getItem('client.accounts'), []);
    if (Array.isArray(stored_accounts) && stored_accounts.length) {
        return stored_accounts.filter(account => account?.loginid);
    }

    const stored_client_accounts = safeParse<Record<string, TStoredAccount>>(localStorage.getItem('clientAccounts'), {});
    if (stored_client_accounts && typeof stored_client_accounts === 'object') {
        return Object.values(stored_client_accounts).filter(account => account?.loginid);
    }

    return [];
};

export const getStoredProfitdockAccountMap = () =>
    getStoredProfitdockAccounts().reduce(
        (acc, account) => {
            acc[account.loginid] = account;
            return acc;
        },
        {} as Record<string, TStoredAccount>
    );

export const getStoredProfitdockActiveAccount = () => {
    const active_loginid = getActiveProfitdockLoginId();
    const stored_accounts = getStoredProfitdockAccounts();

    return stored_accounts.find(account => account.loginid === active_loginid) || stored_accounts[0] || null;
};

export const getStoredProfitdockActiveCurrency = () => getStoredProfitdockActiveAccount()?.currency || '';

export const hasUsableProfitdockStoredSession = () => {
    if (isProfitdockOAuthSession()) {
        const active_account = getStoredProfitdockActiveAccount();
        return !!(getProfitdockOAuthToken() && active_account?.loginid);
    }

    return isProfitdockLegacySession();
};

const normalizeOptionsAccount = (account: TOptionsAccountResponse, access_token: string): TStoredAccount | null => {
    const loginid = account.account_id || account.id || account.loginid || '';

    if (!loginid) {
        return null;
    }

    return {
        account_type: account.account_type || '',
        balance: account.balance,
        created_at: account.created_at,
        currency: account.currency || '',
        group: account.group || '',
        is_virtual: account.account_type === 'demo' || account.is_virtual === true,
        loginid,
        token: access_token,
    };
};

const mergeStoredAccounts = (accounts: TStoredAccount[]) =>
    Array.from(
        accounts.reduce((acc, account) => {
            if (account?.loginid) {
                acc.set(account.loginid, account);
            }

            return acc;
        }, new Map<string, TStoredAccount>())
    ).map(([, account]) => account);

const normalizeOptionsAccountsResponse = (payload: any, access_token: string) => {
    const accounts = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];

    return mergeStoredAccounts(
        accounts
            .map((account: TOptionsAccountResponse) => normalizeOptionsAccount(account, access_token))
            .filter(Boolean) as TStoredAccount[]
    );
};

export const persistProfitdockAccounts = (accounts: TOptionsAccountResponse[], access_token: string) => {
    if (typeof window === 'undefined') return [];

    const normalized_accounts = accounts
        .map(account => normalizeOptionsAccount(account, access_token))
        .filter(Boolean) as TStoredAccount[];

    if (!normalized_accounts.length) {
        return [];
    }

    const accounts_list = normalized_accounts.reduce((acc, account) => {
        acc[account.loginid] = access_token;
        return acc;
    }, {} as Record<string, string>);

    const client_accounts = normalized_accounts.reduce((acc, account) => {
        acc[account.loginid] = {
            account_type: account.account_type,
            currency: account.currency || '',
            is_virtual: account.is_virtual,
            loginid: account.loginid,
            token: access_token,
        };

        return acc;
    }, {} as Record<string, TStoredAccount>);

    localStorage.setItem('accountsList', JSON.stringify(accounts_list));
    localStorage.setItem('clientAccounts', JSON.stringify(client_accounts));
    localStorage.setItem('client.accounts', JSON.stringify(normalized_accounts));

    const active_loginid = localStorage.getItem('active_loginid');
    if (!active_loginid || !accounts_list[active_loginid]) {
        localStorage.setItem('active_loginid', normalized_accounts[0].loginid);
    }

    return normalized_accounts;
};

export const getActiveProfitdockLoginId = () => {
    if (typeof window === 'undefined') return '';

    const active_loginid = localStorage.getItem('active_loginid') || '';
    if (active_loginid) {
        return active_loginid;
    }

    return getStoredProfitdockAccounts()[0]?.loginid || '';
};

export const fetchProfitdockOptionsAccounts = async (access_token: string) => {
    const payload = await withProfitdockRetry(
        () =>
            fetchProfitdockJson({
                access_token,
                error_message: 'ProfitDock could not load your Deriv accounts.',
                method: 'GET',
                url: DERIV_OPTIONS_ACCOUNTS_URL,
            }),
        'Options account fetch'
    );

    const accounts = Array.isArray(payload?.data) ? payload.data : payload?.data && typeof payload.data === 'object' ? [payload.data] : [];

    return accounts as TOptionsAccountResponse[];
};

export const createProfitdockOptionsAccount = async (access_token: string, account_type: TOptionsAccountType) => {
    const payload = await withProfitdockRetry(
        () =>
            fetchProfitdockJson({
                access_token,
                body: {
                    account_type,
                    currency: PROFITDOCK_OPTIONS_ACCOUNT_CURRENCY,
                    group: PROFITDOCK_OPTIONS_ACCOUNT_GROUP,
                },
                error_message: `ProfitDock could not create a ${account_type} Deriv Options account.`,
                method: 'POST',
                url: DERIV_OPTIONS_ACCOUNTS_URL,
            }),
        `${account_type} Options account creation`
    );

    return normalizeOptionsAccountsResponse(payload, access_token);
};

export const ensureProfitdockOptionsAccounts = async (
    access_token: string,
    seed_accounts: TOptionsAccountResponse[] = []
) => {
    let normalized_accounts = mergeStoredAccounts(
        (seed_accounts
            .map(account => normalizeOptionsAccount(account, access_token))
            .filter(Boolean) as TStoredAccount[]) || []
    );

    if (!normalized_accounts.length) {
        const fetched_accounts = await fetchProfitdockOptionsAccounts(access_token);
        normalized_accounts = mergeStoredAccounts(
            fetched_accounts
                .map(account => normalizeOptionsAccount(account, access_token))
                .filter(Boolean) as TStoredAccount[]
        );
    }

    const existing_account_types = new Set(
        normalized_accounts.map(account => {
            if (account.account_type) {
                return account.account_type;
            }

            return account.is_virtual ? 'demo' : 'real';
        })
    );

    let demo_creation_error: TProfitdockSessionError | null = null;
    const missing_account_types: TOptionsAccountType[] = [];

    if (!existing_account_types.has('demo')) {
        missing_account_types.push('demo');
    }

    // Do not silently create real-money accounts. Use any real account Deriv returns,
    // and provision only a demo Options account when the user has none.

    for (const account_type of missing_account_types) {
        try {
            const created_accounts = await createProfitdockOptionsAccount(access_token, account_type);
            normalized_accounts = mergeStoredAccounts([...normalized_accounts, ...created_accounts]);
        } catch (error) {
            if (account_type === 'demo') {
                demo_creation_error = error as TProfitdockSessionError;
                console.error(`[ProfitDock Auth] Failed to provision the default ${account_type} Options account.`, error);
            } else {
                console.warn(`[ProfitDock Auth] Real Options account provisioning was skipped.`, error);
            }
        }
    }

    if (!normalized_accounts.length) {
        if (demo_creation_error) {
            throw createProfitdockSessionError(
                demo_creation_error.message ||
                    'ProfitDock could not provision a Deriv Options account for this user.',
                demo_creation_error.code,
                demo_creation_error.status
            );
        }

        throw createProfitdockSessionError(
            'ProfitDock could not find or create any Deriv Options accounts for this user.'
        );
    }

    persistProfitdockAccounts(
        normalized_accounts.map(account => ({
            account_type: account.account_type,
            balance: account.balance,
            created_at: account.created_at,
            currency: account.currency,
            group: account.group,
            is_virtual: account.is_virtual,
            loginid: account.loginid,
        })),
        access_token
    );

    return normalized_accounts;
};

export const ensureProfitdockStoredAccounts = async (access_token: string) => {
    const stored_accounts = getStoredProfitdockAccounts();
    if (stored_accounts.length) {
        return stored_accounts;
    }

    const accounts = await fetchProfitdockOptionsAccounts(access_token);
    return persistProfitdockAccounts(accounts, access_token);
};

export const fetchProfitdockAuthenticatedWebSocketUrl = async ({
    access_token,
    loginid,
}: {
    access_token: string;
    loginid: string;
}) => {
    const payload = await withProfitdockRetry(async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), PROFITDOCK_API_TIMEOUT_MS);

        try {
            const response = await fetch('/api/deriv/options/ws-url', {
                body: JSON.stringify({
                    // The production endpoint reads the HttpOnly token cookie. The body token
                    // is kept as a same-origin fallback for local previews and stale sessions.
                    access_token,
                    loginid,
                }),
                headers: {
                    'Content-Type': 'application/json',
                },
                method: 'POST',
                signal: controller.signal,
            });
            const response_payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw createProfitdockSessionError(
                    response_payload?.message || 'ProfitDock could not start an authenticated Deriv trading session.',
                    response_payload?.error,
                    response.status
                );
            }

            return response_payload;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw createProfitdockSessionError(
                    'ProfitDock could not start an authenticated Deriv trading session. Request timed out.',
                    'RequestTimeout',
                    408
                );
            }

            throw error;
        } finally {
            window.clearTimeout(timeout);
        }
    }, 'Authenticated trading websocket bootstrap');

    const websocket_url = payload?.url || payload?.data?.url || '';

    if (!websocket_url) {
        const api_error = getProfitdockApiError(payload);
        throw createProfitdockSessionError(api_error.message || 'ProfitDock could not start an authenticated Deriv trading session.', api_error.code);
    }

    return websocket_url;
};

export const invalidateProfitdockOAuthSession = () => {
    if (typeof window === 'undefined') return;

    clearAuthData(false);
    localStorage.removeItem('profitdock_auth_stage');
    setLoggedStateCookie('false');
};
