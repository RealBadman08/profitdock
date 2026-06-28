const DERIV_CLIENT_ID = '339iXSWkH7NEGne7sMdQT';
const DERIV_OPTIONS_ACCOUNTS_URL = 'https://api.derivws.com/trading/v1/options/accounts';

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

const readJsonBody = req =>
    new Promise((resolve, reject) => {
        let body = '';

        req.on('data', chunk => {
            body += chunk;
            if (body.length > 32 * 1024) {
                reject(new Error('Request body too large'));
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
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });

const sendJson = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.end(JSON.stringify(payload));
};

const fetchJson = async (url, options, fallbackMessage) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            const apiError = Array.isArray(payload?.errors) ? payload.errors[0] : payload?.error;
            const error = new Error(apiError?.message || payload?.message || fallbackMessage);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            const timeoutError = new Error(`${fallbackMessage} Request timed out.`);
            timeoutError.status = 408;
            throw timeoutError;
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Allow', 'POST');
        res.end('Method Not Allowed');
        return;
    }

    try {
        const cookies = parseCookies(req.headers.cookie);
        const body = await readJsonBody(req);
        const accessToken = cookies.profitdock_access_token || body.access_token || '';
        const loginid = typeof body.loginid === 'string' ? body.loginid.trim() : '';

        if (!accessToken) {
            sendJson(res, 401, {
                error: 'missing_access_token',
                message: 'ProfitDock does not have an active Deriv trading token. Please log in again.',
            });
            return;
        }

        if (!loginid) {
            sendJson(res, 400, {
                error: 'missing_loginid',
                message: 'ProfitDock could not determine which demo account to reset.',
            });
            return;
        }

        const payload = await fetchJson(
            `${DERIV_OPTIONS_ACCOUNTS_URL}/${encodeURIComponent(loginid)}/reset-demo-balance`,
            {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                    'Deriv-App-ID': DERIV_CLIENT_ID,
                },
                method: 'POST',
            },
            'ProfitDock could not reset this Deriv demo balance.'
        );

        sendJson(res, 200, payload || { ok: true });
    } catch (error) {
        console.error('[ProfitDock Options] Demo balance reset failed:', error);
        sendJson(res, error?.status || 500, {
            error: 'demo_balance_reset_failed',
            message:
                error instanceof Error
                    ? error.message
                    : 'ProfitDock could not reset this Deriv demo balance.',
        });
    }
};
