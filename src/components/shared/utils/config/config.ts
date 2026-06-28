import { LocalStorageConstants, LocalStorageUtils, URLUtils } from '@deriv-com/utils';
import { isStaging } from '../url/helpers';

export const APP_IDS = {
    LOCALHOST: 36300,
    TMP_STAGING: 64584,
    STAGING: 29934,
    STAGING_BE: 29934,
    STAGING_ME: 29934,
    PROFITDOCK_NEW: '339iXSWkH7NEGne7sMdQT',
    PRODUCTION: 65555,
    PRODUCTION_BE: 65556,
    PRODUCTION_ME: 65557,
};

export const OAUTH_CLIENT_IDS = {
    PROFITDOCK: '339iXSWkH7NEGne7sMdQT',
};

export const livechat_license_id = 12049137;
export const livechat_client_id = '66aa088aad5a414484c1fd1fa8a5ace7';

export const domain_app_ids = {
    'master.bot-standalone.pages.dev': APP_IDS.TMP_STAGING,
    'staging-dbot.deriv.com': APP_IDS.STAGING,
    'staging-dbot.deriv.be': APP_IDS.STAGING_BE,
    'staging-dbot.deriv.me': APP_IDS.STAGING_ME,
    'profitdock.site': OAUTH_CLIENT_IDS.PROFITDOCK,
    'www.profitdock.site': OAUTH_CLIENT_IDS.PROFITDOCK,
    'dbot.deriv.com': APP_IDS.PRODUCTION,
    'dbot.deriv.be': APP_IDS.PRODUCTION_BE,
    'dbot.deriv.me': APP_IDS.PRODUCTION_ME,
};

export const custom_legacy_oauth_domains = ['profitdock.site', 'www.profitdock.site'];
export const preferred_custom_domain = 'profitdock.site';
export const custom_legacy_oauth_scope = 'trade account_manage application_read';

export const isProfitdockDomainHost = (hostname = typeof window !== 'undefined' ? window.location.hostname : '') => {
    const normalized_hostname = String(hostname || '').toLowerCase();
    return custom_legacy_oauth_domains.includes(normalized_hostname);
};

export const isCustomLegacyOAuthDomain = () => isProfitdockDomainHost();

export const redirectCustomDomainToPreferredHost = () => {
    if (typeof window === 'undefined') return false;

    if (isProfitdockDomainHost(window.location.hostname) && window.location.hostname.toLowerCase() === 'www.profitdock.site') {
        const preferred_url = new URL(window.location.href);
        preferred_url.hostname = preferred_custom_domain;
        window.location.replace(preferred_url.toString());
        return true;
    }

    return false;
};

export const getCurrentProductionDomain = () =>
    !/^staging\./.test(window.location.hostname) &&
    Object.keys(domain_app_ids).find(domain => window.location.hostname === domain);

export const isProduction = () => {
    const all_domains = Object.keys(domain_app_ids).map(domain => `(www\\.)?${domain.replace('.', '\\.')}`);
    return new RegExp(`^(${all_domains.join('|')})$`, 'i').test(window.location.hostname);
};

export const isTestLink = () => {
    return (
        window.location.origin?.includes('.binary.sx') ||
        window.location.origin?.includes('bot-65f.pages.dev') ||
        isLocal()
    );
};

export const isLocal = () => /localhost(:\d+)?$/i.test(window.location.hostname);

const getDefaultServerURL = () => {
    return 'ws.derivws.com';
};

export const getDefaultAppIdAndUrl = () => {
    const server_url = getDefaultServerURL();

    if (isTestLink()) {
        return { app_id: APP_IDS.LOCALHOST, server_url };
    }

    const current_domain = getCurrentProductionDomain() ?? '';
    const app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION;

    return { app_id, server_url };
};

export const getAppId = () => {
    const current_domain = getCurrentProductionDomain() ?? '';

    if (isCustomLegacyOAuthDomain()) {
        const custom_domain_app_id =
            domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? OAUTH_CLIENT_IDS.PROFITDOCK;

        localStorage.setItem('config.app_id', String(custom_domain_app_id));
        localStorage.removeItem('config.socket_app_id');
        localStorage.removeItem('config.server_url');

        return custom_domain_app_id;
    }

    let app_id = null;
    const config_app_id = window.localStorage.getItem('config.app_id');

    if (config_app_id) {
        app_id = config_app_id;
    } else if (isStaging()) {
        app_id = APP_IDS.STAGING;
    } else if (isTestLink()) {
        app_id = APP_IDS.LOCALHOST;
    } else {
        app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION;
    }

    return app_id;
};

export const getSocketAppId = () => {
    const configured_socket_app_id = window.localStorage.getItem('config.socket_app_id');

    if (isCustomLegacyOAuthDomain()) {
        return String(OAUTH_CLIENT_IDS.PROFITDOCK);
    }

    if (configured_socket_app_id) {
        return configured_socket_app_id;
    }

    return getAppId();
};

export const getSocketURL = () => {
    if (isCustomLegacyOAuthDomain()) {
        return 'ws.derivws.com';
    }

    const local_storage_server_url = window.localStorage.getItem('config.server_url');
    if (local_storage_server_url) return local_storage_server_url;

    const server_url = getDefaultServerURL();

    return server_url;
};

export const checkAndSetEndpointFromUrl = () => {
    if (isTestLink()) {
        const url_params = new URLSearchParams(location.search.slice(1));

        if (url_params.has('qa_server') && url_params.has('app_id')) {
            const qa_server = url_params.get('qa_server') || '';
            const app_id = url_params.get('app_id') || '';

            url_params.delete('qa_server');
            url_params.delete('app_id');

            if (/^(^(www\.)?qa[0-9]{1,4}\.deriv.dev|(.*)\.derivws\.com)$/.test(qa_server) && /^[0-9]+$/.test(app_id)) {
                localStorage.setItem('config.app_id', app_id);
                localStorage.setItem('config.server_url', qa_server.replace(/"/g, ''));
            }

            const params = url_params.toString();
            const hash = location.hash;

            location.href = `${location.protocol}//${location.hostname}${location.pathname}${
                params ? `?${params}` : ''
            }${hash || ''}`;

            return true;
        }
    }

    return false;
};

export const getDebugServiceWorker = () => {
    const debug_service_worker_flag = window.localStorage.getItem('debug_service_worker');
    if (debug_service_worker_flag) return !!parseInt(debug_service_worker_flag);

    return false;
};

export const ensureCustomDomainAppId = () => {
    if (typeof window === 'undefined') return;

    if (isCustomLegacyOAuthDomain()) {
        const current_app_id = domain_app_ids[window.location.hostname as keyof typeof domain_app_ids];
        if (current_app_id) {
            localStorage.setItem('config.app_id', String(current_app_id));
        }
        localStorage.removeItem('profitdock_auth_stage');
        localStorage.removeItem('config.socket_app_id');
        localStorage.removeItem('config.server_url');
    }
};

export const getCustomLegacyOAuthRedirectUri = () =>
    new URL('/auth/callback', `https://${preferred_custom_domain}`).toString();

export const getCustomLegacyOAuthAuthorizeUrl = ({ prompt }: { prompt?: 'registration' } = {}) => {
    const authorize_url = new URL('/api/deriv/oauth/start', window.location.origin);

    if (prompt === 'registration') {
        authorize_url.searchParams.set('prompt', 'registration');
    }

    return authorize_url.toString();
};

export const generateOAuthURL = () => {
    const hostname = window.location.hostname;

    if (isCustomLegacyOAuthDomain()) {
        return getCustomLegacyOAuthAuthorizeUrl();
    }

    const { getOauthURL } = URLUtils;
    const oauth_url = getOauthURL();
    const original_url = new URL(oauth_url);

    // First priority: Check for configured server URLs (for QA/testing environments)
    const configured_server_url = (LocalStorageUtils.getValue(LocalStorageConstants.configServerURL) ||
        localStorage.getItem('config.server_url')) as string;

    const valid_server_urls = ['green.derivws.com', 'red.derivws.com', 'blue.derivws.com', 'canary.derivws.com'];

    if (
        configured_server_url &&
        (typeof configured_server_url === 'string'
            ? !valid_server_urls.includes(configured_server_url)
            : !valid_server_urls.includes(JSON.stringify(configured_server_url)))
    ) {
        original_url.hostname = configured_server_url;
    } else if (original_url.hostname.includes('oauth.deriv.')) {
        // Second priority: Domain-based OAuth URL setting for .me and .be domains
        if (hostname.includes('.deriv.me')) {
            original_url.hostname = 'oauth.deriv.me';
        } else if (hostname.includes('.deriv.be')) {
            original_url.hostname = 'oauth.deriv.be';
        } else {
            // Fallback to original logic for other domains
            const current_domain = getCurrentProductionDomain();
            if (current_domain) {
                const domain_suffix = current_domain.replace(/^[^.]+\./, '');
                original_url.hostname = `oauth.${domain_suffix}`;
            }
        }
    }
    return original_url.toString() || oauth_url;
};
