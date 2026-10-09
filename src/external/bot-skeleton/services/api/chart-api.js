import { getSocketAppId } from '@/components/shared';
import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';

class ChartAPI {
    api = null;
    time_interval = null;
    _init_promise = null;

    onsocketclose = () => {
        console.log('[ChartAPI] socket closed, reconnecting...');
        this._init_promise = null;
        this.init(true);
    };

    init = (force_create_connection = false) => {
        if (this._init_promise && !force_create_connection) {
            return this._init_promise;
        }
        this._init_promise = this._doInit(force_create_connection).finally(() => {
            this._init_promise = null;
        });
        return this._init_promise;
    };

    _doInit = async (force_create_connection = false) => {
        if (this.api && !force_create_connection) return;

        if (this.api?.connection) {
            this.api.connection.removeEventListener('close', this.onsocketclose);
            try { this.api.disconnect(); } catch (_) {}
        }
        this.api = null;

        if (this.time_interval) {
            clearInterval(this.time_interval);
            this.time_interval = null;
        }

        const app_id = getSocketAppId() || '1089';
        // Connect to the STANDARD Deriv WebSocket, but using the app's actual registered app_id
        // This ensures SmartChart gets the exact standard symbol names (e.g. R_100) it expects
        const socket_url = `wss://ws.derivws.com/websockets/v3?app_id=${app_id}&l=EN&brand=deriv`;
        console.log('[ChartAPI] Connecting to standard Deriv WS:', socket_url);
        
        const deriv_socket = new WebSocket(socket_url);
        this.api = new DerivAPIBasic({ connection: deriv_socket });
        this.api.connection.addEventListener('close', this.onsocketclose);

        await new Promise((resolve, reject) => {
            const conn = this.api?.connection;
            if (conn.readyState === WebSocket.OPEN) return resolve(null);

            const timeout = setTimeout(() => {
                reject(new Error('ChartAPI socket open timeout'));
            }, 15000);

            conn.addEventListener('open', () => {
                clearTimeout(timeout);
                console.log('[ChartAPI] Connected successfully');
                resolve(null);
            }, { once: true });

            conn.addEventListener('error', (e) => {
                clearTimeout(timeout);
                console.error('[ChartAPI] Socket error:', e);
                reject(e);
            }, { once: true });
        });

        this._startHeartbeat();
    };

    _startHeartbeat = () => {
        if (this.time_interval) return;
        this.time_interval = setInterval(() => {
            if (this.api?.connection?.readyState === WebSocket.OPEN) {
                this.api.send({ time: 1 }).catch(() => {});
            }
        }, 30000);
    };
}

const chart_api = new ChartAPI();
export default chart_api;
