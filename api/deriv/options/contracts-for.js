const WebSocket = require('ws');

const DERIV_OPTIONS_PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';

const sendJson = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.end(JSON.stringify(payload));
};

const fetchContractsFor = symbol =>
    new Promise((resolve, reject) => {
        const socket = new WebSocket(DERIV_OPTIONS_PUBLIC_WS_URL);
        const timeout = setTimeout(() => {
            socket.terminate();
            reject(new Error('Deriv contracts_for request timed out.'));
        }, 20000);

        socket.on('open', () => {
            socket.send(
                JSON.stringify({
                    contracts_for: symbol,
                })
            );
        });

        socket.on('message', payload => {
            clearTimeout(timeout);
            socket.close();

            try {
                const response = JSON.parse(payload.toString());
                if (response?.error) {
                    const error = new Error(response.error.message || 'Deriv rejected contracts_for.');
                    error.payload = response;
                    reject(error);
                    return;
                }

                resolve(response?.contracts_for?.available || []);
            } catch (error) {
                reject(error);
            }
        });

        socket.on('error', error => {
            clearTimeout(timeout);
            reject(error);
        });
    });

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        res.end('Method Not Allowed');
        return;
    }

    const symbol = String(req.query?.symbol || '').trim();

    if (!symbol || !/^[A-Z0-9_]+$/.test(symbol)) {
        sendJson(res, 400, {
            error: 'invalid_symbol',
            message: 'A valid Deriv symbol is required.',
        });
        return;
    }

    try {
        const contracts = await fetchContractsFor(symbol);

        sendJson(res, 200, {
            contracts,
            symbol,
        });
    } catch (error) {
        console.error('[ProfitDock Options] contracts_for fallback failed:', error);
        sendJson(res, 502, {
            error: 'contracts_for_failed',
            message: error instanceof Error ? error.message : 'ProfitDock could not load Deriv contract metadata.',
        });
    }
};
