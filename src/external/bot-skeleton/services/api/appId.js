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

    const original_send = deriv_api.send.bind(deriv_api);

    // Track virtual trades: contractId -> stake, so we can credit back on settlement
    const _virtualTrackMap = {};

    deriv_api.send = async request => {
        const isDummyActive = typeof window !== 'undefined' && localStorage.getItem('profitdock_dummy_active') === 'true';
        const storedBalance = typeof window !== 'undefined' ? localStorage.getItem('profitdock_dummy_balance') : null;
        const hasCustomBalance = storedBalance !== null;

        // Intercept BUY requests when virtual mode is ON
        if (request.buy && isDummyActive && hasCustomBalance) {
            const dummyBalance = Number(storedBalance || '0');
            const price = parseFloat(String(request.price || '0'));

            // Block if insufficient
            if (price > dummyBalance) {
                return Promise.resolve({
                    error: { code: 'InsufficientBalance', message: 'Insufficient balance.' },
                    echo_req: request,
                    msg_type: 'buy'
                });
            }

            // Allow the real buy but immediately deduct from dummy balance
            const result = await original_send(cleanupProfitdockRequest(request));
            if (!result?.error && result?.buy) {
                const newBalance = Math.max(0, dummyBalance - price);
                localStorage.setItem('profitdock_dummy_balance', String(newBalance));
                // Store stake so we can credit back profit/loss on settlement
                _virtualTrackMap[result.buy.contract_id] = price;
                // Notify store of updated balance
                if (typeof window !== 'undefined' && window._profitdock_update_balance) {
                    window._profitdock_update_balance(newBalance);
                }
            }
            return result;
        }

        // Intercept SELL / proposal_open_contract responses to credit back profits
        if (request.sell && isDummyActive && hasCustomBalance) {
            const result = await original_send(cleanupProfitdockRequest(request));
            return result;
        }

        // Intercept proposal_open_contract — when contract is settled, credit profit/loss
        if (request.proposal_open_contract && isDummyActive && hasCustomBalance) {
            const result = await original_send(cleanupProfitdockRequest(request));
            if (result?.proposal_open_contract?.is_sold) {
                const poc = result.proposal_open_contract;
                const stake = _virtualTrackMap[poc.contract_id];
                if (stake !== undefined) {
                    delete _virtualTrackMap[poc.contract_id];
                    const payout = poc.sell_price || 0;
                    const currentBalance = Number(localStorage.getItem('profitdock_dummy_balance') || '0');
                    const newBalance = currentBalance + payout;
                    localStorage.setItem('profitdock_dummy_balance', String(newBalance));
                    if (typeof window !== 'undefined' && window._profitdock_update_balance) {
                        window._profitdock_update_balance(newBalance);
                    }
                }
            }
            return result;
        }

        if (typeof window !== 'undefined' && window._profitdock_dummy_interceptor) {
            const interceptRes = window._profitdock_dummy_interceptor(request, deriv_api);
            if (interceptRes !== undefined) return interceptRes;
        }
        return original_send(cleanupProfitdockRequest(request));
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
