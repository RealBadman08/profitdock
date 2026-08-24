import { getSocketAppId, getSocketURL } from '@/components/shared';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { website_name } from '@/utils/site-config';
import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';
import { getInitialLanguage } from '@deriv-com/translations';
import {
    fetchProfitdockAuthenticatedWebSocketUrl,
    getActiveProfitdockLoginId,
    getProfitdockOAuthToken,
} from './profitdock-oauth-session';
import APIMiddleware from './api-middleware';
import {
    cacheCopyTradingProposalFromRequest,
    mirrorCopyTradingBuyFromRequest,
} from '@/utils/copy-trading-execution';

const PROFITDOCK_PUBLIC_SOCKET_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

const cleanupProfitdockRequest = request => {
    const is_profitdock_pkce_session =
        isCustomLegacyOAuthDomain() &&
        localStorage.getItem('callback_token')?.includes('"token_type":"oauth"') === true;

    if (!is_profitdock_pkce_session || !isObject(request)) {
        return request;
    }

    const payload = {
        ...request,
    };

    if ('active_symbols' in payload) {
        delete payload.product_type;
        delete payload.landing_company;
        delete payload.landing_company_short;
        delete payload.loginid;
    }

    if ('contracts_for' in payload) {
        delete payload.currency;
        delete payload.product_type;
        delete payload.landing_company;
        delete payload.landing_company_short;
        delete payload.loginid;
    }

    if ('balance' in payload) {
        delete payload.account;
        delete payload.loginid;
    }

    if ('proposal' in payload) {
        if (payload.symbol && !payload.underlying_symbol) {
            payload.underlying_symbol = payload.symbol;
        }

        delete payload.symbol;
        delete payload.product_type;
        delete payload.landing_company;
        delete payload.landing_company_short;
        delete payload.loginid;
        delete payload.date_start;
        delete payload.barrier_range;
        delete payload.trading_period_start;
        delete payload.trade_risk_profile;
    }

    if ('buy' in payload) {
        delete payload.loginid;

        if (isObject(payload.parameters)) {
            payload.parameters = {
                ...payload.parameters,
            };

            if (payload.parameters.symbol && !payload.parameters.underlying_symbol) {
                payload.parameters.underlying_symbol = payload.parameters.symbol;
            }

            delete payload.parameters.symbol;
            delete payload.parameters.product_type;
            delete payload.parameters.loginid;
            delete payload.parameters.landing_company;
            delete payload.parameters.landing_company_short;
        }
    }

    if ('proposal_open_contract' in payload || 'transaction' in payload || 'contract_update' in payload) {
        delete payload.loginid;
    }

    return payload;
};

export const createDerivApiInstanceForSocketUrl = socket_url => {
    const deriv_socket = new WebSocket(socket_url);
    const deriv_api = new DerivAPIBasic({
        connection: deriv_socket,
        middleware: new APIMiddleware({}),
    });
    deriv_api.is_profitdock_authenticated_socket = /\/trading\/v1\/options\/ws\/(?:demo|real)\?/i.test(socket_url);
    deriv_api._profitdock_socket = deriv_socket;

    const original_send = deriv_api.send.bind(deriv_api);

    const process_profitdock_trade_response = async (sent_request, response_promise, source_account_type) => {
        const response = await response_promise;
        cacheCopyTradingProposalFromRequest(sent_request, response);
        void mirrorCopyTradingBuyFromRequest(sent_request, response, source_account_type);
        return response;
    };

    deriv_api.send = async request => {
        if (typeof window !== 'undefined' && window._profitdock_dummy_interceptor) {
            const interceptRes = window._profitdock_dummy_interceptor(request, deriv_api);
            if (interceptRes !== undefined) {
                return process_profitdock_trade_response(request, Promise.resolve(interceptRes), 'virtual');
            }
        }

        const cleaned_request = cleanupProfitdockRequest(request);
        return process_profitdock_trade_response(cleaned_request, original_send(cleaned_request));
    };

    return deriv_api;
};

export const generateDerivApiInstance = (socket_url_override = null) => {
    if (socket_url_override) {
        return createDerivApiInstanceForSocketUrl(socket_url_override);
    }

    if (isCustomLegacyOAuthDomain()) {
        const socketAppId = getSocketAppId();
        const cleanedAppId = socketAppId?.replace?.(/[^a-zA-Z0-9]/g, '') ?? socketAppId ?? '1089';
        return createDerivApiInstanceForSocketUrl(`${PROFITDOCK_PUBLIC_SOCKET_URL}?app_id=${cleanedAppId}`);
    }

    const cleanedServer = getSocketURL().replace(/[^a-zA-Z0-9.]/g, '');
    const socketAppId = getSocketAppId();
    const cleanedAppId = socketAppId?.replace?.(/[^a-zA-Z0-9]/g, '') ?? socketAppId;
    const socket_url = `wss://${cleanedServer}/websockets/v3?app_id=${cleanedAppId}&l=${getInitialLanguage()}&brand=${website_name.toLowerCase()}`;

    return createDerivApiInstanceForSocketUrl(socket_url);
};

export const getLoginId = () => {
    const login_id = localStorage.getItem('active_loginid');
    if (login_id && login_id !== 'null') return login_id;
    return null;
};

export const getProfitdockPublicSocketUrl = () => {
    const socketAppId = getSocketAppId();
    const cleanedAppId = socketAppId?.replace?.(/[^a-zA-Z0-9]/g, '') ?? socketAppId ?? '1089';
    return `${PROFITDOCK_PUBLIC_SOCKET_URL}?app_id=${cleanedAppId}`;
};

export const createProfitdockAuthorizedDerivApiInstance = async ({
    access_token = getProfitdockOAuthToken(),
    loginid = getActiveProfitdockLoginId(),
} = {}) => {
    if (!access_token || !loginid) {
        throw new Error('ProfitDock cannot start an authenticated socket without an active OAuth session.');
    }

    const socket_url = await fetchProfitdockAuthenticatedWebSocketUrl({
        access_token,
        loginid,
    });

    return createDerivApiInstanceForSocketUrl(socket_url);
};

export const V2GetActiveToken = () => {
    const active_loginid = getLoginId();

    if (active_loginid) {
        try {
            const account_list = JSON.parse(localStorage.getItem('accountsList') || '{}');
            const active_account_token = account_list?.[active_loginid];
            if (typeof active_account_token === 'string' && active_account_token !== 'null') {
                return active_account_token;
            }
        } catch (error) {
            console.error('[ProfitDock Auth] Failed to read the selected account token:', error);
        }
    }

    const token = localStorage.getItem('authToken');
    if (token && token !== 'null') return token;
    return null;
};

export const V2GetActiveClientId = () => {
    const token = V2GetActiveToken();
    const active_loginid = getLoginId();

    if (active_loginid) {
        return active_loginid;
    }

    if (!token) return null;
    const account_list = JSON.parse(localStorage.getItem('accountsList'));
    if (account_list && account_list !== 'null') {
        const active_clientId = Object.keys(account_list).find(key => account_list[key] === token);
        return active_clientId;
    }
    return null;
};

export const getToken = () => {
    const active_loginid = getLoginId();
    const client_accounts = JSON.parse(localStorage.getItem('accountsList')) ?? undefined;
    const active_account = (client_accounts && client_accounts[active_loginid]) || {};
    return {
        token: active_account ?? undefined,
        account_id: active_loginid ?? undefined,
    };
};
