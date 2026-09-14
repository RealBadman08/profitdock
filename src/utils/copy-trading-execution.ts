import {
    getActiveProfitdockLoginId,
    getProfitdockOAuthToken,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';

type TCopySourceAccountType = 'real' | 'demo' | 'virtual';
type TContractParameters = Record<string, unknown>;
type TCachedProposal = { contract_parameters: TContractParameters; created_at: number; req_id?: number | string };

const COPY_TRADING_BULK_PURCHASE_URL = '/api/copy-trading/bulk-purchase';
const COPY_TRADING_EXECUTION_TOKENS_URL = '/api/copy-trading/execution-tokens';
const DERIV_BULK_PURCHASE_URL = 'https://api.derivws.com/trading/v1/options/contracts/bulk-purchase/real';
const DERIV_CLIENT_ID = '339iXSWkH7NEGne7sMdQT';
const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=36300';
const MAX_PROPOSAL_CACHE_SIZE = 120;
const MAX_MIRRORED_BUY_KEYS = 160;
const PROPOSAL_CACHE_TTL_MS = 5 * 60 * 1000;
const PRELOADED_TOKENS_TTL_MS = 4 * 60 * 1000;

// master proposal_id → { contract_parameters, req_id }
const proposal_cache = new Map<string, TCachedProposal>();
const mirrored_buy_keys = new Set<string>();
const mirrored_buy_key_order: string[] = [];
const requestDedupKeys = new WeakMap<object, string>();

// req_id (from master proposal broadcast) → { account_id → copy_proposal_id }
// Updated every time a copy socket receives a proposal response for that req_id.
// Subscribe proposals update this map on every tick, so it's always fresh.
const copy_proposal_ids = new Map<number | string, Record<string, string>>();

type TPreloadedTokenPair = { account_id: string; token: string };
let preloaded_tokens: TPreloadedTokenPair[] | null = null;
let preloaded_tokens_loaded_at = 0;
let preloaded_tokens_fetch_promise: Promise<void> | null = null;

type TAccountSocket = {
    account_id: string;
    token: string;
    ws: WebSocket;
    authorized: boolean;
    pending_buys: string[];
    pending_proposals: string[];
};
const account_sockets: Map<string, TAccountSocket> = new Map();

const openAccountSocket = (pair: TPreloadedTokenPair): TAccountSocket => {
    const ws = new WebSocket(DERIV_WS_URL);
    const entry: TAccountSocket = {
        account_id: pair.account_id,
        token: pair.token,
        ws,
        authorized: false,
        pending_buys: [],
        pending_proposals: [],
    };
    ws.onopen = () => { ws.send(JSON.stringify({ authorize: pair.token, req_id: 1 })); };
    ws.onmessage = (event: MessageEvent) => {
        try {
            const msg = JSON.parse(event.data as string);
            if (msg.msg_type === 'authorize' && !msg.error) {
                entry.authorized = true;
                entry.pending_proposals.forEach(p => ws.send(p));
                entry.pending_proposals = [];
                entry.pending_buys.forEach(b => ws.send(b));
                entry.pending_buys = [];
            }
            // Cache the latest proposal ID for each req_id.
            // This works for both one-shot and subscribe proposals — subscribe keeps it fresh every tick.
            if (msg.msg_type === 'proposal' && !msg.error && msg.req_id && msg.proposal?.id) {
                const req_id = msg.req_id;
                if (!copy_proposal_ids.has(req_id)) copy_proposal_ids.set(req_id, {});
                copy_proposal_ids.get(req_id)![entry.account_id] = msg.proposal.id;
            }
        } catch { /* ignore */ }
    };
    ws.onerror = () => { entry.authorized = false; };
    ws.onclose = () => {
        entry.authorized = false;
        account_sockets.delete(pair.account_id);
        setTimeout(() => {
            if (preloaded_tokens) {
                const found = preloaded_tokens.find(p => p.account_id === pair.account_id);
                if (found) account_sockets.set(found.account_id, openAccountSocket(found));
            }
        }, 2000);
    };
    return entry;
};

const initAccountSockets = (tokens: TPreloadedTokenPair[]) => {
    account_sockets.forEach((entry, id) => {
        if (!tokens.find(t => t.account_id === id)) {
            try { entry.ws.close(); } catch { /* ignore */ }
            account_sockets.delete(id);
        }
    });
    tokens.forEach(pair => { if (!account_sockets.has(pair.account_id)) account_sockets.set(pair.account_id, openAccountSocket(pair)); });
};

/**
 * Fire buy:<copy_proposal_id> on a copy socket.
 * Uses the copy's own proposal ID (same tick as master proposal) — tick-perfect.
 */
const sendBuyWithProposalId = (entry: TAccountSocket, copy_proposal_id: string, amount: unknown) => {
    const payload = JSON.stringify({
        buy: copy_proposal_id,
        price: amount ?? 0,
        req_id: Date.now(),
        passthrough: { _profitdock_copy_trading_skip: true },
    });
    if (entry.authorized && entry.ws.readyState === WebSocket.OPEN) {
        entry.ws.send(payload);
    } else {
        entry.pending_buys.push(payload);
    }
};

/**
 * Fire buy:1 with inline params on a copy socket.
 * Last resort only — no proposal so entry tick is not guaranteed to match.
 */
const sendDirectBuy = (entry: TAccountSocket, contract_params: TContractParameters) => {
    const symbolKey = String((contract_params as any).underlying_symbol || (contract_params as any).symbol || '');
    const params: Record<string, unknown> = { ...contract_params, symbol: symbolKey || undefined };
    delete (params as any).underlying_symbol;
    const payload = JSON.stringify({
        buy: 1,
        price: params.amount ?? 0,
        parameters: params,
        req_id: Date.now(),
        passthrough: { _profitdock_copy_trading_skip: true },
    });
    if (entry.authorized && entry.ws.readyState === WebSocket.OPEN) {
        entry.ws.send(payload);
    } else {
        entry.pending_buys.push(payload);
    }
};

const OMIT_CONTRACT_PARAMETER_KEYS = new Set(['proposal','subscribe','req_id','passthrough','echo_req','msg_type','buy','price','loginid','product_type','landing_company','landing_company_short','date_start','barrier_range','trading_period_start','trade_risk_profile']);

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const parseMaybeJson = (value: unknown) => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return value; } };
const unwrapApiPayload = (value: unknown) => { const parsed = parseMaybeJson(value); return isPlainObject(parsed) && isPlainObject(parsed.data) ? parsed.data : parsed; };
const hasApiError = (value: unknown) => isPlainObject(value) && (Boolean(value.error) || (Array.isArray(value.errors) && value.errors.length > 0));
const pickString = (...values: unknown[]) => { const value = values.find(candidate => typeof candidate === 'string' || typeof candidate === 'number'); return value === undefined ? '' : String(value); };

const getBuyContractId = (payload: unknown) => {
    if (!isPlainObject(payload)) return '';
    const buy = isPlainObject(payload.buy) ? payload.buy : null;
    const contract = isPlainObject(payload.contract) ? payload.contract : null;
    const transaction = isPlainObject(payload.transaction) ? payload.transaction : null;
    const buyContract = isPlainObject(buy?.contract) ? buy.contract : null;
    return pickString(buy?.contract_id, buy?.id, buyContract?.contract_id, buyContract?.id, payload.contract_id, contract?.contract_id, contract?.id, transaction?.contract_id);
};

const hasSuccessfulBuyPayload = (payload: unknown) => isPlainObject(payload) && (isPlainObject(payload.buy) || Boolean(payload.contract_id) || isPlainObject(payload.contract) || isPlainObject(payload.transaction));

const getCurrentSourceAccountType = (source_account_type?: string): TCopySourceAccountType => {
    const requested_type = String(source_account_type || '').toLowerCase();
    if (requested_type === 'real' || requested_type === 'demo' || requested_type === 'virtual') return requested_type;
    if (typeof window === 'undefined') return 'real';
    const client_store = (window as any)._clientStore;
    if (client_store?.is_dummy_active) return 'virtual';
    const active_loginid = getActiveProfitdockLoginId() || window.localStorage.getItem('active_loginid') || client_store?.loginid || client_store?.account_id || '';
    return /^(VRTC|VR|DOTD)/i.test(active_loginid) ? 'demo' : 'real';
};

const pruneProposalCache = () => {
    const now = Date.now();
    Array.from(proposal_cache.entries()).forEach(([id, cached]) => { if (now - cached.created_at > PROPOSAL_CACHE_TTL_MS) proposal_cache.delete(id); });
    while (proposal_cache.size > MAX_PROPOSAL_CACHE_SIZE) { const oldest = proposal_cache.keys().next().value; if (!oldest) break; proposal_cache.delete(oldest); }
};

const rememberMirroredBuyKey = (key: string) => {
    if (mirrored_buy_keys.has(key)) return false;
    mirrored_buy_keys.add(key);
    mirrored_buy_key_order.push(key);
    while (mirrored_buy_key_order.length > MAX_MIRRORED_BUY_KEYS) { const old = mirrored_buy_key_order.shift(); if (old) mirrored_buy_keys.delete(old); }
    return true;
};

export const normalizeCopyTradingContractParameters = (request: unknown): TContractParameters | null => {
    if (!isPlainObject(request)) return null;
    const source = isPlainObject(request.parameters) ? request.parameters : request;
    const params: TContractParameters = {};
    Object.entries(source).forEach(([key, value]) => { if (OMIT_CONTRACT_PARAMETER_KEYS.has(key) || value === undefined || value === null || value === '') return; params[key] = value; });
    if (typeof params.symbol === 'string' && !params.underlying_symbol) params.underlying_symbol = params.symbol;
    delete params.symbol;
    if (!params.contract_type || !params.currency || !params.amount || !params.basis || !params.underlying_symbol) return null;
    return params;
};

export const cacheCopyTradingProposalFromRequest = (request: unknown, response: unknown) => {
    const parsed_response = unwrapApiPayload(response);
    const proposal = isPlainObject(parsed_response) && isPlainObject(parsed_response.proposal) ? parsed_response.proposal : null;
    const proposal_id = typeof proposal?.id === 'string' ? proposal.id : '';
    if (!proposal_id) return;
    const contract_parameters = normalizeCopyTradingContractParameters(request);
    if (!contract_parameters) return;
    const req_id = (request as any)?.req_id;
    proposal_cache.set(proposal_id, { contract_parameters, created_at: Date.now(), req_id });
    pruneProposalCache();
};

const dispatchCopyTradingResult = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;
    (window as any).__profitdockCopyTradingLastResult = detail;
    window.dispatchEvent(new CustomEvent('profitdock:copy-trading-result', { detail }));
};

const getPreloadedTokens = (): TPreloadedTokenPair[] | null => {
    if (!preloaded_tokens) return null;
    if (Date.now() - preloaded_tokens_loaded_at > PRELOADED_TOKENS_TTL_MS) { preloaded_tokens = null; return null; }
    return preloaded_tokens;
};

export const preloadCopyTradingTokens = (): Promise<void> => {
    if (preloaded_tokens_fetch_promise) return preloaded_tokens_fetch_promise;
    if (getPreloadedTokens()) return Promise.resolve();
    const token = getProfitdockOAuthToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let ownerLoginid = '';
    if (typeof window !== 'undefined') {
        try { const clientAccounts = JSON.parse(window.localStorage.getItem('clientAccounts') || '{}'); ownerLoginid = Object.keys(clientAccounts).find(k => k.startsWith('CR') || k.startsWith('ROT')) || ''; } catch { /* ignore */ }
        if (!ownerLoginid) ownerLoginid = window.localStorage.getItem('active_loginid') || '';
    }
    if (ownerLoginid) headers['X-Deriv-Loginid'] = ownerLoginid;
    preloaded_tokens_fetch_promise = fetch(COPY_TRADING_EXECUTION_TOKENS_URL, { credentials: 'include', headers, method: 'GET' })
        .then(r => r.json())
        .then((payload: any) => {
            if (Array.isArray(payload?.accounts)) {
                preloaded_tokens = payload.accounts;
                preloaded_tokens_loaded_at = Date.now();
                initAccountSockets(preloaded_tokens!);
            }
        })
        .catch(err => { console.warn('[Copy Trading] Token preload failed, will use server path:', err); })
        .finally(() => { preloaded_tokens_fetch_promise = null; });
    return preloaded_tokens_fetch_promise;
};

/**
 * Broadcast the master's proposal request to all copy sockets.
 * Copy sockets will receive their own proposal IDs and cache them in copy_proposal_ids[req_id].
 * When the master fires a buy, we use those cached IDs immediately — no extra roundtrip.
 */
export const broadcastCopyTradingProposal = (request: any) => {
    if (!request || typeof request !== 'object' || !request.proposal || !request.req_id) return;
    if (account_sockets.size === 0) return;
    const params = { ...request };
    delete params.passthrough;
    const msg = JSON.stringify(params);
    account_sockets.forEach(entry => {
        if (entry.authorized && entry.ws.readyState === WebSocket.OPEN) {
            entry.ws.send(msg);
        } else {
            entry.pending_proposals.push(msg);
        }
    });
};

/**
 * Fire copy trades for a given set of contract parameters.
 * 
 * If req_id is provided: look for pre-fetched copy proposal IDs (from broadcastCopyTradingProposal).
 * If found: fire buy:<copy_proposal_id> immediately — tick-perfect.
 * If not found: fire buy:1 with params — best effort, same tick not guaranteed.
 */
export const mirrorCopyTradingContractParameters = async (
    contract_parameters: unknown,
    source_account_type?: string,
    buy_key = '',
    req_id?: number | string
) => {
    const normalized_parameters = normalizeCopyTradingContractParameters(contract_parameters);
    if (!normalized_parameters) return { skipped: true, reason: 'missing_contract_parameters' };
    const source_type = getCurrentSourceAccountType(source_account_type);
    const token = getProfitdockOAuthToken();
    if (buy_key && !rememberMirroredBuyKey(buy_key)) return { skipped: true, reason: 'duplicate_buy' };

    // FASTEST PATH: WebSocket connections are ready
    if (account_sockets.size > 0) {
        const cached_copy_proposals = req_id ? copy_proposal_ids.get(req_id) : undefined;
        account_sockets.forEach(entry => {
            const copy_proposal_id = cached_copy_proposals?.[entry.account_id];
            if (copy_proposal_id) {
                // Best path: copy already has a proposal ID from broadcastCopyTradingProposal.
                // Fire buy:<proposal_id> immediately — same tick as master.
                sendBuyWithProposalId(entry, copy_proposal_id, normalized_parameters.amount);
            } else {
                // No pre-fetched proposal — fire buy:1 directly (best effort).
                sendDirectBuy(entry, normalized_parameters);
            }
        });
        // Clean up used proposal IDs so they don't get reused on the next trade
        if (req_id) copy_proposal_ids.delete(req_id);
        dispatchCopyTradingResult({ contract_parameters: normalized_parameters, ok: true, source_account_type: source_type, status: 200, via: 'websocket' });
        return { ok: true, via: 'websocket' };
    }

    // FAST FALLBACK: direct HTTP bulk-purchase to Deriv
    const cached = getPreloadedTokens();
    if (cached && cached.length > 0) {
        try {
            const symbolKey = String((normalized_parameters as any).underlying_symbol || (normalized_parameters as any).symbol || '');
            const primary = { ...normalized_parameters, symbol: symbolKey || undefined };
            delete (primary as any).underlying_symbol;
            const result = await fetch(DERIV_BULK_PURCHASE_URL, { body: JSON.stringify({ contract_parameters: primary, accounts: cached }), headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Deriv-App-ID': DERIV_CLIENT_ID }, method: 'POST' }).then(r => r.json()).catch(() => null);
            dispatchCopyTradingResult({ contract_parameters: normalized_parameters, ok: true, payload: result, source_account_type: source_type, status: 200, via: 'direct' });
            return result;
        } catch (err) { console.warn('[Copy Trading] Direct Deriv call failed, falling back to server:', err); }
    }

    // SLOW FALLBACK: Vercel server
    try {
        const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        let ownerLoginid = '';
        if (typeof window !== 'undefined') {
            try { const ca = JSON.parse(window.localStorage.getItem('clientAccounts') || '{}'); ownerLoginid = Object.keys(ca).find(k => k.startsWith('CR') || k.startsWith('ROT')) || ''; } catch { /* ignore */ }
            if (!ownerLoginid) ownerLoginid = window.localStorage.getItem('active_loginid') || '';
        }
        if (ownerLoginid) headers['X-Deriv-Loginid'] = ownerLoginid;
        const response = await fetch(COPY_TRADING_BULK_PURCHASE_URL, { body: JSON.stringify({ contract_parameters: normalized_parameters, source_account_type: source_type, source_loginid: ownerLoginid || undefined }), credentials: 'include', headers, method: 'POST' });
        const payload = await response.json().catch(() => null);
        const result = { contract_parameters: normalized_parameters, ok: response.ok, payload, source_account_type: source_type, status: response.status, via: 'server' };
        dispatchCopyTradingResult(result);
        if (!response.ok) console.warn('[Copy Trading] Bulk purchase failed:', payload);
        return result;
    } catch (error) {
        const result = { contract_parameters: normalized_parameters, error, ok: false, source_account_type: source_type };
        dispatchCopyTradingResult(result);
        console.warn('[Copy Trading] Bulk purchase request failed:', error);
        return result;
    }
};

export const mirrorCopyTradingBuyFromRequest = (request: unknown, response: unknown, source_account_type?: string) => {
    if (!isPlainObject(request)) return undefined;
    const passthrough = isPlainObject(request.passthrough) ? request.passthrough : null;
    if (passthrough?._vrtc_skip || passthrough?._profitdock_copy_trading_skip) return undefined;
    const parsed_response = unwrapApiPayload(response);
    if (hasApiError(parsed_response) || !hasSuccessfulBuyPayload(parsed_response)) return undefined;
    const contract_id = getBuyContractId(parsed_response);
    const request_id = pickString(request.req_id, passthrough?.id, passthrough?.purchase_reference);
    const earlyFired: Set<string> = (typeof window !== 'undefined' && (window as any).__profitdockEarlyFiredReqs) || new Set();
    if ((request.buy === 1 || request.buy === '1') && isPlainObject(request.parameters)) {
        const direct_key = requestDedupKeys.get(request as object) || contract_id || request_id || `direct:${Date.now()}`;
        if (earlyFired.has(direct_key)) { earlyFired.delete(direct_key); return undefined; }
        if (request_id && earlyFired.has(request_id)) { earlyFired.delete(request_id); return undefined; }
        return mirrorCopyTradingContractParameters(request.parameters, source_account_type, `auto:req:${direct_key}`);
    }
    const proposal_id = typeof request.buy === 'string' || typeof request.buy === 'number' ? String(request.buy) : '';
    if (!proposal_id) return undefined;
    const proposal_dedup_key = `auto:${proposal_id}`;
    if (earlyFired.has(proposal_dedup_key)) { earlyFired.delete(proposal_dedup_key); return undefined; }
    const cached_proposal = proposal_cache.get(proposal_id);
    if (!cached_proposal) return undefined;
    proposal_cache.delete(proposal_id);
    return mirrorCopyTradingContractParameters(cached_proposal.contract_parameters, source_account_type, proposal_dedup_key, cached_proposal.req_id);
};

export const mirrorCopyTradingBuyImmediately = (request: unknown, source_account_type?: string) => {
    if (!isPlainObject(request)) return undefined;
    const passthrough = isPlainObject(request.passthrough) ? request.passthrough : null;
    if (passthrough?._vrtc_skip || passthrough?._profitdock_copy_trading_skip) return undefined;
    const earlyFired: Set<string> = typeof window !== 'undefined'
        ? ((window as any).__profitdockEarlyFiredReqs = (window as any).__profitdockEarlyFiredReqs || new Set())
        : new Set();
    if ((request.buy === 1 || request.buy === '1') && isPlainObject(request.parameters)) {
        const direct_key = pickString(request.req_id, passthrough?.id, passthrough?.purchase_reference) || `direct:${Date.now()}`;
        requestDedupKeys.set(request as object, direct_key);
        const dedup_key = `auto:req:${direct_key}`;
        earlyFired.add(direct_key);
        // buy:1 direct — no pre-fetched proposal, fire directly
        return mirrorCopyTradingContractParameters(request.parameters, source_account_type, dedup_key);
    }
    const proposal_id = typeof request.buy === 'string' || typeof request.buy === 'number' ? String(request.buy) : '';
    if (!proposal_id) return undefined;
    const cached_proposal = proposal_cache.get(proposal_id);
    if (!cached_proposal) return undefined;
    const proposal_dedup_key = `auto:${proposal_id}`;
    earlyFired.add(proposal_dedup_key);
    // buy:<proposal_id> — use pre-fetched copy proposal IDs from broadcastCopyTradingProposal
    return mirrorCopyTradingContractParameters(cached_proposal.contract_parameters, source_account_type, proposal_dedup_key, cached_proposal.req_id);
};
