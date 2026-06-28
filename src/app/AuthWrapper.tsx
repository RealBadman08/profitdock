import React from 'react';
import Cookies from 'js-cookie';
import ChunkLoader from '@/components/loader/chunk-loader';
import { ensureCustomDomainAppId } from '@/components/shared/utils/config/config';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { isOidcCallbackPath } from '@/utils/auth-utils';
import { clearAuthData, setLoggedStateCookie } from '@/utils/auth-utils';
import { localize } from '@deriv-com/translations';
import { URLUtils } from '@deriv-com/utils';
import App from './App';

// Extend Window interface to include is_tmb_enabled property
declare global {
    interface Window {
        is_tmb_enabled?: boolean;
    }
}

const setLocalStorageToken = async (
    loginInfo: URLUtils.LoginInfo[],
    paramsToDelete: string[],
    setIsAuthComplete: React.Dispatch<React.SetStateAction<boolean>>,
    isOnline: boolean
) => {
    if (loginInfo.length) {
        try {
            const defaultActiveAccount = URLUtils.getDefaultActiveAccount(loginInfo);
            if (!defaultActiveAccount) return;

            const accountsList: Record<string, string> = {};
            const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

            loginInfo.forEach((account: { loginid: string; token: string; currency: string }) => {
                accountsList[account.loginid] = account.token;
                clientAccounts[account.loginid] = account;
            });

            const persistAuthenticatedAccount = (token: string, loginid: string) => {
                localStorage.setItem('authToken', token);
                localStorage.setItem('active_loginid', loginid);
                setLoggedStateCookie('true');
            };
            const cleanupUrlTokens = () => {
                URLUtils.filterSearchParams(paramsToDelete);
            };

            const clearInvalidAuthState = () => {
                cleanupUrlTokens();
                clearAuthData(false);
                setLoggedStateCookie('false');
            };

            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

            // Skip API connection when offline
            if (!isOnline) {
                console.log('[Auth] Offline mode - skipping API connection');
                persistAuthenticatedAccount(defaultActiveAccount.token, defaultActiveAccount.loginid);
                cleanupUrlTokens();
                return;
            }

            try {
                const api = await generateDerivApiInstance();

                if (api) {
                    const { authorize, error } = await api.authorize(defaultActiveAccount.token);
                    api.disconnect();
                    if (error) {
                        console.error('[Auth] Authorization error during login bootstrap:', error);
                        // Check if the error is due to an invalid token
                        if (error.code === 'InvalidToken') {
                            // Set isAuthComplete to true to prevent the app from getting stuck in loading state
                            setIsAuthComplete(true);

                            const is_tmb_enabled = window.is_tmb_enabled === true;
                            // Only emit the InvalidToken event if logged_state is true
                            if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                                // Emit an event that can be caught by the application to retrigger OIDC authentication
                                globalObserver.emit('InvalidToken', { error });
                            }

                            if (Cookies.get('logged_state') === 'false') {
                                // If the user is not logged out, we need to clear the local storage
                                clearAuthData();
                            }
                        }

                        clearInvalidAuthState();
                        return;
                    } else {
                        localStorage.setItem('client.country', authorize.country);
                        const firstId = authorize?.account_list[0]?.loginid;
                        const filteredTokens = loginInfo.filter(token => token.loginid === firstId);
                        if (filteredTokens.length) {
                            persistAuthenticatedAccount(filteredTokens[0].token, filteredTokens[0].loginid);
                            cleanupUrlTokens();
                            return;
                        }
                    }
                }
            } catch (apiError) {
                console.error('[Auth] API connection error:', apiError);
                clearInvalidAuthState();
                return;
            }

            persistAuthenticatedAccount(defaultActiveAccount.token, defaultActiveAccount.loginid);
            cleanupUrlTokens();
        } catch (error) {
            console.error('Error setting up login info:', error);
        }
    }
};

export const AuthWrapper = () => {
    const [isAuthComplete, setIsAuthComplete] = React.useState(false);
    const { loginInfo, paramsToDelete } = URLUtils.getLoginInfoFromURL();
    const { isOnline } = useOfflineDetection();

    React.useEffect(() => {
        const initializeAuth = async () => {
            try {
                ensureCustomDomainAppId();

                if (isOidcCallbackPath()) {
                    setIsAuthComplete(true);
                    return;
                }

                // Pass isOnline to setLocalStorageToken to handle offline mode properly
                await setLocalStorageToken(loginInfo, paramsToDelete, setIsAuthComplete, isOnline);
                URLUtils.filterSearchParams(['lang']);
                setIsAuthComplete(true);
            } catch (error) {
                console.error('[Auth] Authentication initialization failed:', error);
                // Don't block the app if auth fails, especially when offline
                setIsAuthComplete(true);
            }
        };

        // If offline, set auth complete immediately but still run initializeAuth
        // to save login info to localStorage for offline use
        if (!isOnline) {
            console.log('[Auth] Offline detected, proceeding with minimal auth');
            setIsAuthComplete(true);
        }

        initializeAuth();
    }, [loginInfo, paramsToDelete, isOnline]);

    // Add timeout for offline scenarios to prevent infinite loading
    React.useEffect(() => {
        if (!isOnline && !isAuthComplete) {
            console.log('[Auth] Offline detected, setting auth timeout');
            const timeout = setTimeout(() => {
                console.log('[Auth] Offline timeout reached, proceeding without full auth');
                setIsAuthComplete(true);
            }, 2000); // 2 second timeout for offline

            return () => clearTimeout(timeout);
        }
    }, [isOnline, isAuthComplete]);

    const getLoadingMessage = () => {
        if (!isOnline) return localize('Loading offline mode...');
        return localize('Initializing...');
    };

    if (!isAuthComplete) {
        return <ChunkLoader message={getLoadingMessage()} />;
    }

    return <App />;
};
