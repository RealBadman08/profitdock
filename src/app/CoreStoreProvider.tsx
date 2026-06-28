import { useCallback, useEffect, useMemo, useRef } from 'react';
import Cookies from 'js-cookie';
import { observer } from 'mobx-react-lite';
import { getDecimalPlaces, toMoment } from '@/components/shared';
import { FORM_ERROR_MESSAGES } from '@/components/shared/constants/form-error-messages';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { initFormErrorMessages } from '@/components/shared/utils/validation/declarative-validation-rules';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import useTMB from '@/hooks/useTMB';
import { TLandingCompany, TSocketResponseData } from '@/types/api-types';
import { useTranslations } from '@deriv-com/translations';
import {
    getStoredProfitdockActiveCurrency,
    getStoredProfitdockActiveAccount,
    getStoredProfitdockAccounts,
    hasUsableProfitdockStoredSession,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';

type TClientInformation = {
    loginid?: string;
    email?: string;
    currency?: string;
    residence?: string | null;
    first_name?: string;
    last_name?: string;
    preferred_language?: string | null;
    user_id?: number | string;
    landing_company_shortcode?: string;
};
const CoreStoreProvider: React.FC<{ children: React.ReactNode }> = observer(({ children }) => {
    const currentDomain = useMemo(() => '.' + window.location.hostname.split('.').slice(-2).join('.'), []);
    const { isAuthorizing, isAuthorized, connectionStatus, accountList, activeLoginid } = useApiBase();

    const appInitialization = useRef(false);
    const accountInitialization = useRef(false);
    const timeInterval = useRef<NodeJS.Timeout | null>(null);
    const msg_listener = useRef<{ unsubscribe: () => void } | null>(null);
    const { client, common } = useStore() ?? {};

    const { currentLang } = useTranslations();

    const { oAuthLogout } = useOauth2({ handleLogout: async () => client.logout(), client });
    const auth_recovery_in_flight = useRef(false);

    const { is_tmb_enabled: tmb_enabled_from_hook } = useTMB();

    const is_tmb_enabled = useMemo(
        () => window.is_tmb_enabled === true || tmb_enabled_from_hook,
        [tmb_enabled_from_hook]
    );

    const isLoggedOutCookie = Cookies.get('logged_state') === 'false' && !is_tmb_enabled;

    useEffect(() => {
        if (isLoggedOutCookie && client?.is_logged_in) {
            oAuthLogout();
        }
    }, [isLoggedOutCookie, oAuthLogout, client?.is_logged_in]);

    const storedProfitdockAccounts = useMemo(
        () => (isCustomLegacyOAuthDomain() ? getStoredProfitdockAccounts() : []),
        [activeLoginid, accountList, isAuthorized, isAuthorizing]
    );
    const effectiveAccountList = useMemo(
        () => (accountList?.length ? accountList : storedProfitdockAccounts),
        [accountList, storedProfitdockAccounts]
    );
    const effectiveLoginid = useMemo(() => {
        if (activeLoginid) {
            return activeLoginid;
        }

        return getStoredProfitdockActiveAccount()?.loginid || effectiveAccountList?.[0]?.loginid || '';
    }, [activeLoginid, effectiveAccountList]);
    const activeAccount = useMemo(
        () =>
            effectiveAccountList?.find(account => account.loginid === effectiveLoginid) ||
            getStoredProfitdockActiveAccount() ||
            null,
        [effectiveAccountList, effectiveLoginid]
    );
    const hasProfitdockOAuthSession = useMemo(() => {
        if (!isCustomLegacyOAuthDomain()) {
            return false;
        }

        return hasUsableProfitdockStoredSession();
    }, [activeLoginid, accountList, isAuthorized, isAuthorizing]);

    useEffect(() => {
        const currentBalanceData = client?.all_accounts_balance?.accounts?.[activeAccount?.loginid ?? ''];
        if (currentBalanceData) {
            client?.setBalance(currentBalanceData.balance.toFixed(getDecimalPlaces(currentBalanceData.currency)));
            client?.setCurrency(currentBalanceData.currency);
        } else if (
            activeAccount?.balance !== undefined &&
            activeAccount?.balance !== null &&
            activeAccount?.currency &&
            Number.isFinite(Number(activeAccount.balance))
        ) {
            client?.setBalance(Number(activeAccount.balance).toFixed(getDecimalPlaces(activeAccount.currency)));
            client?.setCurrency(activeAccount.currency);
        } else if (activeAccount?.currency) {
            client?.setCurrency(activeAccount.currency);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAccount?.loginid, client?.all_accounts_balance]);

    useEffect(() => {
        if (!isAuthorized) {
            accountInitialization.current = false;
        }
    }, [isAuthorized, activeLoginid]);

    useEffect(() => {
        if (!client) {
            return;
        }

        const resolved_active_account = activeAccount || effectiveAccountList?.[0] || null;
        const resolved_loginid = effectiveLoginid || resolved_active_account?.loginid || '';
        const resolved_currency =
            resolved_active_account?.currency || getStoredProfitdockActiveCurrency() || client.currency;
        const has_live_profitdock_session = isCustomLegacyOAuthDomain()
            ? !!resolved_active_account &&
              (isAuthorized || api_base.is_authorized || api_base.has_authenticated_profitdock_socket)
            : !!resolved_active_account && (isAuthorized || isAuthorizing);

        client.setAccountList(effectiveAccountList);

        if (resolved_active_account) {
            client.setLoginId(resolved_loginid);
            client.setCurrency(resolved_currency);
        }

        if (resolved_active_account && has_live_profitdock_session) {
            client.setIsLoggedIn(true);
            return;
        }

        client.setIsLoggedIn(false);
    }, [
        activeAccount,
        client,
        effectiveAccountList,
        effectiveLoginid,
        hasProfitdockOAuthSession,
        isAuthorized,
        isAuthorizing,
    ]);

    useEffect(() => {
        if (
            !client ||
            !isCustomLegacyOAuthDomain() ||
            !hasProfitdockOAuthSession ||
            isAuthorizing ||
            isAuthorized ||
            api_base.is_authorized ||
            api_base.has_authenticated_profitdock_socket ||
            auth_recovery_in_flight.current
        ) {
            return;
        }

        auth_recovery_in_flight.current = true;
        api_base
            .init(true)
            .then(() => {
                client.setIsLoggedIn(Boolean(api_base.is_authorized || api_base.has_authenticated_profitdock_socket));
            })
            .catch(error => {
                console.error('[ProfitDock Auth] Stored session recovery failed:', error);
                client.setIsLoggedIn(false);
            })
            .finally(() => {
                auth_recovery_in_flight.current = false;
            });
    }, [client, effectiveLoginid, hasProfitdockOAuthSession, isAuthorized, isAuthorizing]);

    useEffect(() => {
        initFormErrorMessages(FORM_ERROR_MESSAGES());

        return () => {
            if (timeInterval.current) {
                clearInterval(timeInterval.current);
            }
        };
    }, []);

    useEffect(() => {
        if (common && currentLang) {
            common.setCurrentLanguage(currentLang);
        }
    }, [currentLang, common]);

    useEffect(() => {
        const updateServerTime = () => {
            api_base.api
                .time()
                .then((res: TSocketResponseData<'time'>) => {
                    common.setServerTime(toMoment(res.time), false);
                })
                .catch(() => {
                    common.setServerTime(toMoment(Date.now()), true);
                });
        };

        // Clear any existing interval before setting up a new one
        if (timeInterval.current) {
            clearInterval(timeInterval.current);
            timeInterval.current = null;
        }

        // Only setup the interval if the connection is open and we have access to the API
        if (client && connectionStatus === CONNECTION_STATUS.OPENED && api_base?.api) {
            if (!appInitialization.current) {
                appInitialization.current = true;
                api_base.api
                    ?.websiteStatus()
                    .then((res: TSocketResponseData<'website_status'>) => {
                        if (res?.website_status) {
                            client.setWebsiteStatus(res.website_status);
                        }
                    })
                    .catch(() => undefined);
            }

            // Initial time update
            updateServerTime();

            // Schedule updates every 10 seconds
            timeInterval.current = setInterval(updateServerTime, 10000);
        }

        // Cleanup on unmount or dependency change
        return () => {
            if (timeInterval.current) {
                clearInterval(timeInterval.current);
                timeInterval.current = null;
            }
        };
    }, [client, common, is_tmb_enabled, connectionStatus]);

    const handleMessages = useCallback(
        async (res: Record<string, unknown>) => {
            if (!res) return;
            const data = res.data as TSocketResponseData<'balance'>;
            const { msg_type, error } = data;
            if (
                error?.code === 'AuthorizationRequired' ||
                error?.code === 'InvalidToken'
            ) {
                if (isCustomLegacyOAuthDomain() && hasProfitdockOAuthSession && !auth_recovery_in_flight.current) {
                    auth_recovery_in_flight.current = true;

                    try {
                        await api_base.init(true);
                        return;
                    } catch (recovery_error) {
                        console.error('[ProfitDock Auth] Session recovery from balance stream failed:', recovery_error);
                    } finally {
                        auth_recovery_in_flight.current = false;
                    }
                }

                await oAuthLogout();
                return;
            }

            if (error?.code === 'DisabledClient') {
                await oAuthLogout();
                return;
            }

            if (msg_type === 'balance' && data && !error) {
                const balance = data.balance;
                if (balance?.accounts) {
                    client.setAllAccountsBalance(balance);
                } else if (balance?.loginid) {
                    if (!balance?.loginid) return;
                    const accounts = { ...(client?.all_accounts_balance?.accounts ?? {}) };
                    const currentLoggedInBalance = { ...accounts[balance.loginid] };
                    currentLoggedInBalance.balance = balance.balance;
                    currentLoggedInBalance.currency = balance.currency;
                    currentLoggedInBalance.loginid = balance.loginid;

                    const updatedAccounts = {
                        ...(client.all_accounts_balance ?? {}),
                        accounts: {
                            ...accounts,
                            [balance.loginid]: currentLoggedInBalance,
                        },
                    };
                    client.setAllAccountsBalance(updatedAccounts);
                }
            }
        },
        [client, hasProfitdockOAuthSession, oAuthLogout]
    );

    useEffect(() => {
        if (!isAuthorizing && client) {
            const subscription = api_base?.api?.onMessage().subscribe(handleMessages);
            msg_listener.current = { unsubscribe: subscription?.unsubscribe };
        }

        return () => {
            if (msg_listener.current) {
                msg_listener.current.unsubscribe?.();
            }
        };
    }, [connectionStatus, handleMessages, isAuthorizing, isAuthorized, client]);

    useEffect(() => {
        if (!isAuthorizing && isAuthorized && !accountInitialization.current && client) {
            if (!api_base.api) {
                return;
            }

            accountInitialization.current = true;
            api_base.api
                .getSettings()
                .then((settingRes: TSocketResponseData<'get_settings'>) => {
                    client?.setAccountSettings(settingRes.get_settings);
                    const client_information: TClientInformation = {
                        loginid: activeAccount?.loginid,
                        email: settingRes.get_settings?.email,
                        currency: client?.currency,
                        residence: settingRes.get_settings?.residence,
                        first_name: settingRes.get_settings?.first_name,
                        last_name: settingRes.get_settings?.last_name,
                        preferred_language: settingRes.get_settings?.preferred_language,
                        user_id: ((api_base.account_info as any)?.user_id as number) || activeLoginid,
                        landing_company_shortcode: activeAccount?.landing_company_name,
                    };

                    Cookies.set('client_information', JSON.stringify(client_information), {
                        domain: currentDomain,
                    });

                    return api_base.api.landingCompany({
                        landing_company: settingRes.get_settings?.country_code,
                    });
                })
                .then((res: TSocketResponseData<'landing_company'> | undefined) => {
                    if (res?.landing_company) {
                        client?.setLandingCompany(res.landing_company as unknown as TLandingCompany);
                    }
                })
                .catch(error => {
                    console.warn('[ProfitDock Auth] Account settings bootstrap skipped:', error);
                });

            api_base.api
                .getAccountStatus()
                .then((res: TSocketResponseData<'get_account_status'>) => {
                    client?.setAccountStatus(res.get_account_status);
                })
                .catch(error => {
                    console.warn('[ProfitDock Auth] Account status bootstrap skipped:', error);
                });
        }
    }, [isAuthorizing, isAuthorized, client]);

    return <>{children}</>;
});

export default CoreStoreProvider;

