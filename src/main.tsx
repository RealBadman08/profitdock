import ReactDOM from 'react-dom/client';
import { ensureCustomDomainAppId } from './components/shared/utils/config/config';
import { AuthWrapper } from './app/AuthWrapper';
import { AnalyticsInitializer } from './utils/analytics';
import { registerPWA } from './utils/pwa-utils';
import './styles/index.scss';

const redirectToCanonicalProfitdockHost = () => {
    if (window.location.hostname !== 'www.profitdock.site') {
        return false;
    }

    const canonical_url = new URL(window.location.href);
    canonical_url.hostname = 'profitdock.site';
    window.location.replace(canonical_url.toString());

    return true;
};

if (!redirectToCanonicalProfitdockHost()) {
    ensureCustomDomainAppId();
    AnalyticsInitializer();
    registerPWA()
        .then(registration => {
            if (registration) {
                console.log('PWA service worker registered successfully for Chrome');
            } else {
                console.log('PWA service worker disabled for non-Chrome browser');
            }
        })
        .catch(error => {
            console.error('PWA service worker registration failed:', error);
        });

    ReactDOM.createRoot(document.getElementById('root')!).render(<AuthWrapper />);
}
