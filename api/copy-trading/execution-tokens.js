const {
    getSecretForAccount,
    decryptCredential,
    handleApiError,
    listConnectedAccounts,
    resolveOwner,
    sendJson,
} = require('../../server/copy-trading-store.cjs');

// Returns decrypted tokens for all enabled real accounts so the browser
// can call the Deriv bulk-purchase API directly — no server hop during execution.
module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        res.end('Method Not Allowed');
        return;
    }

    // Cache-Control: no-store keeps tokens out of CDN/browser caches
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    try {
        const owner = await resolveOwner(req);
        const accounts = await listConnectedAccounts(owner.owner_deriv_account_id);

        const enabledAccounts = accounts.filter(
            a => a.copy_trading_enabled && a.connection_status === 'connected' && a.account_type === 'real'
        );

        const tokenPairs = [];
        for (const account of enabledAccounts) {
            try {
                const secret = await getSecretForAccount({
                    ownerDerivAccountId: owner.owner_deriv_account_id,
                    account,
                });
                const token = decryptCredential(secret);
                tokenPairs.push({
                    account_id: account.deriv_account_id,
                    token,
                });
            } catch {
                // skip accounts with unavailable credentials
            }
        }

        sendJson(res, 200, { accounts: tokenPairs });
    } catch (error) {
        handleApiError(res, error, 'Failed to load execution tokens.');
    }
};
