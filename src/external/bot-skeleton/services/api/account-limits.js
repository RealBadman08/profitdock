import { api_base } from './api-base';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';

export default class AccountLimits {
    constructor(store) {
        this.updateStore(store);
    }

    updateStore(store = {}) {
        this.ws = store.ws || this.ws;
    }

    async getWs() {
        if (!api_base.api) {
            await api_base.init().catch(error => {
                console.error('[Bot Builder] Failed to initialize websocket for account limits.', error);
            });
        }

        const ws = api_base.api || this.ws;

        if (!ws?.send) {
            return null;
        }

        if (api_base.api === ws && typeof api_base.waitForSocketOpen === 'function') {
            try {
                await api_base.waitForSocketOpen(8000);
            } catch (error) {
                console.error('[Bot Builder] Account limits websocket did not open in time.', error);
                return null;
            }
        }

        return ws;
    }
    // eslint-disable-next-line default-param-last
    async getStakePayoutLimits(currency = 'AUD', landing_company_shortcode = 'svg', selected_market) {
        if (isCustomLegacyOAuthDomain()) {
            return {};
        }

        const ws = await this.getWs();

        if (!ws) {
            return {};
        }

        return ws
            .send({
                landing_company_details: landing_company_shortcode,
            })
            .catch(error => {
                console.error('[Bot Builder] Failed to fetch stake/payout limits.', error);
                return null;
            })
            .then(landing_company => {
                const currency_config = landing_company?.landing_company_details?.currency_config?.[selected_market];
                return currency_config ? currency_config[currency] || {} : {};
            });
    }
}
