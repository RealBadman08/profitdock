import React, { Suspense, lazy, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ToastContainer } from 'react-toastify';
import AuthLoadingWrapper from '@/components/auth-loading-wrapper';
import useLiveChat from '@/components/chat/useLiveChat';
import { BOT_RESTRICTED_COUNTRIES_LIST } from '@/components/layout/header/utils';
import ChunkLoader from '@/components/loader/chunk-loader';
import { getUrlBase } from '@/components/shared';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import ApiHelpers from '@/external/bot-skeleton/services/api/api-helpers';
import ServerTime from '@/external/bot-skeleton/services/api/server_time';
import { V2GetActiveToken } from '@/external/bot-skeleton/services/api/appId';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import useIntercom from '@/hooks/useIntercom';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import useTrackjs from '@/hooks/useTrackjs';
import initDatadog from '@/utils/datadog';
import initHotjar from '@/utils/hotjar';
import { setSmartChartsPublicPath } from '@deriv/deriv-charts';
import { ThemeProvider } from '@deriv-com/quill-ui';
import { localize } from '@deriv-com/translations';
import './app.scss';
import 'react-toastify/dist/ReactToastify.css';
import '../components/bot-notification/bot-notification.scss';

const Audio = lazy(() => import('../components/audio'));
const BlocklyLoading = lazy(() => import('../components/blockly-loading'));
const BotStopped = lazy(() => import('../components/bot-stopped'));
const BotBuilder = lazy(() => import('../pages/bot-builder'));
const Main = lazy(() => import('../pages/main'));
const TransactionDetailsModal = lazy(() => import('../components/transaction-details'));
const PWAInstallModal = lazy(() => import('../components/pwa-install-modal'));
const TncStatusUpdateModal = lazy(() => import('../components/tnc-status-update-modal'));

const WorkspaceShellFallback = () => <ChunkLoader message={localize('Loading ProfitDock workspace...')} />;

const AppContent = observer(() => {
    const token = V2GetActiveToken() ?? null;
    const has_stored_token = !!token;
    const is_profitdock_domain = window.location.hostname.includes('profitdock.site');
    const should_bypass_profitdock_shell_loader = is_profitdock_domain;
    const [is_api_initialized, setIsApiInitialized] = React.useState(should_bypass_profitdock_shell_loader);
    const [is_loading, setIsLoading] = React.useState(!should_bypass_profitdock_shell_loader);
    const [is_eu_error_loading, setIsEuErrorLoading] = React.useState(!should_bypass_profitdock_shell_loader);
    const [offline_timeout, setOfflineTimeout] = React.useState(null);
    const store = useStore();
    const { app, transactions, common, client } = store;
    const { showDigitalOptionsMaltainvestError } = app;
    const { is_dark_mode_on } = useThemeSwitcher();
    const { isOnline } = useOfflineDetection();

    const { recovered_transactions, recoverPendingContracts } = transactions;
    const is_subscribed_to_msg_listener = React.useRef(false);
    const msg_listener = React.useRef(null);
    const { connectionStatus, isAuthorized, isAuthorizing } = useApiBase();
    const { initTrackJS } = useTrackjs();
    const auth_recovery_started = React.useRef(false);

    initTrackJS(client.loginid);

    const livechat_client_information = {
        is_client_store_initialized: client?.is_logged_in ? !!client?.account_settings?.email : !!client,
        is_logged_in: client?.is_logged_in,
        loginid: client?.loginid,
        landing_company_shortcode: client?.landing_company_shortcode,
        currency: client?.currency,
        residence: client?.residence,
        email: client?.account_settings?.email,
        first_name: client?.account_settings?.first_name,
        last_name: client?.account_settings?.last_name,
    };

    useLiveChat(livechat_client_information);

    useIntercom(token);

    useEffect(() => {
        if (!is_api_initialized && api_base?.api) {
            setIsApiInitialized(true);
        }
    }, [is_api_initialized]);

    useEffect(() => {
        if (connectionStatus === CONNECTION_STATUS.OPENED) {
            setIsApiInitialized(true);
            common.setSocketOpened(true);
            // Clear offline timeout if connection is restored
            if (offline_timeout) {
                clearTimeout(offline_timeout);
                setOfflineTimeout(null);
            }
        } else if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            common.setSocketOpened(false);
        }
    }, [common, connectionStatus, offline_timeout]);

    // Handle offline scenarios - don't wait indefinitely for API
    useEffect(() => {
        if (!isOnline && is_loading) {
            console.log('[Offline] Detected offline state, setting timeout to show dashboard');
            const timeout = setTimeout(() => {
                console.log('[Offline] Timeout reached, showing dashboard in offline mode');
                setIsLoading(false);
                setIsApiInitialized(true);
                // Initialize basic stores for offline mode
                if (!app.dbot_store) {
                    init();
                }
            }, 3000); // Wait 3 seconds for potential connection, then show dashboard

            setOfflineTimeout(timeout);
        } else if (isOnline && offline_timeout) {
            // Clear timeout if we come back online
            clearTimeout(offline_timeout);
            setOfflineTimeout(null);
        }

        return () => {
            if (offline_timeout) {
                clearTimeout(offline_timeout);
            }
        };
    }, [isOnline, is_loading, offline_timeout, app.dbot_store]);

    const { current_language } = common;
    const html = document.documentElement;
    React.useEffect(() => {
        html?.setAttribute('lang', current_language.toLowerCase());
        html?.setAttribute('dir', current_language.toLowerCase() === 'ar' ? 'rtl' : 'ltr');
    }, [current_language, html]);

    // Check for EU client error early
    const is_eu_country = client?.is_eu_country;
    const clients_logged_out_country_code = client?.clients_country;
    const clients_logged_in_country_code = client?.account_settings?.country_code;
    const is_client_logged_in = client?.is_logged_in;

    useEffect(() => {
        const bot_restricted_countries = BOT_RESTRICTED_COUNTRIES_LIST();

        if (!client.is_logged_in) {
            // For logged out users
            if (clients_logged_out_country_code) {
                const is_restricted = !!bot_restricted_countries[clients_logged_out_country_code];
                setIsEuErrorLoading(client.is_eu_country && is_restricted);
            }
        } else {
            // For logged in users
            if (clients_logged_in_country_code) {
                const is_restricted = !!bot_restricted_countries[clients_logged_in_country_code];
                setIsEuErrorLoading(is_restricted);
            }
        }
    }, [is_eu_country, clients_logged_out_country_code, clients_logged_in_country_code, is_client_logged_in]);

    const handleMessage = React.useCallback(
        ({ data }) => {
            if (data?.msg_type === 'proposal_open_contract' && !data?.error) {
                const { proposal_open_contract } = data;
                if (
                    proposal_open_contract?.status !== 'open' &&
                    !recovered_transactions?.includes(proposal_open_contract?.contract_id)
                ) {
                    recoverPendingContracts(proposal_open_contract);
                }
            }
        },
        [recovered_transactions, recoverPendingContracts]
    );

    React.useEffect(() => {
        setSmartChartsPublicPath(getUrlBase('/js/smartcharts/'));
    }, []);

    React.useEffect(() => {
        // Check if api is initialized and then subscribe to the api messages
        // Also we should only subscribe to the messages once user is logged in
        // And is not already subscribed to the messages
        if (!is_subscribed_to_msg_listener.current && client.is_logged_in && is_api_initialized && api_base?.api) {
            is_subscribed_to_msg_listener.current = true;
            msg_listener.current = api_base.api.onMessage()?.subscribe(handleMessage);
        }
        return () => {
            if (is_subscribed_to_msg_listener.current && msg_listener.current) {
                is_subscribed_to_msg_listener.current = false;
                msg_listener.current.unsubscribe?.();
            }
        };
    }, [is_api_initialized, client.is_logged_in, client.loginid, handleMessage, connectionStatus]);

    React.useEffect(() => {
        showDigitalOptionsMaltainvestError(client, common);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.is_options_blocked, client.account_settings?.country_code, client.clients_country]);

    const init = () => {
        ServerTime.init(common);
        app.setDBotEngineStores();
        ApiHelpers.setInstance(app.api_helpers_store);
        import('@/utils/gtm').then(({ default: GTM }) => {
            GTM.init(store);
        });
    };

    const retrieveActiveSymbolsWithTimeout = React.useCallback(async () => {
        const active_symbols_store = ApiHelpers?.instance?.active_symbols;

        if (!active_symbols_store) {
            throw new Error('Active symbols store is not ready');
        }

        const active_symbols_request = active_symbols_store.retrieveActiveSymbols(true);
        const timeout_request = new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('Active symbols request timeout')), 12000);
        });

        return Promise.race([active_symbols_request, timeout_request]);
    }, []);

    const wait = delay => new Promise(resolve => window.setTimeout(resolve, delay));

    const retrieveActiveSymbolsWithRetry = React.useCallback(async () => {
        let last_error;

        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                await retrieveActiveSymbolsWithTimeout();
                return;
            } catch (error) {
                last_error = error;
                if (attempt < 2) {
                    await wait(1500);
                }
            }
        }

        throw last_error;
    }, [retrieveActiveSymbolsWithTimeout]);

    const changeActiveSymbolLoadingState = () => {
        init();

        const retrieveActiveSymbols = () => {
            // Handle offline scenario
            if (!isOnline) {
                console.log('[Offline] Skipping active symbols retrieval, showing dashboard');
                setIsLoading(false);
                return;
            }

            retrieveActiveSymbolsWithRetry()
                .then(() => {
                    void app.refreshTradeDefinitionBlocks?.();
                    setIsLoading(false);
                })
                .catch(error => {
                    console.error('[API] Failed to retrieve active symbols:', error);
                    // Don't stay in loading state if API fails
                    setIsLoading(false);
                });
        };

        if (ApiHelpers?.instance?.active_symbols) {
            retrieveActiveSymbols();
        } else {
            // This is a workaround to fix the issue where the active symbols are not loaded immediately
            // when the API is initialized. Should be replaced with RxJS pubsub
            const intervalId = setInterval(() => {
                if (ApiHelpers?.instance?.active_symbols) {
                    clearInterval(intervalId);
                    retrieveActiveSymbols();
                } else if (!isOnline) {
                    // If offline, don't wait indefinitely
                    clearInterval(intervalId);
                    console.log('[Offline] Stopping active symbols wait, showing dashboard');
                    setIsLoading(false);
                }
            }, 1000);

            // Set a maximum timeout to prevent infinite loading
            setTimeout(() => {
                clearInterval(intervalId);
                if (is_loading) {
                    console.log('[Timeout] Active symbols loading timeout, showing dashboard');
                    setIsLoading(false);
                }
            }, 10000); // 10 second timeout
        }
    };

    React.useEffect(() => {
        if (is_api_initialized) {
            init();

            if (is_profitdock_domain) {
                changeActiveSymbolLoadingState();
                return;
            }

            setIsLoading(true);
            if (!has_stored_token && !client.is_logged_in) {
                changeActiveSymbolLoadingState();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized, has_stored_token, client.is_logged_in]);

    // use is_landing_company_loaded to know got details of accounts to identify should show an error or not
    React.useEffect(() => {
        if (has_stored_token && is_api_initialized && isAuthorized && !isAuthorizing) {
            changeActiveSymbolLoadingState();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [has_stored_token, is_api_initialized, isAuthorized, isAuthorizing, client.loginid]);

    React.useEffect(() => {
        if (!has_stored_token || !is_api_initialized || isAuthorized || isAuthorizing || !isOnline) {
            auth_recovery_started.current = false;
            return undefined;
        }

        if (connectionStatus !== CONNECTION_STATUS.OPENED || auth_recovery_started.current) {
            return undefined;
        }

        const timeout = window.setTimeout(() => {
            auth_recovery_started.current = true;
            console.error('[Auth] Authenticated bootstrap did not complete. Revealing the app shell and keeping auth state intact.');
            setIsLoading(false);
        }, 6000);

        return () => {
            window.clearTimeout(timeout);
        };
    }, [connectionStatus, has_stored_token, is_api_initialized, isAuthorized, isAuthorizing, isOnline]);

    React.useEffect(() => {
        if (!is_loading || !is_api_initialized || !isOnline) {
            return undefined;
        }

        const loader_timeout = window.setTimeout(() => {
            console.error('[App] Global loading guard triggered. Revealing app shell.', {
                has_stored_token,
                isAuthorized,
                isAuthorizing,
                connectionStatus,
                is_client_logged_in: client.is_logged_in,
            });
            setIsLoading(false);
        }, has_stored_token ? 12000 : 10000);

        return () => {
            window.clearTimeout(loader_timeout);
        };
    }, [
        client.is_logged_in,
        connectionStatus,
        has_stored_token,
        isAuthorized,
        isAuthorizing,
        isOnline,
        is_api_initialized,
        is_loading,
    ]);

    useEffect(() => {
        initDatadog(true);
        if (client) {
            initHotjar(client);
        }
    }, []);

    if (common?.error) return null;

    // Show loading message based on online/offline state
    const getLoadingMessage = () => {
        if (is_eu_error_loading) return '';
        if (!isOnline) return localize('Loading offline dashboard...');
        return localize('Initializing Deriv Bot account...');
    };

    // Skip loading entirely when offline - show dashboard directly
    if (!isOnline) {
        console.log('[Offline] Bypassing loader, showing dashboard directly');
        return (
            <AuthLoadingWrapper>
                <ThemeProvider theme={is_dark_mode_on ? 'dark' : 'light'}>
                    <Suspense fallback={null}>
                        <BlocklyLoading />
                    </Suspense>
                    <div className='bot-dashboard bot' data-testid='dt_bot_dashboard'>
                        <Suspense fallback={<WorkspaceShellFallback />}>
                            <Audio />
                            <Main />
                            <BotBuilder />
                            <BotStopped />
                            <TransactionDetailsModal />
                            <PWAInstallModal />
                            <TncStatusUpdateModal />
                        </Suspense>
                        <ToastContainer limit={3} draggable={false} />
                    </div>
                </ThemeProvider>
            </AuthLoadingWrapper>
        );
    }

    return is_loading ? (
        <ChunkLoader message={getLoadingMessage()} />
    ) : (
        <AuthLoadingWrapper>
            <ThemeProvider theme={is_dark_mode_on ? 'dark' : 'light'}>
                <Suspense fallback={null}>
                    <BlocklyLoading />
                </Suspense>
                <div className='bot-dashboard bot' data-testid='dt_bot_dashboard'>
                    <Suspense fallback={<WorkspaceShellFallback />}>
                        <Audio />
                        <Main />
                        <BotBuilder />
                        <BotStopped />
                        <TransactionDetailsModal />
                        <PWAInstallModal />
                        <TncStatusUpdateModal />
                    </Suspense>
                    <ToastContainer limit={3} draggable={false} />
                </div>
            </ThemeProvider>
        </AuthLoadingWrapper>
    );
});

export default AppContent;
