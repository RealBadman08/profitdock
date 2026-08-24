const {
    executeBulkPurchase,
    handleApiError,
    readJsonBody,
    resolveOwner,
    sendJson,
} = require('../../server/copy-trading-store.cjs');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Allow', 'POST');
        res.end('Method Not Allowed');
        return;
    }

    try {
        const owner = await resolveOwner(req);
        const body = await readJsonBody(req);
        const contractParameters = body.contract_parameters || body.parameters;

        const result = await executeBulkPurchase({
            contractParameters,
            ownerDerivAccountId: owner.owner_deriv_account_id,
            sourceAccountType: body.source_account_type || body.source_type || 'real',
        });

        sendJson(res, 200, { result });
    } catch (error) {
        handleApiError(res, error, 'Copy Trading execution failed.');
    }
};
