import {
    getActiveProfitdockLoginId,
    getProfitdockOAuthToken,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';

type TCopySourceAccountType = 'real' | 'demo' | 'virtual';

type TContractParameters = Record<string, unknown>;

type TCachedProposal = {
    contract_parameters: TContractParameters;
    created_at: number;
};

const COPY_TRADING_BULK_PURCHASE_URL = '/api/copy-trading/bulk-purchase';
const MAX_PROPOSAL_CACHE_SIZE = 120;
const MAX_MIRRORED_BUY_KEYS = 160;
const PROPOSAL_CACHE_TTL_MS = 5 * 60 * 1000;

const proposal_cache = new Map<string, TCachedProposal>();
const mirrored_buy_keys = new Set<string>();
const mirrored_buy_key_order: string[] = [];

const OMIT_CONTRACT_PARAMETER_KEYS = new Set([
    'proposal',
    'subscribe',
    'req_id',
    'passthrough',
    'echo_req',
    'msg_type',
    'buy',
    'price',
    'loginid',
    'product_type',
    'landing_company',
    'landing_company_short',
    'date_start',
    'barrier_range',
    'trading_period_start',
    'trade_risk_profile',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseMaybeJson = (value: unknown) => {
    if (typeof value !== 'string') return value;

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

const unwrapApiPayload = (value: unknown) => {
    const parsed = parseMaybeJson(value);
    return isPlainObject(parsed) && isPlainObject(parsed.data) ? parsed.data : parsed;
};

const hasApiError = (value: unknown) =>
    isPlainObject(value) &&
    (Boolean(value.error) || (Array.isArray(value.errors) && value.errors.length > 0));

const pickString = (...values: unknown[]) => {
    const value = values.find(candidate => typeof candidate === 'string' || typeof candidate === 'number');
    return value === undefined ? '' : String(value);
};

const getBuyContractId = (payload: unknown) => {
    if (!isPlainObject(payload)) return '';

    const buy = isPlainObject(payload.buy) ? payload.buy : null;
    const contract = isPlainObject(payload.contract) ? payload.contract : null;
    const transaction = isPlainObject(payload.transaction) ? payload.transaction : null;
    const buyContract = isPlainObject(buy?.contract) ? buy.contract : null;

    return pickString(
        buy?.contract_id,
        buy?.id,
        buyContract?.contract_id,
        buyContract?.id,
        payload.contract_id,
        contract?.contract_id,
        contract?.id,
        transaction?.contract_id
    );
};

const hasSuccessfulBuyPayload = (payload: unknown) =>
    isPlainObject(payload) &&
    (isPlainObject(payload.buy) ||
        Boolean(payload.contract_id) ||
        isPlainObject(payload.contract) ||
        isPlainObject(payload.transaction));

const getCurrentSourceAccountType = (source_account_type?: string): TCopySourceAccountType => {
    const requested_type = String(source_account_type || '').toLowerCase();
    if (requested_type === 'real' || requested_type === 'demo' || requested_type === 'virtual') {
        return requested_type;
    }

    if (typeof window === 'undefined') {
        return 'real';
    }

    const client_store = (window as any)._clientStore;
    if (client_store?.is_dummy_active) {
        return 'virtual';
    }

    const active_loginid =
        getActiveProfitdockLoginId() ||
        window.localStorage.getItem('active_loginid') ||
        client_store?.loginid ||
        client_store?.account_id ||
        '';

    return /^(VRTC|VR|DOTD)/i.test(active_loginid) ? 'demo' : 'real';
};

const pruneProposalCache = () => {
    const now = Date.now();

    Array.from(proposal_cache.entries()).forEach(([proposal_id, cached]) => {
        if (now - cached.created_at > PROPOSAL_CACHE_TTL_MS) {
            proposal_cache.delete(proposal_id);
        }
    });

    while (proposal_cache.size > MAX_PROPOSAL_CACHE_SIZE) {
        const oldest_key = proposal_cache.keys().next().value;
        if (!oldest_key) break;
        proposal_cache.delete(oldest_key);
    }
};

const rememberMirroredBuyKey = (key: string) => {
    if (mirrored_buy_keys.has(key)) return false;

    mirrored_buy_keys.add(key);
    mirrored_buy_key_order.push(key);

    while (mirrored_buy_key_order.length > MAX_MIRRORED_BUY_KEYS) {
        const old_key = mirrored_buy_key_order.shift();
        if (old_key) mirrored_buy_keys.delete(old_key);
    }

    return true;
};

export const normalizeCopyTradingContractParameters = (request: unknown): TContractParameters | null => {
    if (!isPlainObject(request)) return null;

    const source = isPlainObject(request.parameters) ? request.parameters : request;
    const params: TContractParameters = {};

    Object.entries(source).forEach(([key, value]) => {
        if (OMIT_CONTRACT_PARAMETER_KEYS.has(key) || value === undefined || value === null || value === '') {
            return;
        }

        params[key] = value;
    });

    if (typeof params.symbol === 'string' && !params.underlying_symbol) {
        params.underlying_symbol = params.symbol;
    }

    delete params.symbol;

    if (!params.contract_type || !params.currency || !params.amount || !params.basis || !params.underlying_symbol) {
        return null;
    }

    return params;
};

export const cacheCopyTradingProposalFromRequest = (request: unknown, response: unknown) => {
    const parsed_response = unwrapApiPayload(response);
    const proposal = isPlainObject(parsed_response) && isPlainObject(parsed_response.proposal) ? parsed_response.proposal : null;
    const proposal_id = typeof proposal?.id === 'string' ? proposal.id : '';

    if (!proposal_id) return;

    const contract_parameters = normalizeCopyTradingContractParameters(request);
    if (!contract_parameters) return;

    proposal_cache.set(proposal_id, {
        contract_parameters,
        created_at: Date.now(),
    });
    pruneProposalCache();
};

const dispatchCopyTradingResult = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;

    (window as any).__profitdockCopyTradingLastResult = detail;
    window.dispatchEvent(new CustomEvent('profitdock:copy-trading-result', { detail }));
};

export const mirrorCopyTradingContractParameters = async (
    contract_parameters: unknown,
    source_account_type?: string,
    buy_key = ''
) => {
    const normalized_parameters = normalizeCopyTradingContractParameters(contract_parameters);
    if (!normalized_parameters) {
        return { skipped: true, reason: 'missing_contract_parameters' };
    }

    const source_type = getCurrentSourceAccountType(source_account_type);
    const token = getProfitdockOAuthToken();

    if (buy_key && !rememberMirroredBuyKey(buy_key)) {
        return { skipped: true, reason: 'duplicate_buy' };
    }

    try {
        const headers: Record<string, string> = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };

        // Production OAuth sets an HttpOnly session cookie; localStorage is only
        // a convenience fallback. Never skip mirroring just because authToken is
        // not readable by JavaScript.
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(COPY_TRADING_BULK_PURCHASE_URL, {
            body: JSON.stringify({
                contract_parameters: normalized_parameters,
                source_account_type: source_type,
            }),
            credentials: 'include',
            headers,
            method: 'POST',
        });

        const payload = await response.json().catch(() => null);

        const result = {
            contract_parameters: normalized_parameters,
            ok: response.ok,
            payload,
            source_account_type: source_type,
            status: response.status,
        };

        dispatchCopyTradingResult(result);

        if (!response.ok) {
            console.warn('[Copy Trading] Bulk purchase failed:', payload);
        }

        return result;
    } catch (error) {
        const result = {
            contract_parameters: normalized_parameters,
            error,
            ok: false,
            source_account_type: source_type,
        };

        dispatchCopyTradingResult(result);
        console.warn('[Copy Trading] Bulk purchase request failed:', error);
        return result;
    }
};

export const mirrorCopyTradingBuyFromRequest = (
    request: unknown,
    response: unknown,
    source_account_type?: string
) => {
    if (!isPlainObject(request)) return undefined;

    const passthrough = isPlainObject(request.passthrough) ? request.passthrough : null;
    if (passthrough?._vrtc_skip || passthrough?._profitdock_copy_trading_skip) {
        return undefined;
    }

    const parsed_response = unwrapApiPayload(response);

    if (hasApiError(parsed_response) || !hasSuccessfulBuyPayload(parsed_response)) {
        return undefined;
    }

    const contract_id = getBuyContractId(parsed_response);
    const request_id = pickString(request.req_id, passthrough?.id, passthrough?.purchase_reference);

    if ((request.buy === 1 || request.buy === '1') && isPlainObject(request.parameters)) {
        const direct_key = contract_id || request_id || `direct:${Date.now()}`;
        return mirrorCopyTradingContractParameters(request.parameters, source_account_type, `${source_account_type || 'auto'}:${direct_key}`);
    }

    const proposal_id = typeof request.buy === 'string' || typeof request.buy === 'number' ? String(request.buy) : '';
    if (!proposal_id) return undefined;

    const cached_proposal = proposal_cache.get(proposal_id);
    if (!cached_proposal) return undefined;

    proposal_cache.delete(proposal_id);

    return mirrorCopyTradingContractParameters(
        cached_proposal.contract_parameters,
        source_account_type,
        `${source_account_type || 'auto'}:${contract_id || proposal_id}`
    );
};

export const __copyTradingExecutionInternals = {
    clear: () => {
        proposal_cache.clear();
        mirrored_buy_keys.clear();
        mirrored_buy_key_order.splice(0, mirrored_buy_key_order.length);
    },
    proposal_cache,
};
