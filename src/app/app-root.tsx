import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ErrorBoundary from '@/components/error-component/error-boundary';
import ErrorComponent from '@/components/error-component/error-component';
import ChunkLoader from '@/components/loader/chunk-loader';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { hasUsableProfitdockStoredSession } from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { useStore } from '@/hooks/useStore';
import useTMB from '@/hooks/useTMB';
import { localize } from '@deriv-com/translations';
import './app-root.scss';
import AppContent from './app-content';

const AppRootLoader = () => {
    return <ChunkLoader message={localize('Loading...')} />;
};

const ErrorComponentWrapper = observer(() => {
    const { common } = useStore();

    if (!common.error) return null;

    return (
        <ErrorComponent
            header={common.error?.header}
            message={common.error?.message}
            redirect_label={common.error?.redirect_label}
            redirectOnClick={common.error?.redirectOnClick}
            should_clear_error_on_click={common.error?.should_clear_error_on_click}
            setError={common.setError}
            redirect_to={common.error?.redirect_to}
            should_redirect={common.error?.should_redirect}
        />
    );
});

const AppRoot = () => {
    const store = useStore();
    const is_profitdock_domain = window.location.hostname.includes('profitdock.site');
    const has_profitdock_auth_session = is_profitdock_domain && hasUsableProfitdockStoredSession();
    const api_base_initialized = useRef(false);
    const [is_api_initialized, setIsApiInitialized] = useState(false);
    const [is_tmb_check_complete, setIsTmbCheckComplete] = useState(has_profitdock_auth_session);
    const [, setIsTmbEnabled] = useState(false);
    const { isTmbEnabled } = useTMB();

    useEffect(() => {
        if (!has_profitdock_auth_session) {
            return;
        }

        setIsTmbCheckComplete(true);
    }, [has_profitdock_auth_session]);

    // Effect to check TMB status - independent of API initialization
    useEffect(() => {
        let is_mounted = true;

        const checkTmbStatus = async () => {
            try {
                let timeout_id: ReturnType<typeof window.setTimeout> | undefined;
                const timeout = new Promise<boolean>(resolve => {
                    timeout_id = window.setTimeout(() => {
                        console.warn('[AppRoot] TMB status check timed out. Continuing with TMB disabled.');
                        resolve(false);
                    }, is_profitdock_domain ? 1200 : 2500);
                });

                const tmb_status = await Promise.race([isTmbEnabled(), timeout]);
                if (timeout_id) {
                    window.clearTimeout(timeout_id);
                }
                if (!is_mounted) return;

                const final_status = tmb_status || window.is_tmb_enabled === true;

                setIsTmbEnabled(final_status);

                setIsTmbCheckComplete(true);
            } catch (error) {
                console.error('TMB check failed:', error);
                if (!is_mounted) return;
                setIsTmbCheckComplete(true);
            }
        };

        checkTmbStatus();

        return () => {
            is_mounted = false;
        };
    }, []);

    // Initialize API when TMB check is complete
    useEffect(() => {
        if (!is_tmb_check_complete) {
            return; // Wait until TMB check is complete
        }

        const initializeApi = async () => {
            if (!api_base_initialized.current) {
                try {
                    let timeout_id: ReturnType<typeof window.setTimeout> | undefined;
                    const timeout = new Promise(resolve => {
                        timeout_id = window.setTimeout(() => {
                            console.warn('[AppRoot] API bootstrap timed out. Revealing app shell.');
                            resolve(null);
                        }, is_profitdock_domain ? 10000 : 6000);
                    });

                    await Promise.race([api_base.init(), timeout]);
                    if (timeout_id) {
                        window.clearTimeout(timeout_id);
                    }
                    api_base_initialized.current = true;
                } catch (error) {
                    console.error('API initialization failed:', error);
                    api_base_initialized.current = false;
                } finally {
                    setIsApiInitialized(true);
                }
            }
        };

        initializeApi();
    }, [is_tmb_check_complete]);

    if (!store || !is_api_initialized) return <AppRootLoader />;

    return (
        <ErrorBoundary root_store={store}>
            <ErrorComponentWrapper />
            <AppContent />
        </ErrorBoundary>
    );
};

export default AppRoot;

