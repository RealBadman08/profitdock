import { useState } from 'react';
import { useEffect } from 'react';
import {
    ensureCustomDomainAppId,
    getCustomLegacyOAuthAuthorizeUrl,
    isCustomLegacyOAuthDomain,
    isProfitdockDomainHost,
} from '@/components/shared/utils/config/config';
import { getRedirectCallbackUri } from '@/components/shared/utils/login/login';
import { hasUsableProfitdockStoredSession } from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import Cookies from 'js-cookie';
import RootStore from '@/stores/root-store';
import { clearAuthData, handleOidcAuthFailure, isAnyCallbackFlow, setLoggedStateCookie } from '@/utils/auth-utils';
import { Analytics } from '@deriv-com/analytics';
import { OAuth2Logout, requestOidcAuthentication } from '@deriv-com/auth-client';

/**
 * Provides an object with properties: `oAuthLogout`, `retriggerOAuth2Login`, and `isSingleLoggingIn`.
 *
 * `oAuthLogout` is a function that logs out the user of the OAuth2-enabled app.
 *
 * `retriggerOAuth2Login` is a function that retriggers the OAuth2 login flow to get a new token.
 *
 * `isSingleLoggingIn` is a boolean that indicates whether the user is currently logging in.
 *
 * The `handleLogout` argument is an optional function that will be called after logging out the user.
 * If `handleLogout` is not provided, the function will resolve immediately.
 *
 * @param {{ handleLogout?: () => Promise<void> }} [options] - An object with an optional `handleLogout` property.
 * @returns {{ oAuthLogout: () => Promise<void>; retriggerOAuth2Login: () => Promise<void>; isSingleLoggingIn: boolean }}
 */
export const useOauth2 = ({
    handleLogout,
    client,
}: {
    handleLogout?: () => Promise<void>;
    client?: RootStore['client'];
} = {}) => {
    const [isSingleLoggingIn, setIsSingleLoggingIn] = useState(false);
    const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
    const isClientAccountsPopulated = Object.keys(accountsList).length > 0;
    const hasStoredAuthSession = isProfitdockDomainHost()
        ? hasUsableProfitdockStoredSession()
        : !!localStorage.getItem('authToken') || !!localStorage.getItem('callback_token');
    const isSilentLoginExcluded = isAnyCallbackFlow() || window.location.pathname.includes('endpoint');

    const loggedState = Cookies.get('logged_state');

    useEffect(() => {
        window.addEventListener('unhandledrejection', event => {
            if (event?.reason?.error?.code === 'InvalidToken') {
                setIsSingleLoggingIn(false);
            }
        });
    }, []);

    useEffect(() => {
        const willEventuallySSO = loggedState === 'true' && !isClientAccountsPopulated && !hasStoredAuthSession;
        const willEventuallySLO = loggedState === 'false' && isClientAccountsPopulated;

        if (!isSilentLoginExcluded && (willEventuallySSO || willEventuallySLO)) {
            setIsSingleLoggingIn(true);
        } else {
            setIsSingleLoggingIn(false);
        }
    }, [hasStoredAuthSession, isClientAccountsPopulated, loggedState, isSilentLoginExcluded]);

    const logoutHandler = async () => {
        client?.setIsLoggingOut(true);
        try {
            if (isProfitdockDomainHost() || isCustomLegacyOAuthDomain()) {
                setLoggedStateCookie('false');
                await handleLogout?.();
                clearAuthData(false);
                Analytics.reset();
                window.location.replace(window.location.origin);
                return;
            }

            await OAuth2Logout({
                redirectCallbackUri: getRedirectCallbackUri(),
                WSLogoutAndRedirect: handleLogout ?? (() => Promise.resolve()),
                postLogoutRedirectUri: window.location.origin,
            }).catch(err => {
                // eslint-disable-next-line no-console
                console.error(err);
            });
            await client?.logout().catch(err => {
                // eslint-disable-next-line no-console
                console.error('Error during TMB logout:', err);
            });

            Analytics.reset();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(error);
        }
    };
    const retriggerOAuth2Login = async () => {
        ensureCustomDomainAppId();

        if (isProfitdockDomainHost() || isCustomLegacyOAuthDomain()) {
            sessionStorage.setItem('redirect_url', window.location.href);
            localStorage.setItem('config.post_login_redirect_uri', window.location.href);
            sessionStorage.removeItem('profitdock.oauth_scope_fallback_done');
            window.location.assign(getCustomLegacyOAuthAuthorizeUrl());
            return;
        }

        try {
            await requestOidcAuthentication({
                redirectCallbackUri: getRedirectCallbackUri(),
                postLogoutRedirectUri: window.location.origin,
            }).catch(err => {
                handleOidcAuthFailure(err);
            });
        } catch (error) {
            handleOidcAuthFailure(error);
        }
    };

    return { oAuthLogout: logoutHandler, retriggerOAuth2Login, isSingleLoggingIn };
};
