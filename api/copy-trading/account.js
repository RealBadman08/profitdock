const {
    disconnectAccount,
    handleApiError,
    readJsonBody,
    refreshAccount,
    resolveOwner,
    sendJson,
    updateAccount,
} = require('../../server/copy-trading-store.cjs');

module.exports = async (req, res) => {
    try {
        const owner = await resolveOwner(req);
        const body = await readJsonBody(req);
        const accountId = typeof body.account_id === 'string' ? body.account_id.trim() : '';

        if (!accountId) {
            sendJson(res, 400, {
                error: 'missing_account_id',
                message: 'Missing connected account id.',
            });
            return;
        }

        if (req.method === 'PATCH') {
            if (body.action === 'refresh') {
                const account = await refreshAccount({
                    accountId,
                    ownerDerivAccountId: owner.owner_deriv_account_id,
                });
                sendJson(res, 200, { account });
                return;
            }

            const updates = {};
            if (typeof body.copy_trading_enabled === 'boolean') {
                updates.copy_trading_enabled = body.copy_trading_enabled;
            }

            if (!Object.keys(updates).length) {
                sendJson(res, 400, {
                    error: 'missing_update',
                    message: 'Choose an account setting to update.',
                });
                return;
            }

            const account = await updateAccount({
                accountId,
                ownerDerivAccountId: owner.owner_deriv_account_id,
                updates,
            });
            sendJson(res, 200, { account });
            return;
        }

        if (req.method === 'DELETE') {
            await disconnectAccount({
                accountId,
                ownerDerivAccountId: owner.owner_deriv_account_id,
            });
            sendJson(res, 200, { ok: true });
            return;
        }

        res.statusCode = 405;
        res.setHeader('Allow', 'PATCH, DELETE');
        res.end('Method Not Allowed');
    } catch (error) {
        handleApiError(res, error, 'Copy Trading account update failed.');
    }
};
