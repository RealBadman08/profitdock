const crypto = require('crypto');

const DEFAULT_SUPABASE_URL = 'https://vxlevznzuwnebixogbqn.supabase.co';
const DERIV_CLIENT_ID = process.env.DERIV_CLIENT_ID || '339iXSWkH7NEGne7sMdQT';
const DERIV_API_BASE = 'https://api.derivws.com';
const DERIV_OPTIONS_ACCOUNTS_URL = `${DERIV_API_BASE}/trading/v1/options/accounts`;
const DERIV_BULK_PURCHASE_URL = `${DERIV_API_BASE}/trading/v1/options/contracts/bulk-purchase/real`;
const MAX_CONNECTED_ACCOUNTS = 20;

const getSupabaseUrl = () =>
    (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');

const getSupabaseServiceRoleKey = () =>
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

const getCredentialSecret = () =>
    process.env.COPY_TRADING_CREDENTIAL_SECRET || process.env.PROFITDOCK_CREDENTIAL_SECRET || '';

class PublicError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const readJsonBody = req =>
    new Promise((resolve, reject) => {
        let body = '';

        req.on('data', chunk => {
            body += chunk;
            if (body.length > 128 * 1024) {
                reject(new PublicError(413, 'payload_too_large', 'Request body is too large.'));
                req.destroy();
            }
        });

        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new PublicError(400, 'invalid_json', 'Request body must be valid JSON.'));
            }
        });

        req.on('error', reject);
    });

const parseCookies = cookieHeader =>
    String(cookieHeader || '')
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((acc, part) => {
            const separator = part.indexOf('=');
            if (separator === -1) return acc;

            const key = part.slice(0, separator);
            const value = part.slice(separator + 1);
            try {
                acc[key] = decodeURIComponent(value);
            } catch {
                acc[key] = value;
            }
            return acc;
        }, {});

const sendJson = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.end(JSON.stringify(payload));
};

const handleApiError = (res, error, fallbackMessage = 'Request failed.') => {
    const status = Number(error?.status) || 500;
    const code = error?.code || 'server_error';
    const message = error instanceof Error ? error.message : fallbackMessage;

    if (status >= 500) {
        console.error('[Copy Trading]', code, message);
    }

    sendJson(res, status, {
        error: code,
        message,
    });
};

const assertServerConfig = () => {
    if (!getSupabaseUrl()) {
        throw new PublicError(500, 'supabase_url_missing', 'Copy Trading storage is not configured.');
    }

    if (!getSupabaseServiceRoleKey()) {
        throw new PublicError(
            500,
            'supabase_server_key_missing',
            'Copy Trading storage needs a Supabase secret or service-role key.'
        );
    }

    if (!getCredentialSecret()) {
        throw new PublicError(500, 'credential_secret_missing', 'Copy Trading credential encryption is not configured.');
    }
};

const fetchJson = async (url, options, fallbackMessage) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        const text = await response.text();
        const payload = text ? JSON.parse(text) : null;

        if (!response.ok) {
            const apiError = Array.isArray(payload?.errors) ? payload.errors[0] : payload?.error;
            const message = apiError?.message || payload?.message || fallbackMessage;
            const code = apiError?.code || payload?.code || 'upstream_error';
            const error = new PublicError(response.status, code, message);
            error.payload = payload;
            throw error;
        }

        return payload;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new PublicError(408, 'upstream_timeout', `${fallbackMessage} Request timed out.`);
        }
        if (error instanceof SyntaxError) {
            throw new PublicError(502, 'invalid_upstream_response', fallbackMessage);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

const supabaseFetch = async (path, options = {}) => {
    assertServerConfig();

    const response = await fetchJson(
        `${getSupabaseUrl()}/rest/v1/${path}`,
        {
            method: options.method || 'GET',
            headers: {
                Accept: 'application/json',
                apikey: getSupabaseServiceRoleKey(),
                Authorization: `Bearer ${getSupabaseServiceRoleKey()}`,
                'Content-Type': 'application/json',
                ...(options.prefer ? { Prefer: options.prefer } : {}),
                ...(options.headers || {}),
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        },
        'Supabase request failed.'
    );

    return response;
};

const getEncryptionKey = () => crypto.createHash('sha256').update(getCredentialSecret()).digest();

const encryptCredential = credential => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    cipher.setAAD(Buffer.from('profitdock-copy-trading-v1'));
    const ciphertext = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        token_ciphertext: ciphertext.toString('base64'),
        token_iv: iv.toString('base64'),
        token_tag: tag.toString('base64'),
    };
};

const decryptCredential = secretRow => {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getEncryptionKey(),
        Buffer.from(secretRow.token_iv, 'base64')
    );
    decipher.setAAD(Buffer.from('profitdock-copy-trading-v1'));
    decipher.setAuthTag(Buffer.from(secretRow.token_tag, 'base64'));

    return Buffer.concat([
        decipher.update(Buffer.from(secretRow.token_ciphertext, 'base64')),
        decipher.final(),
    ]).toString('utf8');
};

const getDerivAccountDisplayName = (account, fallbackAccountId) => {
    const profileName = [account?.first_name, account?.last_name]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join(' ');
    const nestedOwnerName = [account?.owner?.first_name, account?.owner?.last_name]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join(' ');
    const nestedUserName = [account?.user?.first_name, account?.user?.last_name]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join(' ');

    return String(
        account?.display_name ||
            account?.fullname ||
            account?.full_name ||
            profileName ||
            account?.name ||
            account?.owner?.name ||
            account?.owner?.fullname ||
            nestedOwnerName ||
            account?.user?.name ||
            account?.user?.fullname ||
            nestedUserName ||
            account?.email ||
            fallbackAccountId
    ).trim();
};

const normalizeOptionsAccount = account => {
    const derivAccountId = String(account?.account_id || account?.id || account?.loginid || '').trim();
    if (!derivAccountId) return null;

    const accountTypeRaw = String(account?.account_type || account?.type || '').toLowerCase();
    const isDemo =
        accountTypeRaw === 'demo' ||
        accountTypeRaw === 'virtual' ||
        derivAccountId.startsWith('VRTC') ||
        derivAccountId.startsWith('VR') ||
        derivAccountId.startsWith('DOTD');
    const accountType = isDemo ? 'demo' : 'real';

    return {
        deriv_account_id: derivAccountId,
        account_name: getDerivAccountDisplayName(account, derivAccountId),
        account_type: accountType,
        currency: String(account?.currency || ''),
        balance: Number(account?.balance ?? 0),
        connection_status: String(account?.status || 'connected') === 'active' ? 'connected' : 'connected',
    };
};

const loadDerivOptionsAccounts = async token => {
    const payload = await fetchJson(
        DERIV_OPTIONS_ACCOUNTS_URL,
        {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                'Deriv-App-ID': DERIV_CLIENT_ID,
            },
            method: 'GET',
        },
        'Deriv account validation failed.'
    );

    const accounts = (Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [])
        .map(normalizeOptionsAccount)
        .filter(Boolean);

    if (!accounts.length) {
        throw new PublicError(401, 'deriv_account_not_found', 'No Deriv account was found for that credential.');
    }

    return accounts;
};

const getBearerAccessToken = req => {
    const authorizationHeader = String(req.headers.authorization || '').trim();
    const bearerMatch = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    return bearerMatch?.[1]?.trim() || '';
};

const getSessionAccessToken = req =>
    parseCookies(req.headers.cookie).profitdock_access_token || getBearerAccessToken(req) || '';

const resolveOwner = async req => {
    const sessionToken = getSessionAccessToken(req);

    if (!sessionToken) {
        throw new PublicError(401, 'login_required', 'Log in to ProfitDock before managing Copy Trading accounts.');
    }

    // Prefer the loginid supplied directly by the authenticated client — this avoids
    // calling the Deriv Options API with a legacy Deriv token (which is not a valid
    // OAuth JWT bearer token and causes 400/401 errors from that endpoint).
    const headerLoginid = String(req.headers['x-deriv-loginid'] || '').trim();
    if (headerLoginid && /^[A-Z]{2,6}\d+$/i.test(headerLoginid)) {
        return {
            owner_deriv_account_id: headerLoginid.toUpperCase(),
            owner_accounts: [],
            session_access_token: sessionToken,
        };
    }

    // Fallback: try the Deriv Options API (works when authToken is a real OAuth JWT)
    try {
        const accounts = await loadDerivOptionsAccounts(sessionToken);
        const ownerAccount = accounts.find(account => account.account_type === 'real') || accounts[0];

        return {
            owner_deriv_account_id: ownerAccount.deriv_account_id,
            owner_accounts: accounts,
            session_access_token: sessionToken,
        };
    } catch (err) {
        // If the Options API rejects the token (legacy API key), we have no owner to identify
        const status = Number(err?.status) || 0;
        if (status === 400 || status === 401 || status === 403) {
            throw new PublicError(
                401,
                'login_required',
                'Your session could not be verified. Please log out and log back in to use Copy Trading.'
            );
        }
        throw err;
    }
};

const sanitizeAccount = account => ({
    id: account.id,
    deriv_account_id: account.deriv_account_id,
    account_name: account.account_name,
    account_type: account.account_type,
    currency: account.currency,
    balance: Number(account.balance ?? 0),
    copy_trading_enabled: Boolean(account.copy_trading_enabled),
    connection_status: account.connection_status,
    created_at: account.created_at,
    updated_at: account.updated_at,
});

const listConnectedAccounts = async ownerDerivAccountId => {
    const owner = encodeURIComponent(ownerDerivAccountId);
    const rows = await supabaseFetch(
        `copy_trading_accounts?owner_deriv_account_id=eq.${owner}&deleted_at=is.null&account_type=eq.real&order=created_at.desc`
    );

    const rawRows = Array.isArray(rows) ? rows : [];

    // Refresh live balances from Deriv in parallel; fall back to stored balance on any error
    const refreshed = await Promise.all(
        rawRows.map(async rawRow => {
            try {
                const secretRows = await supabaseFetch(
                    `copy_trading_account_secrets?id=eq.${encodeURIComponent(rawRow.credential_secret_id)}&owner_deriv_account_id=eq.${encodeURIComponent(ownerDerivAccountId)}&deriv_account_id=eq.${encodeURIComponent(rawRow.deriv_account_id)}&limit=1`
                );
                const secret = Array.isArray(secretRows) ? secretRows[0] : null;
                if (!secret) return sanitizeAccount(rawRow);

                const token = decryptCredential(secret);
                const derivAccounts = await loadDerivOptionsAccounts(token);
                const match = derivAccounts.find(a => a.deriv_account_id === rawRow.deriv_account_id);
                if (!match) return sanitizeAccount(rawRow);

                const freshBalance = Number(match.balance);
                if (Number(rawRow.balance ?? 0) !== freshBalance) {
                    // Persist updated balance in background
                    supabaseFetch(`copy_trading_accounts?id=eq.${encodeURIComponent(rawRow.id)}`, {
                        method: 'PATCH',
                        prefer: 'return=minimal',
                        body: { balance: freshBalance, updated_at: new Date().toISOString() },
                    }).catch(() => {});
                }

                return sanitizeAccount({ ...rawRow, balance: freshBalance });
            } catch {
                return sanitizeAccount(rawRow);
            }
        })
    );

    return refreshed;
};

const upsertSecret = async ({ ownerDerivAccountId, account, credential }) => {
    const encrypted = encryptCredential(credential);
    const rows = await supabaseFetch('copy_trading_account_secrets?on_conflict=owner_deriv_account_id,deriv_account_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
            owner_deriv_account_id: ownerDerivAccountId,
            deriv_account_id: account.deriv_account_id,
            ...encrypted,
            updated_at: new Date().toISOString(),
        },
    });

    const secret = Array.isArray(rows) ? rows[0] : null;
    if (!secret?.id) {
        throw new PublicError(500, 'secret_storage_failed', 'Copy Trading credential storage failed.');
    }

    return secret.id;
};

const connectCredentialAccounts = async ({ ownerDerivAccountId, credential }) => {
    const derivAccounts = (await loadDerivOptionsAccounts(credential)).filter(account => account.account_type === 'real');

    if (!derivAccounts.length) {
        throw new PublicError(422, 'real_account_required', 'That token does not expose a real Deriv account for Copy Trading.');
    }

    const existingAccounts = await listConnectedAccounts(ownerDerivAccountId);
    const existingDerivIds = new Set(existingAccounts.map(account => account.deriv_account_id));
    const newAccountCount = derivAccounts.filter(account => !existingDerivIds.has(account.deriv_account_id)).length;

    if (existingAccounts.length + newAccountCount > MAX_CONNECTED_ACCOUNTS) {
        throw new PublicError(422, 'connected_account_limit_reached', 'You can connect up to 20 Deriv accounts.');
    }

    const storedAccounts = [];

    for (const account of derivAccounts) {
        const secretId = await upsertSecret({
            ownerDerivAccountId,
            account,
            credential,
        });
        const rows = await supabaseFetch('copy_trading_accounts?on_conflict=owner_deriv_account_id,deriv_account_id', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: {
                owner_deriv_account_id: ownerDerivAccountId,
                deriv_account_id: account.deriv_account_id,
                account_name: account.account_name,
                account_type: account.account_type,
                currency: account.currency,
                balance: account.balance,
                connection_status: 'connected',
                copy_trading_enabled: false,
                credential_secret_id: secretId,
                deleted_at: null,
                updated_at: new Date().toISOString(),
            },
        });

        const stored = Array.isArray(rows) ? rows[0] : null;
        if (stored) storedAccounts.push(sanitizeAccount(stored));
    }

    return storedAccounts;
};

const getOwnedAccount = async ({ ownerDerivAccountId, accountId }) => {
    const rows = await supabaseFetch(
        `copy_trading_accounts?id=eq.${encodeURIComponent(accountId)}&owner_deriv_account_id=eq.${encodeURIComponent(
            ownerDerivAccountId
        )}&deleted_at=is.null&limit=1`
    );

    const account = Array.isArray(rows) ? rows[0] : null;
    if (!account) {
        throw new PublicError(404, 'account_not_found', 'Connected Deriv account was not found.');
    }

    return account;
};

const getSecretForAccount = async ({ ownerDerivAccountId, account }) => {
    const rows = await supabaseFetch(
        `copy_trading_account_secrets?id=eq.${encodeURIComponent(
            account.credential_secret_id
        )}&owner_deriv_account_id=eq.${encodeURIComponent(ownerDerivAccountId)}&deriv_account_id=eq.${encodeURIComponent(
            account.deriv_account_id
        )}&limit=1`
    );

    const secret = Array.isArray(rows) ? rows[0] : null;
    if (!secret) {
        throw new PublicError(404, 'credential_not_found', 'Stored Deriv credential was not found.');
    }

    return secret;
};

const updateAccount = async ({ ownerDerivAccountId, accountId, updates }) => {
    const account = await getOwnedAccount({ ownerDerivAccountId, accountId });

    if (updates.copy_trading_enabled === true && account.account_type !== 'real') {
        throw new PublicError(422, 'demo_recipient_blocked', 'Demo accounts can connect, but only real accounts can receive copied trades.');
    }

    if (updates.copy_trading_enabled === true && account.connection_status !== 'connected') {
        throw new PublicError(422, 'account_not_connected', 'Reconnect this Deriv account before enabling Copy Trading.');
    }

    const rows = await supabaseFetch(
        `copy_trading_accounts?id=eq.${encodeURIComponent(accountId)}&owner_deriv_account_id=eq.${encodeURIComponent(
            ownerDerivAccountId
        )}&deleted_at=is.null`,
        {
            method: 'PATCH',
            prefer: 'return=representation',
            body: {
                ...updates,
                updated_at: new Date().toISOString(),
            },
        }
    );

    return sanitizeAccount(Array.isArray(rows) ? rows[0] : account);
};

const refreshAccount = async ({ ownerDerivAccountId, accountId }) => {
    const account = await getOwnedAccount({ ownerDerivAccountId, accountId });
    const secret = await getSecretForAccount({ ownerDerivAccountId, account });
    const credential = decryptCredential(secret);

    try {
        const derivAccounts = await loadDerivOptionsAccounts(credential);
        const refreshed =
            derivAccounts.find(item => item.deriv_account_id === account.deriv_account_id) || derivAccounts[0];

        return updateAccount({
            ownerDerivAccountId,
            accountId,
            updates: {
                account_name: refreshed.account_name,
                account_type: refreshed.account_type,
                balance: refreshed.balance,
                connection_status: 'connected',
                currency: refreshed.currency,
                copy_trading_enabled: account.copy_trading_enabled && refreshed.account_type === 'real',
            },
        });
    } catch (error) {
        await updateAccount({
            ownerDerivAccountId,
            accountId,
            updates: {
                connection_status: 'authentication_expired',
                copy_trading_enabled: false,
            },
        });
        throw error;
    }
};

const disconnectAccount = async ({ ownerDerivAccountId, accountId }) => {
    const account = await getOwnedAccount({ ownerDerivAccountId, accountId });

    await supabaseFetch(
        `copy_trading_accounts?id=eq.${encodeURIComponent(accountId)}&owner_deriv_account_id=eq.${encodeURIComponent(
            ownerDerivAccountId
        )}`,
        {
            method: 'DELETE',
            prefer: 'return=minimal',
        }
    );

    if (account.credential_secret_id) {
        await supabaseFetch(
            `copy_trading_account_secrets?id=eq.${encodeURIComponent(
                account.credential_secret_id
            )}&owner_deriv_account_id=eq.${encodeURIComponent(ownerDerivAccountId)}`,
            {
                method: 'DELETE',
                prefer: 'return=minimal',
            }
        ).catch(error => {
            console.error('[Copy Trading] Credential delete failed for account', account.deriv_account_id, error?.message || error);
        });
    }
};

const listEligibleRealRecipients = async ownerDerivAccountId => {
    const rows = await supabaseFetch(
        `copy_trading_accounts?owner_deriv_account_id=eq.${encodeURIComponent(
            ownerDerivAccountId
        )}&deleted_at=is.null&connection_status=eq.connected&copy_trading_enabled=eq.true&account_type=eq.real`
    );

    return Array.isArray(rows) ? rows : [];
};

const buildRecipientTokenPairs = async ({ ownerDerivAccountId, recipients }) => {
    const pairs = [];
    const expiredAccountIds = [];

    for (const account of recipients) {
        try {
            const secret = await getSecretForAccount({ ownerDerivAccountId, account });
            pairs.push({
                account_id: account.deriv_account_id,
                token: decryptCredential(secret),
            });
        } catch (error) {
            expiredAccountIds.push(account.id);
            console.error('[Copy Trading] Recipient credential unavailable for account', account.deriv_account_id, error?.message || error);
        }
    }

    await Promise.all(
        expiredAccountIds.map(accountId =>
            updateAccount({
                ownerDerivAccountId,
                accountId,
                updates: {
                    connection_status: 'authentication_expired',
                    copy_trading_enabled: false,
                },
            }).catch(() => undefined)
        )
    );

    return pairs;
};

const normalizeBulkPurchaseContractParameters = (contractParameters, mode = 'symbol') => {
    const normalized = {
        ...contractParameters,
    };

    const symbol = String(normalized.symbol || normalized.underlying_symbol || '').trim();
    if (symbol) {
        if (mode === 'underlying_symbol') {
            normalized.underlying_symbol = symbol;
            delete normalized.symbol;
        } else {
            normalized.symbol = symbol;
            delete normalized.underlying_symbol;
        }
    }

    return normalized;
};

const getBulkPurchaseTransactions = payload => {
    const transactions =
        payload?.data?.transactions ||
        payload?.transactions ||
        payload?.result?.data?.transactions ||
        payload?.result?.transactions ||
        [];

    return Array.isArray(transactions) ? transactions : [];
};

const hasBulkPurchaseSuccess = transaction =>
    Boolean(
        transaction?.contract_id ||
            transaction?.buy?.contract_id ||
            transaction?.buy?.id ||
            transaction?.contract?.contract_id ||
            transaction?.transaction?.contract_id
    ) && !transaction?.error;

const shouldRetryBulkPurchaseWithAlternateSymbol = payload => {
    const transactions = getBulkPurchaseTransactions(payload);
    if (!transactions.length) return false;

    return transactions.every(transaction => !hasBulkPurchaseSuccess(transaction));
};

const executeBulkPurchase = async ({ ownerDerivAccountId, contractParameters, sourceAccountType = 'real' }) => {
    const sourceType = String(sourceAccountType || 'real').toLowerCase();
    if (!['real', 'demo', 'virtual'].includes(sourceType)) {
        throw new PublicError(400, 'invalid_source_account_type', 'Source account type must be real, demo, or virtual.');
    }

    if (!contractParameters || typeof contractParameters !== 'object' || Array.isArray(contractParameters)) {
        throw new PublicError(400, 'missing_contract_parameters', 'Missing copied trade contract parameters.');
    }

    const recipients = await listEligibleRealRecipients(ownerDerivAccountId);
    if (!recipients.length) {
        return {
            skipped: true,
            transactions: [],
            message: 'No eligible real Copy Trading recipients are enabled.',
        };
    }

    const accounts = await buildRecipientTokenPairs({ ownerDerivAccountId, recipients });
    if (!accounts.length) {
        throw new PublicError(400, 'no_eligible_recipients', 'No eligible recipient credentials are available.');
    }

    const primaryContractParameters = normalizeBulkPurchaseContractParameters(contractParameters, 'symbol');
    const fallbackContractParameters = normalizeBulkPurchaseContractParameters(contractParameters, 'underlying_symbol');
    const hasAlternateSymbolPayload =
        JSON.stringify(primaryContractParameters) !== JSON.stringify(fallbackContractParameters);

    const requestBulkPurchase = normalizedContractParameters =>
        fetchJson(
            DERIV_BULK_PURCHASE_URL,
            {
                body: JSON.stringify({
                    contract_parameters: normalizedContractParameters,
                    accounts,
                }),
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'Deriv-App-ID': DERIV_CLIENT_ID,
                },
                method: 'POST',
            },
            'Deriv bulk purchase failed.'
        );

    try {
        const result = await requestBulkPurchase(primaryContractParameters);

        if (hasAlternateSymbolPayload && shouldRetryBulkPurchaseWithAlternateSymbol(result)) {
            const retryResult = await requestBulkPurchase(fallbackContractParameters);
            return {
                ...retryResult,
                meta: {
                    ...(retryResult?.meta || {}),
                    symbol_payload_retry: true,
                },
            };
        }

        return result;
    } catch (error) {
        if (!hasAlternateSymbolPayload) {
            throw error;
        }

        const retryResult = await requestBulkPurchase(fallbackContractParameters);
        return {
            ...retryResult,
            meta: {
                ...(retryResult?.meta || {}),
                symbol_payload_retry: true,
            },
        };
    }
};

module.exports = {
    MAX_CONNECTED_ACCOUNTS,
    PublicError,
    connectCredentialAccounts,
    disconnectAccount,
    executeBulkPurchase,
    handleApiError,
    listConnectedAccounts,
    normalizeBulkPurchaseContractParameters,
    readJsonBody,
    refreshAccount,
    resolveOwner,
    sendJson,
    updateAccount,
};


