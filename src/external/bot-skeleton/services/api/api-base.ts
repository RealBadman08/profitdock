import Cookies from 'js-cookie';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import CommonStore from '@/stores/common-store';
import { TAuthData } from '@/types/api-types';
import { clearAuthData, setLoggedStateCookie } from '@/utils/auth-utils';
import { observer as globalObserver } from '../../utils/observer';
import { doUntilDone, socket_state } from '../tradeEngine/utils/helpers';
import {
    CONNECTION_STATUS,
    setAccountList,
    setAuthData,
    setConnectionStatus,
    setIsAuthorized,
    setIsAuthorizing,
} from './observables/connection-status-stream';
import ApiHelpers from './api-helpers';
import {
    createProfitdockAuthorizedDerivApiInstance,
    generateDerivApiInstance,
    V2GetActiveClientId,
    V2GetActiveToken,
} from './appId';
import chart_api from './chart-api';
import {
    ensureProfitdockStoredAccounts,
    ensureProfitdockOptionsAccounts,
    getActiveProfitdockLoginId,
    getProfitdockOAuthToken,
    invalidateProfitdockOAuthSession,
    isProfitdockOAuthSession,
    isProfitdockAuthSessionError,
} from './profitdock-oauth-session';

type CurrentSubscription = {
    id: string;
    unsubscribe: () => void;
};

type SubscriptionPromise = Promise<{
    subscription: CurrentSubscription;
}>;

type TApiBaseApi = {
    connection: {
        readyState: keyof typeof socket_state;
        addEventListener: (event: string, callback: () => void) => void;
        removeEventListener: (event: string, callback: () => void) => void;
    };
    send: (data: unknown) => void;
    disconnect: () => void;
    authorize: (token: string) => Promise<{ authorize: TAuthData; error: unknown }>;
    getSelfExclusion: () => Promise<unknown>;
    onMessage: () => {
        subscribe: (callback: (message: unknown) => void) => {
            unsubscribe: () => void;
        };
    };
} & ReturnType<typeof generateDerivApiInstance>;

const humanizeSymbolGroup = (value = '') =>
    value
        .replace(/_/g, ' ')
        .replace(/\b\w/g, character => character.toUpperCase());

const normalizeActiveSymbol = (symbol_info: Record<string, unknown>) => {
    const symbol = String(symbol_info.symbol || symbol_info.underlying_symbol || '');
    const pip_value = symbol_info.pip ?? symbol_info.pip_size ?? 0.01;

    return {
        ...symbol_info,
        display_name: String(symbol_info.display_name || symbol_info.underlying_symbol_name || symbol),
        market_display_name: String(
            symbol_info.market_display_name || humanizeSymbolGroup(String(symbol_info.market || 'Market'))
        ),
        pip: String(pip_value),
        submarket_display_name: String(
            symbol_info.submarket_display_name || humanizeSymbolGroup(String(symbol_info.submarket || 'Submarket'))
        ),
        subgroup_display_name: String(
            symbol_info.subgroup_display_name || humanizeSymbolGroup(String(symbol_info.subgroup || 'Group'))
        ),
        symbol,
        symbol_type: String(symbol_info.symbol_type || symbol_info.underlying_symbol_type || ''),
    };
};

const refreshBuilderMarketDropdowns = () => {
    if (typeof window === 'undefined') return;

    const blockly_window = window as typeof window & { Blockly?: any };
    const workspace = blockly_window.Blockly?.derivWorkspace;
    const active_symbols = ApiHelpers.instance?.active_symbols;

    if (!workspace || !active_symbols) return;

    const event_group = `profitdock-active-symbols-${Date.now()}`;
    const updateFieldOptions = (field: any, options: unknown[], fallback_value?: string) => {
        if (!field?.updateOptions || !Array.isArray(options) || !options.length) return;

        const current_value = field.getValue?.();
        const next_value =
            current_value && current_value !== 'na'
                ? current_value
                : fallback_value || (Array.isArray(options[0]) ? options[0][1] : undefined);

        field.updateOptions(options, {
            default_value: next_value,
            event_group,
            should_pretend_empty: true,
        });
    };

    workspace.getAllBlocks?.(false)?.forEach((block: any) => {
        if (block.type !== 'trade_definition_market') return;

        const market_dropdown = block.getField?.('MARKET_LIST');
        const submarket_dropdown = block.getField?.('SUBMARKET_LIST');
        const symbol_dropdown = block.getField?.('SYMBOL_LIST');

        const market_options = active_symbols.getMarketDropdownOptions?.() || [];
        updateFieldOptions(market_dropdown, market_options);

        const market = market_dropdown?.getValue?.() || (Array.isArray(market_options[0]) ? market_options[0][1] : '');
        const submarket_options = active_symbols.getSubmarketDropdownOptions?.(market) || [];
        updateFieldOptions(submarket_dropdown, submarket_options);

        const submarket =
            submarket_dropdown?.getValue?.() || (Array.isArray(submarket_options[0]) ? submarket_options[0][1] : '');
        const symbol_options = active_symbols.getSymbolDropdownOptions?.(submarket) || [];
        updateFieldOptions(symbol_dropdown, symbol_options);

        block.onchange?.({
            blockId: block.id,
            group: event_group,
            name: 'SYMBOL_LIST',
            type: blockly_window.Blockly?.Events?.BLOCK_CHANGE,
        });
    });

    window.dispatchEvent(new CustomEvent('profitdock:active-symbols-ready'));
};

class APIBase {
    api: TApiBaseApi | null = null;
    token: string = '';
    account_id: string = '';
    pip_sizes = {};
    account_info = {};
    is_running = false;
    subscriptions: CurrentSubscription[] = [];
    time_interval: ReturnType<typeof setInterval> | null = null;
    has_active_symbols = false;
    is_stopping = false;
    active_symbols = [];
    current_auth_subscriptions: SubscriptionPromise[] = [];
    is_authorized = false;
    has_authenticated_profitdock_socket = false;
    active_symbols_promise: Promise<void> | null = null;
    init_promise: Promise<void> | null = null;
    common_store: CommonStore | undefined;
    landing_company: string | null = null;
    has_registered_window_listeners = false;
    socket_open_listener = () => this.onsocketopen();
    socket_close_listener = () => this.onsocketclose();

    waitForSocketOpen = async (timeout_ms = 8000) => {
        const connection = this.api?.connection;

        if (!connection) {
            throw new Error('Socket is not initialized');
        }

        const ready_state = Number(connection.readyState);

        if (ready_state === WebSocket.OPEN) {
            return;
        }

        if (ready_state === WebSocket.CLOSING || ready_state === WebSocket.CLOSED) {
            throw new Error('Socket closed before it could open');
        }

        await new Promise<void>((resolve, reject) => {
            let is_done = false;
            let timeout: ReturnType<typeof setTimeout>;

            const cleanup = () => {
                window.clearTimeout(timeout);
                connection.removeEventListener('open', handleOpen);
                connection.removeEventListener('close', handleClose);
                connection.removeEventListener('error', handleError);
            };

            const finish = (callback: () => void) => {
                if (is_done) {
                    return;
                }

                is_done = true;
                cleanup();
                callback();
            };

            const handleOpen = () => finish(resolve);
            const handleClose = () => finish(() => reject(new Error('Socket closed before it could open')));
            const handleError = () => finish(() => reject(new Error('Socket failed before it could open')));

            timeout = window.setTimeout(
                () => finish(() => reject(new Error('Socket open timeout while loading markets'))),
                timeout_ms
            );

            connection.addEventListener('open', handleOpen);
            connection.addEventListener('close', handleClose);
            connection.addEventListener('error', handleError);
        });
    };

    unsubscribeAllSubscriptions = () => {
        this.current_auth_subscriptions?.forEach(subscription_promise => {
            subscription_promise.then(({ subscription }) => {
                if (subscription?.id) {
                    this.api?.send({ forget: subscription.id }).catch((error: { error?: { code?: string; message?: string }; message?: string }) => {
                        if (error?.error?.code !== 'RateLimit') {
                            console.warn('[ProfitDock] Auth subscription cleanup skipped:', error?.error?.message || error?.message || error);
                        }
                    });
                }
            });
        });
        this.current_auth_subscriptions = [];
    };

    onsocketopen() {
        setConnectionStatus(CONNECTION_STATUS.OPENED);
    }

    onsocketclose() {
        setConnectionStatus(CONNECTION_STATUS.CLOSED);
        this.reconnectIfNotConnected();
    }

    attachConnectionListeners = (connection = this.api?.connection) => {
        if (!connection) {
            return;
        }

        connection.addEventListener('open', this.socket_open_listener);
        connection.addEventListener('close', this.socket_close_listener);
    };

    detachConnectionListeners = (connection = this.api?.connection) => {
        if (!connection) {
            return;
        }

        connection.removeEventListener('open', this.socket_open_listener);
        connection.removeEventListener('close', this.socket_close_listener);
    };

    async init(force_create_connection = false) {
        if (this.init_promise) {
            const existing_init = this.init_promise;

            if (!force_create_connection) {
                return existing_init;
            }

            await existing_init.catch(error => {
                console.warn('[ProfitDock Auth] Existing API initialization failed before forced reconnect.', error);
            });

            const active_profitdock_loginid = isProfitdockOAuthSession() ? getActiveProfitdockLoginId() : '';
            if (
                this.api?.connection?.readyState === WebSocket.OPEN &&
                this.has_authenticated_profitdock_socket &&
                (!active_profitdock_loginid || this.account_id === active_profitdock_loginid)
            ) {
                return;
            }
        }

        const next_init = this.initialize(force_create_connection).finally(() => {
            if (this.init_promise === next_init) {
                this.init_promise = null;
            }
        });

        this.init_promise = next_init;

        return next_init;
    }

    async initialize(force_create_connection = false) {
        this.toggleRunButton(true);
        const is_profitdock_oauth_session = isProfitdockOAuthSession();
        this.has_authenticated_profitdock_socket = false;

        if (this.api) {
            this.unsubscribeAllSubscriptions();
        }

        if (!this.api || this.api?.connection.readyState !== 1 || force_create_connection) {
            if (this.api?.connection) {
                this.detachConnectionListeners(this.api.connection);
                ApiHelpers.disposeInstance();
                setConnectionStatus(CONNECTION_STATUS.CLOSED);
                this.api.disconnect();
            }

            if (is_profitdock_oauth_session && V2GetActiveToken()) {
                try {
                    this.api = await createProfitdockAuthorizedDerivApiInstance({
                        access_token: V2GetActiveToken() || '',
                        loginid: getActiveProfitdockLoginId(),
                    });
                    this.has_authenticated_profitdock_socket = Boolean(
                        (this.api as TApiBaseApi & { is_profitdock_authenticated_socket?: boolean })
                            .is_profitdock_authenticated_socket
                    );
                } catch (error) {
                    console.error(
                        '[ProfitDock Auth] Failed to start an authenticated options websocket. Falling back to the public socket.',
                        error
                    );
                    this.api = generateDerivApiInstance();
                    this.has_authenticated_profitdock_socket = false;
                }
            } else {
                this.api = generateDerivApiInstance();
            }
            this.attachConnectionListeners(this.api?.connection);
        }

        this.initEventListeners();

        if (this.time_interval) clearInterval(this.time_interval);
        this.time_interval = null;

        if (V2GetActiveToken()) {
            setIsAuthorizing(true);
            if (is_profitdock_oauth_session) {
                await this.bootstrapProfitdockAuthorizedSession();
            } else {
                await this.authorizeAndSubscribe();
            }
        } else {
            setIsAuthorized(false);
            this.is_authorized = false;
        }

        if (!this.has_active_symbols && !this.active_symbols_promise) {
            this.active_symbols_promise = this.getActiveSymbols()
                .catch(error => {
                    console.warn('[API] Active symbols bootstrap will retry after reconnect:', error);
                })
                .finally(() => {
                    this.active_symbols_promise = null;
                });
        }

        chart_api.init(force_create_connection);
    }

    async bootstrapProfitdockAuthorizedSession() {
        const oauth_token = getProfitdockOAuthToken();
        const active_loginid = getActiveProfitdockLoginId();

        if (!oauth_token || !active_loginid || !this.api) {
            invalidateProfitdockOAuthSession();
            setIsAuthorized(false);
            this.is_authorized = false;
            setIsAuthorizing(false);
            return null;
        }

        this.token = oauth_token;
        this.account_id = active_loginid;
        setIsAuthorizing(true);
        setIsAuthorized(false);

        try {
            await this.waitForSocketOpen(15000);
            let stored_accounts = [];

            try {
                stored_accounts = await ensureProfitdockOptionsAccounts(oauth_token);
            } catch (accounts_error) {
                if (isProfitdockAuthSessionError(accounts_error)) {
                    throw accounts_error;
                }

                console.warn(
                    '[ProfitDock Auth] Live account refresh failed. Falling back to the stored OAuth account cache.',
                    accounts_error
                );
                stored_accounts = await ensureProfitdockStoredAccounts(oauth_token);
            }

            if (!stored_accounts.length) {
                throw new Error('ProfitDock could not find any authorized Deriv accounts.');
            }

            let resolved_loginid =
                stored_accounts.find(account => account.loginid === active_loginid)?.loginid ||
                active_loginid ||
                stored_accounts[0]?.loginid ||
                '';

            if (!this.has_authenticated_profitdock_socket && resolved_loginid) {
                const candidate_loginids = [
                    resolved_loginid,
                    ...stored_accounts.map(account => account.loginid).filter(loginid => loginid && loginid !== resolved_loginid),
                ];
                let last_socket_upgrade_error: unknown = null;

                for (const candidate_loginid of candidate_loginids) {
                    try {
                        this.detachConnectionListeners(this.api?.connection);
                        this.api?.disconnect();
                        this.api = await createProfitdockAuthorizedDerivApiInstance({
                            access_token: oauth_token,
                            loginid: candidate_loginid,
                        });
                        this.attachConnectionListeners(this.api?.connection);
                        this.has_authenticated_profitdock_socket = Boolean(
                            (this.api as TApiBaseApi & { is_profitdock_authenticated_socket?: boolean })
                                .is_profitdock_authenticated_socket
                        );
                        if (!this.has_authenticated_profitdock_socket) {
                            throw new Error('Deriv did not return an authenticated Options trading socket.');
                        }
                        await this.waitForSocketOpen(15000);
                        resolved_loginid = candidate_loginid;
                        localStorage.setItem('active_loginid', resolved_loginid);
                        break;
                    } catch (socket_upgrade_error) {
                        last_socket_upgrade_error = socket_upgrade_error;
                        this.has_authenticated_profitdock_socket = false;
                        console.warn(
                            `[ProfitDock Auth] Authenticated trading websocket bootstrap failed for ${candidate_loginid}. Trying the next available account.`,
                            socket_upgrade_error
                        );
                    }
                }

                if (!this.has_authenticated_profitdock_socket) {
                    this.api = generateDerivApiInstance();
                    this.attachConnectionListeners(this.api?.connection);
                    console.warn(
                        '[ProfitDock Auth] Account refresh succeeded, but the authenticated trading websocket still could not be restored yet.',
                        last_socket_upgrade_error
                    );
                }
            }

            if (this.has_authenticated_profitdock_socket) {
                const resolved_account =
                    stored_accounts.find(account => account.loginid === resolved_loginid) || stored_accounts[0] || null;

                if (resolved_account?.loginid) {
                    resolved_loginid = resolved_account.loginid;
                }
            } else {
                try {
                    const authorized_info = await this.authorizeProfitdockOAuthSocket(
                        oauth_token,
                        resolved_loginid,
                        stored_accounts
                    );

                    if (authorized_info?.loginid) {
                        resolved_loginid = authorized_info.loginid;
                    }

                    if (authorized_info?.account_list?.length) {
                        stored_accounts = authorized_info.account_list;
                    }
                } catch (authorize_error) {
                    this.has_authenticated_profitdock_socket = false;
                    throw authorize_error;
                }
            }

            const active_account =
                stored_accounts.find(account => account.loginid === resolved_loginid) || stored_accounts[0] || null;

            const accounts_list = stored_accounts.reduce((acc, account) => {
                acc[account.loginid] = oauth_token;
                return acc;
            }, {} as Record<string, string>);

            const client_accounts = stored_accounts.reduce((acc, account) => {
                acc[account.loginid] = {
                    account_type: account.account_type,
                    currency: account.currency || '',
                    is_virtual: account.is_virtual,
                    loginid: account.loginid,
                    token: oauth_token,
                };
                return acc;
            }, {} as Record<string, { account_type?: string; currency?: string; is_virtual?: boolean; loginid: string; token: string }>);

            const account_info = {
                account_list: stored_accounts,
                country: localStorage.getItem('client.country') || '',
                currency: active_account?.currency || '',
                loginid: resolved_loginid,
                token_type: 'oauth',
            } as TAuthData;
            const has_authenticated_socket = this.has_authenticated_profitdock_socket;

            this.token = oauth_token;
            this.account_id = resolved_loginid;
            this.account_info = account_info;
            setAccountList(stored_accounts as TAuthData['account_list']);
            setAuthData(account_info);
            setIsAuthorized(has_authenticated_socket);
            this.is_authorized = has_authenticated_socket;
            localStorage.setItem('accountsList', JSON.stringify(accounts_list));
            localStorage.setItem('clientAccounts', JSON.stringify(client_accounts));
            localStorage.setItem('client.accounts', JSON.stringify(stored_accounts));
            localStorage.setItem('client_account_details', JSON.stringify(stored_accounts));
            localStorage.setItem('callback_token', JSON.stringify(account_info));
            localStorage.setItem('active_loginid', resolved_loginid);
            setLoggedStateCookie('true');

            if (this.has_active_symbols) {
                this.toggleRunButton(false);
            } else {
                this.active_symbols_promise = this.getActiveSymbols().finally(() => {
                    this.active_symbols_promise = null;
                });
            }

            if (has_authenticated_socket) {
                await this.subscribe().catch(subscription_error => {
                    console.warn(
                        '[ProfitDock Auth] Authenticated session is live, but one or more post-login streams failed to attach. Retrying in the background.',
                        subscription_error
                    );
                });
            } else {
                console.warn(
                    '[ProfitDock Auth] ProfitDock restored the OAuth session, but the authenticated trading socket is not ready yet. Public market data will remain available until the next auth recovery succeeds.'
                );
            }
            return account_info;
        } catch (error) {
            console.error('[ProfitDock Auth] Authenticated websocket bootstrap failed:', error);
            this.has_authenticated_profitdock_socket = false;
            this.is_authorized = false;
            setIsAuthorized(false);

            if (isProfitdockAuthSessionError(error)) {
                invalidateProfitdockOAuthSession();
            }

            globalObserver.emit('Error', error);
            return null;
        } finally {
            setIsAuthorizing(false);
        }
    }

    async authorizeProfitdockOAuthSocket(
        oauth_token: string,
        preferred_loginid: string,
        fallback_accounts: TAuthData['account_list'] = []
    ) {
        if (!oauth_token || !this.api) {
            throw new Error('ProfitDock cannot authorize the websocket without an OAuth token.');
        }

        await this.waitForSocketOpen(15000);
        const { authorize, error } = await this.api.authorize(oauth_token);

        if (error) {
            const auth_error = new Error(error.message || 'Deriv rejected this ProfitDock OAuth token.') as Error & {
                code?: string;
            };
            auth_error.code = error.code;
            throw auth_error;
        }

        const authorized_accounts = authorize?.account_list?.length ? authorize.account_list : fallback_accounts;
        const resolved_account =
            authorized_accounts?.find(account => account.loginid === preferred_loginid) ||
            authorized_accounts?.find(account => account.loginid === authorize?.loginid) ||
            authorized_accounts?.[0] ||
            null;
        const resolved_loginid = resolved_account?.loginid || authorize?.loginid || preferred_loginid;

        return {
            ...authorize,
            account_list: authorized_accounts,
            currency: resolved_account?.currency || authorize?.currency || '',
            loginid: resolved_loginid,
            token_type: 'oauth',
        } as TAuthData;
    }

    applyStoredAuthFallback() {
        if (!isCustomLegacyOAuthDomain()) {
            return null;
        }

        let stored_accounts = [];
        try {
            stored_accounts = JSON.parse(localStorage.getItem('client.accounts') || '[]');

            if (!Array.isArray(stored_accounts) || !stored_accounts.length) {
                const stored_client_accounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
                stored_accounts =
                    stored_client_accounts && typeof stored_client_accounts === 'object'
                        ? Object.values(stored_client_accounts)
                        : [];
            }
        } catch (error) {
            console.error('[ProfitDock Auth] Unable to read stored account fallback:', error);
            return null;
        }

        const active_loginid = localStorage.getItem('active_loginid') || '';
        const active_account =
            stored_accounts.find(account => account.loginid === active_loginid) || stored_accounts?.[0] || null;
        const fallback_authorize = {
            account_list: stored_accounts,
            country: localStorage.getItem('client.country') || '',
            currency: active_account?.currency || '',
            loginid: active_loginid || stored_accounts?.[0]?.loginid || '',
        } as TAuthData;

        if (!Array.isArray(stored_accounts) || !stored_accounts.length || !fallback_authorize.loginid) {
            return null;
        }

        this.account_info = fallback_authorize;
        setAccountList(stored_accounts);
        setAuthData(fallback_authorize);
        setIsAuthorized(false);
        this.is_authorized = false;

        if (this.has_active_symbols) {
            this.toggleRunButton(false);
        } else if (this.api && !this.active_symbols_promise) {
            this.active_symbols_promise = this.getActiveSymbols()
                .catch(error => {
                    console.error('[ProfitDock Auth] Stored session active symbols fallback failed:', error);
                })
                .finally(() => {
                    this.active_symbols_promise = null;
                });
        }

        return fallback_authorize;
    }

    getConnectionStatus() {
        if (this.api?.connection) {
            const ready_state = this.api.connection.readyState;
            return socket_state[ready_state as keyof typeof socket_state] || 'Unknown';
        }
        return 'Socket not initialized';
    }

    terminate() {
        // eslint-disable-next-line no-console
        if (this.api) this.api.disconnect();
    }

    initEventListeners() {
        if (window && !this.has_registered_window_listeners) {
            window.addEventListener('online', this.reconnectIfNotConnected);
            window.addEventListener('focus', this.reconnectIfNotConnected);
            this.has_registered_window_listeners = true;
        }
    }

    async createNewInstance(account_id: string) {
        if (this.account_id !== account_id) {
            await this.init();
        }
    }

    reconnectIfNotConnected = () => {
        // eslint-disable-next-line no-console
        console.log('connection state: ', this.api?.connection?.readyState);
        if (this.api?.connection?.readyState && this.api?.connection?.readyState > 1) {
            // eslint-disable-next-line no-console
            console.log('Info: Connection to the server was closed, trying to reconnect.');
            this.init(true);
        }
    };

    async authorizeAndSubscribe() {
        const token = V2GetActiveToken();
        if (!token || !this.api) return;
        this.token = token;
        this.account_id = V2GetActiveClientId() ?? '';
        setIsAuthorizing(true);
        setIsAuthorized(false);

        try {
            await this.waitForSocketOpen(15000);
            const { authorize, error } = await this.api.authorize(this.token);
            if (error) {
                if (error.code === 'InvalidToken') {
                    const is_tmb_enabled = window.is_tmb_enabled === true;
                    if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                        globalObserver.emit('InvalidToken', { error });
                    } else {
                        clearAuthData();
                    }
                } else {
                    console.error('Authorization error:', error);
                }
                setIsAuthorizing(false);
                return error;
            }

            const resolved_loginid = authorize?.loginid || this.account_id;
            this.account_id = resolved_loginid;
            this.account_info = authorize;
            setAccountList(authorize?.account_list || []);
            setAuthData(authorize);
            setIsAuthorized(true);
            this.is_authorized = true;
            if (resolved_loginid) {
                localStorage.setItem('active_loginid', resolved_loginid);
            }
            localStorage.setItem('authToken', this.token);
            localStorage.setItem('client_account_details', JSON.stringify(authorize?.account_list));
            localStorage.setItem('client.country', authorize?.country);
            setLoggedStateCookie('true');

            if (this.has_active_symbols) {
                this.toggleRunButton(false);
            } else {
                this.active_symbols_promise = this.getActiveSymbols().finally(() => {
                    this.active_symbols_promise = null;
                });
            }
            this.subscribe();
            // this.getSelfExclusion(); commented this so we dont call it from two places
        } catch (e) {
            console.error('Authorization failed:', e);
            this.is_authorized = false;
            if (!isCustomLegacyOAuthDomain()) {
                clearAuthData();
            }
            setIsAuthorized(false);
            globalObserver.emit('Error', e);
        } finally {
            setIsAuthorizing(false);
        }
    }

    async getSelfExclusion() {
        if (!this.api || !this.is_authorized) return;
        await this.api.getSelfExclusion();
        // TODO: fix self exclusion
    }

    async subscribe() {
        const subscribeToStream = (streamName: string) => {
            return doUntilDone(
                () => {
                    const subscription = this.api?.send({
                        [streamName]: 1,
                        subscribe: 1,
                        ...(streamName === 'balance' ? { account: 'all' } : {}),
                    });
                    if (subscription) {
                        this.current_auth_subscriptions.push(subscription);
                    }
                    return subscription;
                },
                [],
                this
            );
        };

        const streamsToSubscribe = ['balance', 'transaction', 'proposal_open_contract'];

        await Promise.all(streamsToSubscribe.map(subscribeToStream));
    }

    getActiveSymbols = async () => {
        const max_attempts = isCustomLegacyOAuthDomain() ? 3 : 2;
        const initial_timeout = isCustomLegacyOAuthDomain() ? 15000 : 8000;
        let last_error: unknown;

        for (let attempt = 0; attempt < max_attempts; attempt += 1) {
            try {
                if (!this.api || Number(this.api.connection?.readyState) > WebSocket.OPEN) {
                    await this.init(true);
                }

                await this.waitForSocketOpen(initial_timeout + attempt * 5000);

                await doUntilDone(() => this.api?.send({ active_symbols: 'brief' }), [], this).then(
                    ({ active_symbols = [], error = {} }) => {
                        if (!active_symbols.length && Object.keys(error).length) {
                            throw error;
                        }

                        const normalized_active_symbols = active_symbols.map(normalizeActiveSymbol);
                        const pip_sizes = {};
                        if (normalized_active_symbols.length) this.has_active_symbols = true;
                        normalized_active_symbols.forEach(({ symbol, pip }: { symbol: string; pip: string }) => {
                            (pip_sizes as Record<string, number>)[symbol] = +(+pip).toExponential().substring(3);
                        });
                        this.pip_sizes = pip_sizes as Record<string, number>;
                        this.toggleRunButton(false);
                        this.active_symbols = normalized_active_symbols;
                        window.setTimeout(refreshBuilderMarketDropdowns, 0);
                        return normalized_active_symbols || error;
                    }
                );

                return;
            } catch (error) {
                last_error = error;
                this.has_active_symbols = false;

                if (attempt < max_attempts - 1) {
                    console.warn(`[API] Active symbols attempt ${attempt + 1} failed. Recreating websocket and retrying.`, error);

                    try {
                        await this.init(true);
                    } catch (reinit_error) {
                        console.error('[API] Failed to recreate websocket after active symbols bootstrap failure.', reinit_error);
                    }

                    await new Promise(resolve => window.setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                }
            }
        }

        throw last_error;
    };

    toggleRunButton = (toggle: boolean) => {
        const run_button = document.querySelector('#db-animation__run-button');
        if (!run_button) return;
        (run_button as HTMLButtonElement).disabled = toggle;
    };

    setIsRunning(toggle = false) {
        this.is_running = toggle;
    }

    pushSubscription(subscription: CurrentSubscription) {
        this.subscriptions.push(subscription);
    }

    clearSubscriptions() {
        this.subscriptions.forEach(s => s.unsubscribe());
        this.subscriptions = [];

        // Resetting timeout resolvers
        const global_timeouts = globalObserver.getState('global_timeouts') ?? [];

        global_timeouts.forEach((_: unknown, i: number) => {
            clearTimeout(i);
        });
    }
}

export const api_base = new APIBase();
