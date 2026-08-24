const {
    connectCredentialAccounts,
    handleApiError,
    listConnectedAccounts,
    readJsonBody,
    resolveOwner,
    sendJson,
} = require('../../server/copy-trading-store.cjs');

module.exports = async (req, res) => {
    try {
        const owner = await resolveOwner(req);

        if (req.method === 'GET') {
            const accounts = await listConnectedAccounts(owner.owner_deriv_account_id);
            sendJson(res, 200, { accounts });
            return;
        }

        if (req.method === 'POST') {
            const body = await readJsonBody(req);
            const token =
                typeof body.token === 'string' && body.token.trim()
                    ? body.token.trim()
                    : body.connect_current_session
                      ? owner.session_access_token
                      : '';

            if (!token) {
                sendJson(res, 400, {
                    error: 'missing_token',
                    message: 'Enter a Deriv API token or connect the current authorized Deriv session.',
                });
                return;
            }

            const connected = await connectCredentialAccounts({
                credential: token,
                ownerDerivAccountId: owner.owner_deriv_account_id,
            });
            const accounts = await listConnectedAccounts(owner.owner_deriv_account_id);

            sendJson(res, 200, { accounts, connected });
            return;
        }

        res.statusCode = 405;
        res.setHeader('Allow', 'GET, POST');
        res.end('Method Not Allowed');
    } catch (error) {
        handleApiError(res, error, 'Copy Trading account request failed.');
    }
};
