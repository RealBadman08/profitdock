const crypto = require('crypto');

const DERIV_CLIENT_ID = '339iXSWkH7NEGne7sMdQT';
const DERIV_REDIRECT_URI = 'https://profitdock.site/auth/callback';
const DERIV_SCOPE = 'trade account_manage application_read';
const DERIV_AUTHORIZE_URL = 'https://auth.deriv.com/oauth2/auth';
const COOKIE_DOMAIN = 'profitdock.site';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

const base64Url = input =>
    Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

const createVerifier = () => base64Url(crypto.randomBytes(64));
const createState = () => base64Url(crypto.randomBytes(32));
const createChallenge = verifier => base64Url(crypto.createHash('sha256').update(verifier).digest());

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

const makeOAuthCookies = ({ state, verifier }) => [
    serializeCookie('profitdock_oauth_state', state, {
        domain: COOKIE_DOMAIN,
        httpOnly: true,
        maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
        path: '/',
        sameSite: 'Lax',
        secure: true,
    }),
    serializeCookie('profitdock_oauth_verifier', verifier, {
        domain: COOKIE_DOMAIN,
        httpOnly: true,
        maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
        path: '/',
        sameSite: 'Lax',
        secure: true,
    }),
];

module.exports = (req, res) => {
    if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        res.end('Method Not Allowed');
        return;
    }

    const prompt = req.query?.prompt === 'registration' ? 'registration' : '';
    const verifier = createVerifier();
    const state = createState();
    const authorize_url = new URL(DERIV_AUTHORIZE_URL);

    authorize_url.searchParams.set('response_type', 'code');
    authorize_url.searchParams.set('client_id', DERIV_CLIENT_ID);
    authorize_url.searchParams.set('redirect_uri', DERIV_REDIRECT_URI);
    authorize_url.searchParams.set('scope', DERIV_SCOPE);
    authorize_url.searchParams.set('state', state);
    authorize_url.searchParams.set('code_challenge', createChallenge(verifier));
    authorize_url.searchParams.set('code_challenge_method', 'S256');

    if (prompt) {
        authorize_url.searchParams.set('prompt', prompt);
    }

    res.statusCode = 302;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Set-Cookie', makeOAuthCookies({ state, verifier }));
    res.setHeader('Location', authorize_url.toString());
    res.end();
};
