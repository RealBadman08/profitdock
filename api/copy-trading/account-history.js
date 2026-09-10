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

const DERIV_CLIENT_ID = process.env.DERIV_CLIENT_ID || '339iXSWkH7NEGne7sMdQT';

// Fetch profit table via WebSocket using the OTP authentication flow
const fetchProfitTable = async (token, loginid, limit = 25) => {
    // 1. Get authenticated WebSocket URL
    let wsUrl;
    try {
        const response = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(loginid)}/otp`, {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                'Deriv-App-ID': DERIV_CLIENT_ID,
            },
            method: 'POST',
            signal: AbortSignal.timeout(10000),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || (!payload.data?.url && !payload.url)) {
            const apiError = Array.isArray(payload?.errors) ? payload.errors[0] : payload?.error;
            throw new Error(apiError?.message || payload?.message || 'Failed to start authenticated trading session.');
        }

        wsUrl = payload.data?.url || payload.url;
    } catch (err) {
        throw new Error(err.message || 'Failed to request secure WebSocket URL.');
    }

    // 2. Fetch profit table using the secure URL
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Deriv profit table request timed out.'));
        }, 15000);

        ws.onopen = () => {
            ws.send(JSON.stringify({
                profit_table: 1,
                description: 1,
                limit: limit,
                sort: 'DESC'
            }));
        };

        ws.onmessage = (msg) => {
            let data;
            try {
                data = JSON.parse(msg.data);
            } catch {
                return;
            }

            if (data.error) {
                clearTimeout(timeout);
                ws.close();
                reject(new Error(data.error.message || 'Deriv API error.'));
                return;
            }

            if (data.msg_type === 'profit_table') {
                clearTimeout(timeout);
                ws.close();
                resolve(data.profit_table);
            }
        };

        ws.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Deriv WebSocket connection failed.'));
        };
    });
};

const normalizeTransaction = raw => {
    const data = raw?.data || raw;

    let contract_type = String(data?.contract_type || data?.type || '');
    let underlying = String(data?.underlying_symbol || data?.underlying || data?.symbol || '');
    
    // Parse shortcode if type/underlying are missing (e.g. from profit_table)
    if (data?.shortcode && (!contract_type || !underlying)) {
        const parts = data.shortcode.split('_');
        if (!contract_type && parts.length > 0) contract_type = parts[0];
        if (!underlying && parts.length > 2) underlying = `${parts[1]}_${parts[2]}`;
    }

    const contract_id = String(data?.contract_id || data?.id || '');
    const entry_spot = data?.entry_spot ?? data?.entry_tick ?? null;
    const exit_spot = data?.exit_spot ?? null;
    const entry_time = data?.entry_time ?? data?.purchase_time ?? data?.date_start ?? null;
    const exit_time = data?.exit_time ?? data?.sell_time ?? data?.date_expiry ?? null;
    const buy_price = data?.buy_price ?? data?.purchase_price ?? null;
    const sell_price = data?.sell_price ?? null;
    
    // Calculate profit if missing
    let profit = data?.profit;
    if (profit === undefined || profit === null) {
        if (buy_price !== null && sell_price !== null) {
            profit = Number(sell_price) - Number(buy_price);
        } else {
            profit = null;
        }
    }

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
        const payload = await fetchProfitTable(token, account.deriv_account_id, limit);

        const rawItems =
            Array.isArray(payload?.transactions) ? payload.transactions :
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
