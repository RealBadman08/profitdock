const DERIV_CLIENT_ID = '339iXSWkH7NEGne7sMdQT';
const DERIV_REDIRECT_URI = 'https://profitdock.site/auth/callback';
const DERIV_TOKEN_URL = 'https://auth.deriv.com/oauth2/token';
const DERIV_OPTIONS_ACCOUNTS_URL = 'https://api.derivws.com/trading/v1/options/accounts';
const COOKIE_DOMAIN = 'profitdock.site';
const TOKEN_COOKIE_MAX_AGE_SECONDS = 60 * 60;

const serializeCookie = (name, value, options = {}) => {
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
    if (options.domain) parts.push(`Domain=${options.domain}`);
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.httpOnly) parts.push('HttpOnly');
    if (options.secure) parts.push('Secure');
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);

    return parts.join('; ');
};

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
            if (body.length > 64 * 1024) {
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

const clearPkceCookies = () => {
    const expires = new Date(0);

    return [
        serializeCookie('profitdock_oauth_state', '', {
            domain: COOKIE_DOMAIN,
            expires,
            httpOnly: true,
            path: '/',
            sameSite: 'Lax',
            secure: true,
        }),
        serializeCookie('profitdock_oauth_verifier', '', {
            domain: COOKIE_DOMAIN,
            expires,
            httpOnly: true,
            path: '/',
            sameSite: 'Lax',
            secure: true,
        }),
    ];
};

const makeTokenCookie = accessToken =>
    serializeCookie('profitdock_access_token', accessToken, {
        domain: COOKIE_DOMAIN,
        httpOnly: true,
        maxAge: TOKEN_COOKIE_MAX_AGE_SECONDS,
        path: '/',
        sameSite: 'Lax',
        secure: true,
    });

const sendJson = (res, statusCode, payload, cookies = []) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (cookies.length) {
        res.setHeader('Set-Cookie', cookies);
    }
    res.end(JSON.stringify(payload));
};

const fetchJson = async (url, options, fallbackMessage) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(url, {
        ...options,
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const apiError = Array.isArray(payload?.errors) ? payload.errors[0] : payload?.error;
        const message = apiError?.message || payload?.message || fallbackMessage;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
};

const normalizeAccountsPayload = payload => {
    const rawAccounts = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
    return rawAccounts.filter(account => account && (account.account_id || account.id || account.loginid));
};

const loadOptionsAccounts = async accessToken => {
    const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Deriv-App-ID': DERIV_CLIENT_ID,
    };

    const fetchedPayload = await fetchJson(
        DERIV_OPTIONS_ACCOUNTS_URL,
        {
            headers,
            method: 'GET',
        },
        'ProfitDock could not load your Deriv Options accounts.'
    );

    let accounts = normalizeAccountsPayload(fetchedPayload);

    if (!accounts.length) {
        const createdPayload = await fetchJson(
            DERIV_OPTIONS_ACCOUNTS_URL,
            {
                body: JSON.stringify({
                    account_type: 'demo',
                    currency: 'USD',
                    group: 'row',
                }),
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                },
                method: 'POST',
            },
            'ProfitDock could not create a demo Deriv Options account.'
        );
        accounts = normalizeAccountsPayload(createdPayload);
    }

    return accounts;
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
        const code = typeof body.code === 'string' ? body.code : '';
        const state = typeof body.state === 'string' ? body.state : '';
        const directAccessToken = typeof body.access_token === 'string' ? body.access_token : '';
        const expectedState = cookies.profitdock_oauth_state || '';
        const codeVerifier = cookies.profitdock_oauth_verifier || '';

        if (!directAccessToken && (!code || !state)) {
            sendJson(res, 400, { error: 'missing_oauth_callback', message: 'Missing Deriv authorization code.' });
            return;
        }

        if (!directAccessToken && (!expectedState || !codeVerifier || state !== expectedState)) {
            sendJson(res, 400, {
                error: 'invalid_oauth_state',
                message: 'ProfitDock could not verify this Deriv sign-in. Please start login again.',
            });
            return;
        }

        let tokenPayload = { access_token: directAccessToken, token_type: 'Bearer' };

        if (!directAccessToken) {
            const tokenParams = new URLSearchParams({
                client_id: DERIV_CLIENT_ID,
                code,
                code_verifier: codeVerifier,
                grant_type: 'authorization_code',
                redirect_uri: DERIV_REDIRECT_URI,
            });

            tokenPayload = await fetchJson(
                DERIV_TOKEN_URL,
                {
                    body: tokenParams.toString(),
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    method: 'POST',
                },
                'ProfitDock could not request Deriv trading tokens.'
            );
        }

        const accessToken = tokenPayload?.access_token;

        if (!accessToken) {
            sendJson(res, 502, {
                error: 'missing_access_token',
                message: 'Deriv did not return an access token for this sign-in.',
            }, clearPkceCookies());
            return;
        }

        let accounts = [];
        let accountsError = null;

        try {
            accounts = await loadOptionsAccounts(accessToken);
        } catch (error) {
            accountsError = {
                message: error instanceof Error ? error.message : 'ProfitDock could not load your Deriv accounts.',
                status: error?.status,
            };
            console.error('[ProfitDock OAuth] Account bootstrap failed after token exchange:', accountsError);
        }

        sendJson(
            res,
            200,
            {
                access_token: accessToken,
                accounts,
                accounts_error: accountsError,
                expires_in: tokenPayload.expires_in,
                token_type: tokenPayload.token_type || 'Bearer',
            },
            [...clearPkceCookies(), makeTokenCookie(accessToken)]
        );
    } catch (error) {
        console.error('[ProfitDock OAuth] Code exchange failed:', error);
        sendJson(res, 500, {
            error: 'oauth_exchange_failed',
            message: error instanceof Error ? error.message : 'ProfitDock could not finish Deriv authorization.',
        });
    }
};
