/**
 * Utility functions for authentication-related operations
 */
import Cookies from 'js-cookie';

export const OIDC_CALLBACK_PATH = '/auth/callback';

export const isOidcCallbackPath = () => {
    if (typeof window === 'undefined') return false;

    return window.location.pathname === OIDC_CALLBACK_PATH || window.location.pathname === '/callback';
};

export const hasOidcAuthResultParams = () => {
    if (typeof window === 'undefined') return false;

    const params = new URLSearchParams(window.location.search);

    return params.has('code') || params.has('error');
};

export const isRootOidcCallback = () => {
    if (typeof window === 'undefined') return false;

    return window.location.pathname === '/' && hasOidcAuthResultParams();
};

export const isAnyCallbackFlow = () => {
    if (typeof window === 'undefined') return false;

    return isOidcCallbackPath() || isRootOidcCallback();
};

export const getLoggedStateCookieOptions = () => {
    const { hostname, protocol } = window.location;
    const is_localhost = /localhost$/i.test(hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    const cookie_domain = is_localhost ? undefined : hostname.split('.').slice(-2).join('.');

    return {
        ...(cookie_domain ? { domain: cookie_domain } : {}),
        expires: 30,
        path: '/',
        secure: protocol === 'https:',
    };
};

export const setLoggedStateCookie = (value: 'true' | 'false') => {
    Cookies.set('logged_state', value, getLoggedStateCookieOptions());
};

const removeMatchingStorageKeys = (storage: Storage) => {
    const auth_key_pattern = /oidc|oauth2|session_state|userManager|auth-client|pkce|profitdock_oauth_|deriv_auth/i;
    const keys_to_remove: string[] = [];

    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && auth_key_pattern.test(key)) {
            keys_to_remove.push(key);
        }
    }

    keys_to_remove.forEach(key => storage.removeItem(key));
};

const clearAuthCookies = () => {
    const cookie_domain = getLoggedStateCookieOptions().domain;
    const cookie_options = {
        path: '/',
        ...(cookie_domain ? { domain: cookie_domain } : {}),
    };

    Cookies.remove('logged_state', cookie_options);
    Cookies.remove('profitdock_oauth_state', cookie_options);
    Cookies.remove('profitdock_oauth_verifier', cookie_options);

    if (cookie_domain) {
        Cookies.remove('logged_state', { path: '/', domain: `.${cookie_domain}` });
        Cookies.remove('profitdock_oauth_state', { path: '/', domain: `.${cookie_domain}` });
        Cookies.remove('profitdock_oauth_verifier', { path: '/', domain: `.${cookie_domain}` });
    }
};

/**
 * Clears authentication data from local storage and reloads the page
 */
export const clearAuthData = (is_reload: boolean = true): void => {
    localStorage.removeItem('accountsList');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('callback_token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('client.accounts');
    localStorage.removeItem('client_account_details');
    localStorage.removeItem('client.country');
    localStorage.removeItem('config.app_id');
    localStorage.removeItem('config.legacy_app_id');
    localStorage.removeItem('config.server_url');
    localStorage.removeItem('config.socket_app_id');
    localStorage.removeItem('config.post_login_redirect_uri');
    localStorage.removeItem('profitdock_auth_stage');
    removeMatchingStorageKeys(localStorage);
    sessionStorage.removeItem('query_param_currency');
    sessionStorage.removeItem('redirect_url');
    sessionStorage.removeItem('profitdock.oauth_scope_fallback_done');
    removeMatchingStorageKeys(sessionStorage);
    clearAuthCookies();
    if (is_reload) {
        location.reload();
    }
};

/**
 * Handles OIDC authentication failure by clearing auth data and showing logged out view
 * @param error - The error that occurred during OIDC authentication
 */
export const handleOidcAuthFailure = (error: any): void => {
    // Log the error
    console.error('OIDC authentication failed:', error);

    // Clear all auth/session state so the shell cannot remain in a fake logged-in state.
    clearAuthData(false);

    // Set logged_state cookie to false
    setLoggedStateCookie('false');

    // Reload the page to show the logged out view
    window.location.reload();
};
