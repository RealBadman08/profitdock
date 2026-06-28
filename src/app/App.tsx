import { initSurvicate } from '../public-path';
import { lazy, Suspense } from 'react';
import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, useRouteError } from 'react-router-dom';
import ChunkLoader from '@/components/loader/chunk-loader';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import { crypto_currencies_display_order, fiat_currencies_display_order } from '@/components/shared';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { StoreProvider } from '@/hooks/useStore';
import Layout from '@/components/layout';
import CallbackPage from '@/pages/callback';
import Endpoint from '@/pages/endpoint';
import { TAuthData } from '@/types/api-types';
import { isOidcCallbackPath, isRootOidcCallback } from '@/utils/auth-utils';
import { initializeI18n, localize, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import AppRoot from './app-root';
import './app-root.scss';

const isDemoAccountRecord = (loginid: string, account?: { account_type?: string; is_virtual?: boolean }) =>
    account?.account_type === 'demo' || account?.is_virtual === true || /^VR/i.test(loginid);

const FreeBots = lazy(() => import('../pages/free-bots'));
const AnalysisTool = lazy(() => import('../pages/analysis-tool'));
const CopyTrading = lazy(() => import('../pages/copy-trading'));
const SignalCenter = lazy(() => import('@/extensions/tabs/signal-center'));
const FastTrader = lazy(() => import('@/extensions/tabs/fast-trader'));

const RootEntry = () => {
    if (isRootOidcCallback() || isOidcCallbackPath()) {
        return <CallbackPage />;
    }

    return <AppRoot />;
};

const RootRouteErrorFallback = () => {
    const error = useRouteError() as Error | undefined;
    const message = error?.message || 'The app could not finish loading.';
    const is_chunk_error = /Loading (CSS )?chunk|ChunkLoadError/i.test(message);

    const recover = async () => {
        if ('caches' in window) {
            const cache_names = await caches.keys().catch(() => []);
            await Promise.all(cache_names.map(cache_name => caches.delete(cache_name))).catch(() => undefined);
        }
        window.location.reload();
    };

    return (
        <div
            style={{
                alignItems: 'center',
                background: 'var(--general-main-1, #ffffff)',
                color: 'var(--text-general, #333333)',
                display: 'flex',
                minHeight: 'calc(100vh - 64px)',
                padding: '2.4rem',
                justifyContent: 'center',
                textAlign: 'center',
            }}
        >
            <div style={{ maxWidth: '48rem' }}>
                <h1 style={{ color: 'var(--brand-red-coral, #ff444f)', fontSize: '2.8rem', marginBottom: '1rem' }}>
                    ProfitDock could not finish loading
                </h1>
                <p style={{ fontSize: '1.6rem', lineHeight: 1.55, marginBottom: '2rem' }}>
                    {is_chunk_error
                        ? 'A route file failed to load. Refreshing will clear stale browser cache and reload the latest build.'
                        : message}
                </p>
                <button
                    type='button'
                    onClick={() => void recover()}
                    style={{
                        background: 'var(--brand-red-coral, #ff444f)',
                        border: 0,
                        borderRadius: '1rem',
                        color: '#ffffff',
                        cursor: 'pointer',
                        fontSize: '1.6rem',
                        fontWeight: 700,
                        padding: '1.2rem 2rem',
                    }}
                >
                    Reload ProfitDock
                </button>
            </div>
        </div>
    );
};

const { TRANSLATIONS_CDN_URL, R2_PROJECT_NAME, CROWDIN_BRANCH_NAME } = process.env;
const i18nInstance = initializeI18n({
    cdnUrl: `${TRANSLATIONS_CDN_URL}/${R2_PROJECT_NAME}/${CROWDIN_BRANCH_NAME}`,
});

// Simple Suspense wrapper without timeout that causes dark landing page
const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => {
    const { isOnline } = useOfflineDetection();

    const getLoadingMessage = () => {
        if (!isOnline) return localize('Loading offline dashboard...');
        return localize('Please wait while we connect to the server...');
    };

    return <Suspense fallback={<ChunkLoader message={getLoadingMessage()} />}>{children}</Suspense>;
};

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            path='/'
            errorElement={<RootRouteErrorFallback />}
            element={
                <SuspenseWrapper>
                    <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
                        <StoreProvider>
                            <RoutePromptDialog />
                            <CoreStoreProvider>
                                <Layout />
                            </CoreStoreProvider>
                        </StoreProvider>
                    </TranslationProvider>
                </SuspenseWrapper>
            }
        >
            {/* All child routes will be passed as children to Layout */}
            <Route index element={<RootEntry />} />
            <Route path='endpoint' element={<Endpoint />} />
            <Route path='callback' element={<CallbackPage />} />
            <Route path='auth/callback' element={<CallbackPage />} />
            <Route path='free-bots' element={<FreeBots />} />
            <Route path='analysis-tool' element={<AnalysisTool />} />
            <Route path='copy-trading' element={<CopyTrading />} />
            <Route path='signal-center' element={<SignalCenter />} />
            <Route path='fast-trader' element={<FastTrader />} />
        </Route>
    )
);

function App() {
    React.useEffect(() => {
        // Use the invalid token handler hook to automatically retrigger OIDC authentication
        // when an invalid token is detected and the cookie logged state is true

        initSurvicate();
        window?.dataLayer?.push({ event: 'page_load' });
        return () => {
            // Clean up the invalid token handler when the component unmounts
            const survicate_box = document.getElementById('survicate-box');
            if (survicate_box) {
                survicate_box.style.display = 'none';
            }
        };
    }, []);

    React.useEffect(() => {
        const accounts_list = localStorage.getItem('accountsList');
        const client_accounts = localStorage.getItem('clientAccounts');
        const url_params = new URLSearchParams(window.location.search);
        const account_currency = url_params.get('account');
        const validCurrencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order];

        const is_valid_currency = account_currency && validCurrencies.includes(account_currency?.toUpperCase());

        if (!accounts_list || !client_accounts) return;

        try {
            const parsed_accounts = JSON.parse(accounts_list);
            const parsed_client_accounts = JSON.parse(client_accounts) as TAuthData['account_list'];

            const updateLocalStorage = (token: string, loginid: string) => {
                localStorage.setItem('authToken', token);
                localStorage.setItem('active_loginid', loginid);
            };

            // Handle demo account
            if (account_currency?.toUpperCase() === 'DEMO') {
                const demo_account = Object.entries(parsed_client_accounts).find(([loginid, account]) =>
                    isDemoAccountRecord(loginid, account as { account_type?: string; is_virtual?: boolean })
                );

                if (demo_account) {
                    const [loginid, account] = demo_account;
                    if ('token' in account) {
                        updateLocalStorage(String(account?.token), loginid);
                    } else {
                        updateLocalStorage(String(parsed_accounts[loginid]), loginid);
                    }
                    return;
                }
            }

            // Handle live account with valid currency
            if (account_currency?.toUpperCase() !== 'DEMO' && is_valid_currency) {
                const real_account = Object.entries(parsed_client_accounts).find(
                    ([loginid, account]) =>
                        !isDemoAccountRecord(loginid, account as { account_type?: string; is_virtual?: boolean }) &&
                        account.currency.toUpperCase() === account_currency?.toUpperCase()
                );

                if (real_account) {
                    const [loginid, account] = real_account;
                    if ('token' in account) {
                        updateLocalStorage(String(account?.token), loginid);
                    }
                    return;
                }
            }
        } catch (e) {
            console.warn('Error', e); // eslint-disable-line no-console
        }
    }, []);

    return <RouterProvider router={router} />;
}

export default App;
