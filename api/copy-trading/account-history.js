const {
    getOwnedAccount,
    getSecretForAccount,
    handleApiError,
    readJsonBody,
    resolveOwner,
    sendJson,
} = require('../../server/copy-trading-store.cjs');

const crypto = require('crypto');

// Re-use the same decryption logic from the store
const getCredentialSecret = () =>
    process.env.COPY_TRADING_CREDENTIAL_SECRET || process.env.PROFITDOCK_CREDENTIAL_SECRET || '';

const getEncryptionKey = () => crypto.createHash('sha256').update(getCredentialSecret()).digest();

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

const DERIV_API_BASE = 'https://api.derivws.com';
const DERIV_CLIENT_ID = process.env.DERIV_CLIENT_ID || '339iXSWkH7NEGne7sMdQT';

// Fetch profit table (closed contracts) for an account using its API token.
// Uses the Deriv REST profit_table endpoint.
const fetchProfitTable = async (token, limit = 25) => {
    const url = new URL(`${DERIV_API_BASE}/trading/v1/options/contracts`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sort', 'desc');

    const response = await fetch(url.toString(), {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'Deriv-App-ID': DERIV_CLIENT_ID,
        },
        method: 'GET',
        signal: AbortSignal.timeout(20000),
    });

    const text = await response.text();
    let payload;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        throw new Error('Invalid response from Deriv profit table API.');
    }

    if (!response.ok) {
        const msg =
            payload?.errors?.[0]?.message ||
            payload?.error?.message ||
            payload?.message ||
            'Deriv profit table request failed.';
        throw new Error(msg);
    }

    return payload;
};

const normalizeTransaction = raw => {
    const data = raw?.data || raw;

    const contract_id = String(
        data?.contract_id || data?.id || ''
    );
    const contract_type = String(data?.contract_type || data?.type || '');
    const underlying = String(
        data?.underlying_symbol || data?.underlying || data?.symbol || ''
    );
    const entry_spot = data?.entry_spot ?? data?.entry_tick ?? data?.purchase_price ?? null;
    const exit_spot = data?.exit_spot ?? data?.sell_price ?? null;
    const entry_time =
        data?.entry_time ?? data?.purchase_time ?? data?.date_start ?? null;
    const exit_time =
        data?.exit_time ?? data?.sell_time ?? data?.date_expiry ?? null;
    const buy_price = data?.buy_price ?? data?.purchase_price ?? null;
    const sell_price = data?.sell_price ?? null;
    const profit = data?.profit ?? null;
    const status = data?.status ?? (profit !== null ? (Number(profit) >= 0 ? 'won' : 'lost') : 'unknown');
    const currency = String(data?.currency || '');
    const duration = data?.duration ?? null;
    const duration_unit = String(data?.duration_unit || '');
    const barrier = data?.barrier ?? null;

    return {
        barrier,
        buy_price,
        contract_id,
        contract_type,
        currency,
        duration,
        duration_unit,
        entry_spot,
        entry_time,
        exit_spot,
        exit_time,
        profit,
        sell_price,
        status,
        underlying,
    };
};

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        res.end('Method Not Allowed');
        return;
    }

    try {
        const owner = await resolveOwner(req);

        const url = new URL(req.url, 'http://localhost');
        const accountId = url.searchParams.get('account_id') || '';
        const limit = Math.min(Number(url.searchParams.get('limit') || '25'), 50);

        if (!accountId) {
            sendJson(res, 400, {
                error: 'missing_account_id',
                message: 'Missing connected account id.',
            });
            return;
        }

        const account = await getOwnedAccount({
            ownerDerivAccountId: owner.owner_deriv_account_id,
            accountId,
        });

        const secret = await getSecretForAccount({
            ownerDerivAccountId: owner.owner_deriv_account_id,
            account,
        });

        const token = decryptCredential(secret);
        const payload = await fetchProfitTable(token, limit);

        const rawItems =
            Array.isArray(payload?.data) ? payload.data :
            Array.isArray(payload?.data?.contracts) ? payload.data.contracts :
            Array.isArray(payload?.contracts) ? payload.contracts :
            [];

        const transactions = rawItems.map(normalizeTransaction);

        sendJson(res, 200, {
            account_id: account.deriv_account_id,
            transactions,
        });
    } catch (error) {
        handleApiError(res, error, 'Failed to load transaction history.');
    }
};
