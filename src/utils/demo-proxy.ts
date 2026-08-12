// @ts-ignore
import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';
import { getSocketURL, getSocketAppId } from '@/components/shared';
import { getInitialLanguage } from '@deriv-com/translations';
import { website_name } from '@/utils/site-config';

class DemoTradingProxy {
    private api: any = null;
    private isInitializing = false;
    private isReady = false;
    private initPromise: Promise<any> | null = null;
    private subscribers: Set<(msg: any) => void> = new Set();

    /** Eagerly kick off initialization but never throw - safe to call anytime */
    warmUp() {
        if (this.isReady || this.isInitializing) return;
        this._initApi().catch(e => console.warn('[DemoProxy] warmUp failed:', e));
    }

    private async _initApi() {
        if (this.isInitializing) {
            return this.initPromise;
        }
        this.isInitializing = true;

        try {
            const serverUrl = getSocketURL();
            const cleanedServer = typeof serverUrl === 'string' ? serverUrl.replace(/[^a-zA-Z0-9.-]/g, '') : String(serverUrl);
            const socketAppId = getSocketAppId();
            const cleanedAppId = typeof socketAppId === 'string' ? socketAppId.replace(/[^a-zA-Z0-9]/g, '') : String(socketAppId);
            const socket_url = `wss://${cleanedServer}/websockets/v3?app_id=${cleanedAppId}&l=${getInitialLanguage()}&brand=${website_name.toLowerCase()}`;

            const deriv_socket = new WebSocket(socket_url);
            const api = new DerivAPIBasic({ connection: deriv_socket });

            // Wait for socket to open (5s timeout)
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Socket timeout')), 5000);
                deriv_socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); });
                deriv_socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Socket error')); });
            });

            // Find VRTC demo token
            const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
            const demoLoginId = Object.keys(accountsList).find(id => id.startsWith('VRTC'));
            const demoToken = demoLoginId ? accountsList[demoLoginId] : null;

            if (!demoToken) {
                throw new Error('[DemoProxy] No VRTC demo token found');
            }

            const authRes = await api.authorize(demoToken);
            if (authRes?.error) {
                throw new Error(`[DemoProxy] Auth failed: ${authRes.error.message}`);
            }

            this.api = api;
            this.isReady = true;

            // Pipe all messages to subscribers
            api.onMessage().subscribe((msg: any) => {
                this.subscribers.forEach(sub => {
                    try { sub(msg); } catch { /* ignore */ }
                });
            });

            console.log('[DemoProxy] Ready — demo account authorized');
        } catch (e) {
            this.isInitializing = false;
            this.api = null;
            this.isReady = false;
            throw e;
        }
        this.isInitializing = false;
    }

    async sendRequest(request: Record<string, any>): Promise<any> {
        if (!this.isReady) {
            // Try to init; if it fails, return null so callers can fall back
            try {
                await this._initApi();
            } catch (e) {
                console.warn('[DemoProxy] sendRequest: not ready, returning null', e);
                return null;
            }
        }
        try {
            return await this.api.send(request);
        } catch (e) {
            console.warn('[DemoProxy] sendRequest error:', e);
            return null;
        }
    }

    subscribe(callback: (msg: any) => void): () => void {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    get ready() { return this.isReady; }
}

export const demoProxy = new DemoTradingProxy();
