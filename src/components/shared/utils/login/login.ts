import { website_name } from '@/utils/site-config';
import { createUserManager, requestOidcAuthentication } from '@deriv-com/auth-client';
import {
    domain_app_ids,
    generateOAuthURL,
    getCustomLegacyOAuthAuthorizeUrl,
    getAppId,
    getCurrentProductionDomain,
    ensureCustomDomainAppId,
    isCustomLegacyOAuthDomain,
    isProfitdockDomainHost,
} from '../config/config';
import { CookieStorage, isStorageSupported, LocalStore } from '../storage/storage';
import { getStaticUrl, urlForCurrentDomain } from '../url';
import { deriv_urls } from '../url/constants';
import { clearAuthData, handleOidcAuthFailure, OIDC_CALLBACK_PATH } from '@/utils/auth-utils';

type TRequestAppAuthentication = {
    state?: Record<string, unknown>;
    prompt?: 'registration';
    post_login_redirect_uri?: string;
    post_logout_redirect_uri?: string;
};

let is_profitdock_oauth_redirecting = false;

export const getRedirectCallbackUri = () =>
    isProfitdockDomainHost()
        ? new URL(OIDC_CALLBACK_PATH, 'https://profitdock.site').toString()
        : new URL(OIDC_CALLBACK_PATH, window.location.origin).toString();

const clearProfitdockLegacyOAuthResidue = () => {
    if (!isProfitdockDomainHost()) {
        return;
    }

    const redirect_url =
        localStorage.getItem('config.post_login_redirect_uri') || sessionStorage.getItem('redirect_url') || '';
    const selected_currency = sessionStorage.getItem('query_param_currency') || '';

    clearAuthData(false);
    ensureCustomDomainAppId();

    if (redirect_url) {
        sessionStorage.setItem('redirect_url', redirect_url);
        localStorage.setItem('config.post_login_redirect_uri', redirect_url);
    }

    if (selected_currency) {
        sessionStorage.setItem('query_param_currency', selected_currency);
    }
};

export const requestAppAuthentication = async ({
    state,
    prompt,
    post_login_redirect_uri,
    post_logout_redirect_uri,
}: TRequestAppAuthentication = {}) => {
    ensureCustomDomainAppId();
    if (post_login_redirect_uri) {
        sessionStorage.setItem('redirect_url', post_login_redirect_uri);
        localStorage.setItem('config.post_login_redirect_uri', post_login_redirect_uri);
    }

    if (state && typeof state.account === 'string') {
        sessionStorage.setItem('query_param_currency', state.account);
    }

    if (isProfitdockDomainHost() || isCustomLegacyOAuthDomain()) {
        if (is_profitdock_oauth_redirecting) {
            return;
        }
        is_profitdock_oauth_redirecting = true;
        clearProfitdockLegacyOAuthResidue();
        sessionStorage.removeItem('profitdock.oauth_scope_fallback_done');
        window.location.assign(getCustomLegacyOAuthAuthorizeUrl({ prompt }));
        return;
    }

    const redirect_callback_uri = getRedirectCallbackUri();
    const post_logout_redirect = post_logout_redirect_uri || window.location.origin;

    try {
        if (prompt === 'registration') {
            const user_manager = await createUserManager({
                redirectCallbackUri: redirect_callback_uri,
                postLogoutRedirectUri: post_logout_redirect,
            });

            await user_manager.signinRedirect({
                extraQueryParams: {
                    brand: website_name.toLowerCase(),
                    prompt: 'registration',
                },
                state,
            });
            return;
        }

        await requestOidcAuthentication({
            redirectCallbackUri: redirect_callback_uri,
            postLoginRedirectUri: post_login_redirect_uri,
            postLogoutRedirectUri: post_logout_redirect,
            state,
        });
    } catch (error) {
        handleOidcAuthFailure(error);
        throw error;
    }
};

export const redirectToLogin = (is_logged_in: boolean, language: string, has_params = true, redirect_delay = 0) => {
    if (!is_logged_in && isStorageSupported(sessionStorage)) {
        const l = window.location;
        const redirect_url = has_params ? window.location.href : `${l.protocol}//${l.host}${l.pathname}`;
        sessionStorage.setItem('redirect_url', redirect_url);

        if (isProfitdockDomainHost() || isCustomLegacyOAuthDomain()) {
            setTimeout(() => {
                requestAppAuthentication({
                    post_login_redirect_uri: redirect_url,
                }).catch(() => undefined);
            }, redirect_delay);
            return;
        }

        setTimeout(() => {
            const new_href = loginUrl({ language });
            window.location.href = new_href;
        }, redirect_delay);
    }
};

export const redirectToSignUp = () => {
    if (isProfitdockDomainHost() || isCustomLegacyOAuthDomain()) {
        requestAppAuthentication({
            prompt: 'registration',
            post_login_redirect_uri: window.location.href,
        }).catch(() => undefined);
        return;
    }

    window.open(getStaticUrl('/signup/'));
};

type TLoginUrl = {
    language: string;
};

export const loginUrl = ({ language }: TLoginUrl) => {
    if (isProfitdockDomainHost() || isCustomLegacyOAuthDomain()) {
        clearProfitdockLegacyOAuthResidue();
        sessionStorage.removeItem('profitdock.oauth_scope_fallback_done');
        return getCustomLegacyOAuthAuthorizeUrl();
    }

    const server_url = LocalStore.get('config.server_url');
    const signup_device_cookie = new (CookieStorage as any)('signup_device');
    const signup_device = signup_device_cookie.get('signup_device');
    const date_first_contact_cookie = new (CookieStorage as any)('date_first_contact');
    const date_first_contact = date_first_contact_cookie.get('date_first_contact');
    const marketing_queries = `${signup_device ? `&signup_device=${signup_device}` : ''}${
        date_first_contact ? `&date_first_contact=${date_first_contact}` : ''
    }`;
    const getOAuthUrl = () => {
        const current_domain = getCurrentProductionDomain();
        let oauth_domain = deriv_urls.DERIV_HOST_NAME;

        if (current_domain && !isProfitdockDomainHost() && !isCustomLegacyOAuthDomain()) {
            // Extract domain suffix (e.g., 'deriv.me' from 'dbot.deriv.me')
            const domain_suffix = current_domain.replace(/^[^.]+\./, '');
            oauth_domain = domain_suffix;
        }

        const url = `https://oauth.${oauth_domain}/oauth2/authorize?app_id=${getAppId()}&l=${language}${marketing_queries}&brand=${website_name.toLowerCase()}`;
        return url;
    };

    if (server_url && /qa/.test(server_url)) {
        return `https://${server_url}/oauth2/authorize?app_id=${getAppId()}&l=${language}${marketing_queries}&brand=${website_name.toLowerCase()}`;
    }

    if (getAppId() === domain_app_ids[window.location.hostname as keyof typeof domain_app_ids]) {
        return getOAuthUrl();
    }
    return urlForCurrentDomain(getOAuthUrl());
};
