import React from 'react';
import { crypto_currencies_display_order, fiat_currencies_display_order } from '@/components/shared';
import {
    ensureCustomDomainAppId,
    isCustomLegacyOAuthDomain,
} from '@/components/shared/utils/config/config';
import { getRedirectCallbackUri } from '@/components/shared/utils/login/login';
import ChunkLoader from '@/components/loader/chunk-loader';
import useTMB from '@/hooks/useTMB';
import { ensureProfitdockOptionsAccounts } from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { clearAuthData, setLoggedStateCookie } from '@/utils/auth-utils';
import { Callback } from '@deriv-com/auth-client';
import { Button } from '@deriv-com/ui';
import { localize } from '@deriv-com/translations';

type TClientAccount = {
    account_type?: string;
    currency: string;
    is_virtual?: boolean;
    loginid: string;
    token: string;
};

type TClientAccounts = Record<string, TClientAccount>;
type TTokenResponse = Record<string, string>;
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
type TOAuthTokenResponse = {
    access_token: string;
    accounts?: TOptionsAccountResponse[];
    expires_in?: number;
    token_type?: string;
};

const isDemoLoginId = (loginid?: string) => !!loginid && /^(VR|VRTC|VRW)/i.test(loginid);
const PROFITDOCK_CLIENT_ID = '339iXSWkH7NEGne7sMdQT';
const isDemoClientAccount = (account?: Partial<TClientAccount>) =>
    account?.account_type === 'demo' || account?.is_virtual === true || isDemoLoginId(account?.loginid);

const getSelectedCurrency = (tokens: TTokenResponse, client_accounts: TClientAccounts, state?: { account?: string } | null) => {
    const query_params = new URLSearchParams(window.location.search);
    const currency =
        state?.account ||
        query_params.get('account') ||
        sessionStorage.getItem('query_param_currency') ||
        '';
    const first_account_key = tokens.acct1;
    const first_account_currency = first_account_key ? client_accounts[first_account_key]?.currency : '';

    const valid_currencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order];
    if (tokens.acct1?.startsWith('VR') || currency === 'demo') return 'demo';
    if (currency && valid_currencies.includes(currency.toUpperCase())) return currency;
    return first_account_currency || 'USD';
};

const getPostLoginRedirectUrl = (selected_currency: string) => {
    const fallback_url = `${window.location.origin}/`;
    const stored_redirect_url =
        localStorage.getItem('config.post_login_redirect_uri') || sessionStorage.getItem('redirect_url') || fallback_url;

    let redirect_url: URL;

    try {
        redirect_url = new URL(stored_redirect_url, fallback_url);
    } catch {
        redirect_url = new URL(fallback_url);
    }

    if (redirect_url.origin !== window.location.origin) {
        redirect_url = new URL(fallback_url);
    }

    if (['/auth/callback', '/callback'].includes(redirect_url.pathname)) {
        redirect_url = new URL(fallback_url);
    }

    if (selected_currency) {
        redirect_url.searchParams.set('account', selected_currency);
    }

    ['acct1', 'acct2', 'acct3', 'token1', 'token2', 'token3', 'cur1', 'cur2', 'cur3'].forEach(param =>
        redirect_url.searchParams.delete(param)
    );
    ['code', 'state', 'session_state', 'scope', 'error', 'error_description', 'error_uri'].forEach(param =>
        redirect_url.searchParams.delete(param)
    );

    sessionStorage.removeItem('redirect_url');
    localStorage.removeItem('config.post_login_redirect_uri');

    return redirect_url.toString();
};

const buildLegacyAccounts = (tokens: TTokenResponse) => {
    const accounts_list: Record<string, string> = {};
    const client_accounts: TClientAccounts = {};

    Object.entries(tokens).forEach(([key, value]) => {
        if (key.startsWith('acct')) {
            const token_key = key.replace('acct', 'token');
            if (tokens[token_key]) {
                accounts_list[value] = tokens[token_key];
                client_accounts[value] = {
                    currency: '',
                    loginid: value,
                    token: tokens[token_key],
                };
            }
        } else if (key.startsWith('cur')) {
            const acct_key = key.replace('cur', 'acct');
            if (tokens[acct_key] && client_accounts[tokens[acct_key]]) {
                client_accounts[tokens[acct_key]].currency = value;
            }
        }
    });

    return { accounts_list, client_accounts };
};

const buildOAuthClientAccount = (
    account: Partial<TClientAccount> & Record<string, unknown>,
    access_token: string
) => {
    const loginid = String(account.loginid || '');

    if (!loginid) {
        return null;
    }

    return {
        account_type:
            typeof account.account_type === 'string'
                ? account.account_type
                : isDemoLoginId(loginid)
                  ? 'demo'
                  : 'real',
        created_at: account.created_at,
        currency: String(account.currency || ''),
        group: typeof account.group === 'string' ? account.group : '',
        is_virtual: account.is_virtual === true || isDemoLoginId(loginid),
        landing_company_name: typeof account.landing_company_name === 'string' ? account.landing_company_name : '',
        loginid,
        token: access_token,
    };
};

const getLegacyCallbackTokens = () => {
    const search_params = new URLSearchParams(window.location.search);
    const tokens = Object.fromEntries(search_params.entries());

    if (!tokens.acct1 || !tokens.token1) {
        return null;
    }

    return tokens;
};

const getPkceCallbackParams = () => {
    const search_params = new URLSearchParams(window.location.search);

    return {
        code: search_params.get('code') || '',
        error: search_params.get('error') || '',
        error_description: search_params.get('error_description') || '',
        state: search_params.get('state') || '',
    };
};

const getPreferredAccountForCurrency = (client_accounts: TClientAccounts, selected_currency: string) => {
    const account_list = Object.values(client_accounts);
    const demo_account = account_list.find(account => isDemoClientAccount(account));
    const real_account_by_currency = account_list.find(
        account =>
            !isDemoClientAccount(account) && account.currency?.toUpperCase() === selected_currency.toUpperCase()
    );

    if (selected_currency === 'demo') {
        return demo_account || account_list[0];
    }

    return real_account_by_currency || account_list.find(account => !isDemoClientAccount(account)) || account_list[0];
};

const getSelectedCurrencyFromAccounts = (client_accounts: TClientAccounts) => {
    const query_params = new URLSearchParams(window.location.search);
    const requested_currency =
        query_params.get('account') || sessionStorage.getItem('query_param_currency') || '';
    const account_list = Object.values(client_accounts);
    const demo_account = account_list.find(account => isDemoClientAccount(account));
    const first_real_account = account_list.find(account => !isDemoClientAccount(account));
    const valid_currencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order];

    if (requested_currency === 'demo') return 'demo';
    if (requested_currency && valid_currencies.includes(requested_currency.toUpperCase())) {
        return requested_currency;
    }

    return first_real_account?.currency || demo_account?.currency || 'USD';
};

const bootstrapLegacyTokens = async ({
    tokens,
    state,
    is_cancelled,
}: {
    tokens: TTokenResponse;
    state?: { account?: string } | null;
    is_cancelled?: () => boolean;
}) => {
    ensureCustomDomainAppId();

    const { accounts_list, client_accounts } = buildLegacyAccounts(tokens);
    const clear_invalid_auth_state = () => {
        clearAuthData(false);
        setLoggedStateCookie('false');
    };

    localStorage.setItem('accountsList', JSON.stringify(accounts_list));
    localStorage.setItem('clientAccounts', JSON.stringify(client_accounts));
    localStorage.setItem('client.accounts', JSON.stringify(Object.values(client_accounts)));
    localStorage.setItem('client_account_details', JSON.stringify(Object.values(client_accounts)));

    const selected_currency = getSelectedCurrency(tokens, client_accounts, state);
    const preferred_account = getPreferredAccountForCurrency(client_accounts, selected_currency);

    if (!preferred_account) {
        clear_invalid_auth_state();
        throw new Error(localize('No valid ProfitDock account was returned from Deriv.'));
    }

    localStorage.setItem('authToken', preferred_account.token);
    localStorage.setItem('active_loginid', preferred_account.loginid);
    localStorage.setItem('config.app_id', PROFITDOCK_CLIENT_ID);
    localStorage.removeItem('config.legacy_app_id');
    localStorage.setItem(
        'callback_token',
        JSON.stringify({
            account_list: Object.values(client_accounts).map(account => ({
                account_type: account.account_type || (isDemoClientAccount(account) ? 'demo' : 'real'),
                currency: account.currency || '',
                is_virtual: isDemoClientAccount(account),
                loginid: account.loginid,
            })),
            currency: preferred_account.currency || selected_currency,
            loginid: preferred_account.loginid,
            token_type: 'legacy',
        })
    );
    localStorage.setItem('profitdock_auth_stage', 'legacy_callback_stored');
    setLoggedStateCookie('true');

    if (is_cancelled?.()) {
        return;
    }

    // Important: the legacy callback already contains the real Deriv account tokens.
    // Persist them immediately and let the main shell perform the live websocket
    // authorization. This avoids mobile browsers hanging indefinitely on /auth/callback.
    window.location.replace(getPostLoginRedirectUrl(preferred_account.currency || selected_currency));
};

const bootstrapOAuthAccessToken = async ({
    access_token,
    accounts,
    is_tmb_enabled,
    is_cancelled,
}: {
    access_token: string;
    accounts?: TOptionsAccountResponse[];
    is_tmb_enabled: boolean;
    is_cancelled?: () => boolean;
}) => {
    ensureCustomDomainAppId();

    const clear_invalid_auth_state = () => {
        clearAuthData(false);
        setLoggedStateCookie('false');
    };

    localStorage.setItem('authToken', access_token);
    if (is_cancelled?.()) {
        return;
    }

    let normalized_accounts: Array<
        TClientAccount & {
            balance?: number | string;
            created_at?: string;
            group?: string;
            landing_company_name?: string;
        }
    > = [];

    try {
        normalized_accounts = (await ensureProfitdockOptionsAccounts(access_token, accounts || [])).map(account => ({
            account_type: account.account_type || '',
            balance: account.balance,
            created_at: account.created_at,
            currency: account.currency || '',
            group: account.group || '',
            is_virtual: account.account_type === 'demo' || account.is_virtual === true,
            loginid: account.loginid,
            token: access_token,
        }));
    } catch (error) {
        console.error('[Callback] OAuth options account bootstrap failed:', error);
    }

    if (!normalized_accounts.length) {
        const stored_accounts = JSON.parse(localStorage.getItem('client.accounts') || '[]');
        if (Array.isArray(stored_accounts) && stored_accounts.length) {
            normalized_accounts.push(
                ...stored_accounts
                    .map(account => buildOAuthClientAccount(account, access_token))
                    .filter(Boolean)
            );
        }
    }

    if (!normalized_accounts.length) {
        clear_invalid_auth_state();
        throw new Error(localize('ProfitDock could not load your Deriv Options accounts yet.'));
    }

    const client_accounts = normalized_accounts.reduce((acc, account) => {
        acc[account.loginid] = {
            account_type: account.account_type,
            currency: account.currency || '',
            is_virtual: account.is_virtual,
            loginid: account.loginid,
            token: access_token,
        };

        return acc;
    }, {} as TClientAccounts);

    const accounts_list = normalized_accounts.reduce((acc, account) => {
        acc[account.loginid] = access_token;
        return acc;
    }, {} as Record<string, string>);

    const selected_currency = getSelectedCurrencyFromAccounts(client_accounts);
    const preferred_account = getPreferredAccountForCurrency(client_accounts, selected_currency);

    if (!preferred_account) {
        clear_invalid_auth_state();
        throw new Error(localize('No valid ProfitDock account was returned from Deriv.'));
    }

    const callback_authorize_payload = {
        account_list: normalized_accounts.map(account => ({
            account_type: account.account_type,
            balance: account.balance,
            created_at: account.created_at,
            currency: account.currency || '',
            group: account.group,
            is_virtual: account.is_virtual,
            landing_company_name: account.landing_company_name,
            loginid: account.loginid,
        })),
        country: '',
        currency: preferred_account.currency || selected_currency,
        loginid: preferred_account.loginid,
        token_type: 'oauth',
    };

    localStorage.setItem('accountsList', JSON.stringify(accounts_list));
    localStorage.setItem('clientAccounts', JSON.stringify(client_accounts));
    localStorage.setItem('authToken', access_token);
    localStorage.setItem('active_loginid', preferred_account.loginid);
    localStorage.setItem('config.app_id', PROFITDOCK_CLIENT_ID);
    localStorage.removeItem('config.legacy_app_id');
    localStorage.setItem('client.country', String(callback_authorize_payload.country || ''));
    localStorage.setItem('client.accounts', JSON.stringify(callback_authorize_payload.account_list));
    localStorage.setItem('client_account_details', JSON.stringify(callback_authorize_payload.account_list));
    localStorage.setItem('callback_token', JSON.stringify(callback_authorize_payload));
    localStorage.setItem('profitdock_auth_stage', 'authorized');
    setLoggedStateCookie('true');

    window.location.replace(getPostLoginRedirectUrl(preferred_account.currency || selected_currency));
};

const LegacyCallbackPage = () => {
    const error_message = localize(
        'Deriv returned a legacy token callback. Please start login again from ProfitDock so the new Deriv OAuth session can be authorized.'
    );

    React.useEffect(() => {
        clearAuthData(false);
        setLoggedStateCookie('false');
    }, []);

    if (error_message) {
        return (
            <div className='auth-callback-page auth-callback-page--error'>
                <div className='auth-callback-page__content'>
                    <div className='auth-callback-page__title'>{localize('Sign-in could not be completed')}</div>
                    <div className='auth-callback-page__message'>{error_message}</div>
                    <Button
                        className='callback-return-button'
                        onClick={() => {
                            window.location.href = '/';
                        }}
                    >
                        {localize('Return to Bot')}
                    </Button>
                </div>
            </div>
        );
    }

    return <ChunkLoader message={localize('Finalizing your ProfitDock sign-in...')} />;
};

const PkceCallbackPage = () => {
    const [error_message, setErrorMessage] = React.useState('');
    const { is_tmb_enabled } = useTMB();

    React.useEffect(() => {
        let is_cancelled = false;

        const finishPkceLogin = async () => {
            const { code, error, error_description, state } = getPkceCallbackParams();

            if (error) {
                setErrorMessage(error_description || error);
                return;
            }

            if (!code || !state) {
                setErrorMessage(localize('Missing Deriv authorization code.'));
                return;
            }

            try {
                localStorage.setItem('profitdock_auth_stage', 'exchanging_code');
                const controller = new AbortController();
                const timeout = window.setTimeout(() => controller.abort(), 20000);
                const response = await fetch('/api/deriv/oauth/exchange', {
                    body: JSON.stringify({ code, state }),
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    method: 'POST',
                    signal: controller.signal,
                });
                window.clearTimeout(timeout);
                const payload = await response.json().catch(() => null);

                if (!response.ok || !payload?.access_token) {
                    localStorage.setItem('profitdock_auth_stage', 'exchange_failed');
                    setErrorMessage(
                        payload?.message || localize('ProfitDock could not exchange your Deriv authorization.')
                    );
                    return;
                }

                localStorage.setItem('profitdock_auth_stage', 'storing_session');
                await bootstrapOAuthAccessToken({
                    access_token: payload.access_token,
                    accounts: payload.accounts,
                    is_cancelled: () => is_cancelled,
                    is_tmb_enabled,
                });
            } catch (error) {
                console.error('[Callback] PKCE callback bootstrap failed:', error);
                localStorage.setItem('profitdock_auth_stage', 'callback_failed');
                setErrorMessage(
                    error instanceof DOMException && error.name === 'AbortError'
                        ? localize('ProfitDock sign-in took too long. Please try logging in again.')
                        : localize('ProfitDock could not finish signing you in.')
                );
            }
        };

        finishPkceLogin();

        return () => {
            is_cancelled = true;
        };
    }, [is_tmb_enabled]);

    if (error_message) {
        return (
            <div className='auth-callback-page auth-callback-page--error'>
                <div className='auth-callback-page__content'>
                    <div className='auth-callback-page__title'>{localize('Sign-in could not be completed')}</div>
                    <div className='auth-callback-page__message'>{error_message}</div>
                    <Button
                        className='callback-return-button'
                        onClick={() => {
                            window.location.href = '/';
                        }}
                    >
                        {localize('Return to Bot')}
                    </Button>
                </div>
            </div>
        );
    }

    return <ChunkLoader message={localize('Finalizing your ProfitDock sign-in...')} />;
};

const OidcCallbackPage = () => {
    return (
        <Callback
            onSignInSuccess={async (tokens: Record<string, string>, rawState: unknown) => {
                const state = rawState as { account?: string } | null;
                try {
                    await bootstrapLegacyTokens({
                        state,
                        tokens,
                    });
                } catch (error) {
                    console.error('[Callback] OIDC callback bootstrap failed:', error);
                }
            }}
            redirectCallbackUri={getRedirectCallbackUri()}
            renderReturnButton={() => {
                return (
                    <Button
                        className='callback-return-button'
                        onClick={() => {
                            window.location.href = '/';
                        }}
                    >
                        {localize('Return to Bot')}
                    </Button>
                );
            }}
        />
    );
};

const CallbackPage = () => {
    const { code, error } = getPkceCallbackParams();
    const should_use_legacy_callback = isCustomLegacyOAuthDomain() && !!getLegacyCallbackTokens();

    if (isCustomLegacyOAuthDomain() && (code || error)) {
        return <PkceCallbackPage />;
    }

    if (should_use_legacy_callback) {
        return <LegacyCallbackPage />;
    }

    return <OidcCallbackPage />;
};

export default CallbackPage;
