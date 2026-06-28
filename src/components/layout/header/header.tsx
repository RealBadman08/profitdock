import { useCallback } from 'react';
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import PWAInstallButton from '@/components/pwa-install-button';
import { generateOAuthURL, redirectToSignUp, standalone_routes } from '@/components/shared';
import {
    ensureCustomDomainAppId,
    getCustomLegacyOAuthAuthorizeUrl,
    isCustomLegacyOAuthDomain,
    isProfitdockDomainHost,
} from '@/components/shared/utils/config/config';
import { getRedirectCallbackUri } from '@/components/shared/utils/login/login';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import {
    getStoredProfitdockActiveAccount,
    hasUsableProfitdockStoredSession,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import Button from '@/components/shared_ui/button';
import useActiveAccount from '@/hooks/api/account/useActiveAccount';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import { useFirebaseCountriesConfig } from '@/hooks/firebase/useFirebaseCountriesConfig';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import useTMB from '@/hooks/useTMB';
import { clearAuthData, handleOidcAuthFailure } from '@/utils/auth-utils';
import { StandaloneCircleUserRegularIcon } from '@deriv/quill-icons/Standalone';
import { requestOidcAuthentication } from '@deriv-com/auth-client';
import { Localize, useTranslations } from '@deriv-com/translations';
import { Header, useDevice, Wrapper } from '@deriv-com/ui';
import { Tooltip } from '@deriv-com/ui';
import { AppLogo } from '../app-logo';
import AccountsInfoLoader from './account-info-loader';
import AccountSwitcher from './account-switcher';
import MenuItems from './menu-items';
import MobileMenu from './mobile-menu';
import PlatformSwitcher from './platform-switcher';
import './header.scss';

type TAppHeaderProps = {
    isAuthenticating?: boolean;
};

const redirectToProfitdockOAuth = (prompt?: 'registration') => {
    ensureCustomDomainAppId();
    sessionStorage.setItem('redirect_url', window.location.href);
    localStorage.setItem('config.post_login_redirect_uri', window.location.href);
    sessionStorage.removeItem('profitdock.oauth_scope_fallback_done');
    window.location.assign(getCustomLegacyOAuthAuthorizeUrl({ prompt }));
};

const AppHeader = observer(({ isAuthenticating }: TAppHeaderProps) => {
    const { isDesktop } = useDevice();
    const { isAuthorizing, isAuthorized, activeLoginid } = useApiBase();
    const { client } = useStore() ?? {};
    const is_profitdock_domain = isProfitdockDomainHost();
    const has_profitdock_stored_session = is_profitdock_domain && hasUsableProfitdockStoredSession();
    const stored_active_account = has_profitdock_stored_session ? getStoredProfitdockActiveAccount() : null;
    const stored_loginid = stored_active_account?.loginid || '';
    const effective_loginid = activeLoginid || stored_loginid;
    const has_live_trading_session =
        isAuthorized || api_base.is_authorized || api_base.has_authenticated_profitdock_socket;
    const is_restoring_profitdock_session =
        is_profitdock_domain && has_profitdock_stored_session && !has_live_trading_session && !isAuthorizing;
    const should_render_authorized_shell = Boolean(
        effective_loginid &&
            (is_profitdock_domain
                ? has_live_trading_session || has_profitdock_stored_session || isAuthorizing
                : has_live_trading_session || isAuthorizing)
    );

    const { data: activeAccount } = useActiveAccount({ allBalanceData: client?.all_accounts_balance });
    const effective_active_account =
        activeAccount ||
        (is_profitdock_domain && stored_active_account
            ? ({
                  ...stored_active_account,
                  account_type: stored_active_account.is_virtual ? 'demo' : 'real',
                  is_virtual: Boolean(stored_active_account.is_virtual),
              } as NonNullable<typeof activeAccount>)
            : activeAccount);
    const { accounts, getCurrency, is_virtual } = client ?? {};
    const has_wallet = Object.keys(accounts ?? {}).some(id => accounts?.[id].account_category === 'wallet');

    const currency = getCurrency?.();
    const { localize } = useTranslations();

    const { isSingleLoggingIn } = useOauth2();

    const { hubEnabledCountryList } = useFirebaseCountriesConfig();
    const { onRenderTMBCheck, isTmbEnabled, is_tmb_enabled: tmb_enabled_from_hook } = useTMB();
    const is_tmb_enabled = window.is_tmb_enabled === true || tmb_enabled_from_hook;
    // No need for additional state management here since we're handling it in the layout component

    const renderAccountSection = useCallback(() => {
        const can_render_stored_profitdock_account = Boolean(
            is_profitdock_domain && effective_active_account && effective_loginid && has_profitdock_stored_session
        );

        // Show loader during authentication processes
        if (
            !can_render_stored_profitdock_account &&
            (isAuthenticating || isAuthorizing || is_restoring_profitdock_session || (isSingleLoggingIn && !is_tmb_enabled))
        ) {
            return <AccountsInfoLoader isLoggedIn isMobile={!isDesktop} speed={3} />;
        } else if (should_render_authorized_shell) {
            return (
                <>
                    {/* <CustomNotifications /> */}

                    {isDesktop &&
                        (has_wallet ? (
                            <Button
                                className='manage-funds-button'
                                has_effect
                                text={localize('Manage funds')}
                                onClick={() => {
                                    let redirect_url = new URL(standalone_routes.wallets_transfer);
                                    const is_hub_enabled_country = hubEnabledCountryList.includes(
                                        client?.residence || ''
                                    );
                                    if (is_hub_enabled_country) {
                                        redirect_url = new URL(standalone_routes.recent_transactions);
                                    }
                                    if (is_virtual) {
                                        redirect_url.searchParams.set('account', 'demo');
                                    } else if (currency) {
                                        redirect_url.searchParams.set('account', currency);
                                    }
                                    window.location.assign(redirect_url.toString());
                                }}
                                primary
                            />
                        ) : (
                            <Button
                                primary
                                onClick={() => {
                                    const redirect_url = new URL(standalone_routes.cashier_deposit);
                                    if (currency) {
                                        redirect_url.searchParams.set('account', currency);
                                    }
                                    window.location.assign(redirect_url.toString());
                                }}
                                className='deposit-button'
                            >
                                {localize('Deposit')}
                            </Button>
                        ))}

                    <AccountSwitcher activeAccount={effective_active_account} />

                    {isDesktop &&
                        (() => {
                            let redirect_url = new URL(standalone_routes.personal_details);
                            const is_hub_enabled_country = hubEnabledCountryList.includes(client?.residence || '');

                            if (has_wallet && is_hub_enabled_country) {
                                redirect_url = new URL(standalone_routes.account_settings);
                            }
                            // Check if the account is a demo account
                            // Use the URL parameter to determine if it's a demo account, as this will update when the account changes
                            const urlParams = new URLSearchParams(window.location.search);
                            const account_param = urlParams.get('account');
                            const is_virtual = client?.is_virtual || account_param === 'demo';

                            if (is_virtual) {
                                // For demo accounts, set the account parameter to 'demo'
                                redirect_url.searchParams.set('account', 'demo');
                            } else if (currency) {
                                // For live accounts, set the account parameter to the currency
                                redirect_url.searchParams.set('account', currency);
                            }
                            return (
                                <Tooltip
                                    as='a'
                                    href={redirect_url.toString()}
                                    tooltipContent={localize('Manage account settings')}
                                    tooltipPosition='bottom'
                                    className='app-header__account-settings'
                                >
                                    <StandaloneCircleUserRegularIcon className='app-header__profile_icon' />
                                </Tooltip>
                            );
                        })()}
                </>
            );
        } else {
            return (
                <div className='auth-actions'>
                    <Button
                        tertiary
                        onClick={async () => {
                            clearAuthData(false);
                            ensureCustomDomainAppId();

                            const getQueryParams = new URLSearchParams(window.location.search);
                            const currency = getQueryParams.get('account') ?? '';
                            const query_param_currency =
                                currency || sessionStorage.getItem('query_param_currency') || 'USD';

                            if (is_profitdock_domain || isCustomLegacyOAuthDomain()) {
                                sessionStorage.setItem('query_param_currency', query_param_currency);
                                redirectToProfitdockOAuth();
                                return;
                            }

                            try {
                                // First, explicitly wait for TMB status to be determined
                                const tmbEnabled = await isTmbEnabled();
                                // Now use the result of the explicit check
                                if (tmbEnabled) {
                                    await onRenderTMBCheck(true); // Pass true to indicate it's from login button
                                } else {
                                    // Always use OIDC if TMB is not enabled
                                    try {
                                        await requestOidcAuthentication({
                                            redirectCallbackUri: getRedirectCallbackUri(),
                                            ...(query_param_currency
                                                ? {
                                                      state: {
                                                          account: query_param_currency,
                                                      },
                                                  }
                                                : {}),
                                        });
                                    } catch (err) {
                                        handleOidcAuthFailure(err);
                                        window.location.replace(generateOAuthURL());
                                    }
                                }
                            } catch (error) {
                                // eslint-disable-next-line no-console
                                console.error(error);
                            }
                        }}
                    >
                        <Localize i18n_default_text='Log in' />
                    </Button>
                    <Button
                        primary
                        onClick={async () => {
                            const getQueryParams = new URLSearchParams(window.location.search);
                            const currency = getQueryParams.get('account') ?? '';
                            const query_param_currency =
                                currency || sessionStorage.getItem('query_param_currency') || 'USD';

                            if (is_profitdock_domain || isCustomLegacyOAuthDomain()) {
                                sessionStorage.setItem('query_param_currency', query_param_currency);
                                redirectToProfitdockOAuth('registration');
                                return;
                            }

                            redirectToSignUp();
                        }}
                    >
                        <Localize i18n_default_text='Sign up' />
                    </Button>
                </div>
            );
        }
    }, [
        isAuthenticating,
        isAuthorizing,
        isSingleLoggingIn,
        isDesktop,
        standalone_routes,
        client,
        has_wallet,
        currency,
        localize,
        effective_active_account,
        is_virtual,
        onRenderTMBCheck,
        is_tmb_enabled,
        is_profitdock_domain,
        is_restoring_profitdock_session,
        effective_loginid,
        has_profitdock_stored_session,
        should_render_authorized_shell,
    ]);

    if (client?.should_hide_header) return null;
    return (
        <Header
            className={clsx('app-header', {
                'app-header--desktop': isDesktop,
                'app-header--mobile': !isDesktop,
            })}
        >
            <Wrapper variant='left'>
                <AppLogo />
                <MobileMenu />
                {isDesktop && <MenuItems.TradershubLink />}
                {isDesktop && <MenuItems />}
                {isDesktop && <PlatformSwitcher />}
            </Wrapper>
            <Wrapper variant='right'>
                {!isDesktop && <PWAInstallButton variant='primary' size='medium' />}
                {renderAccountSection()}
            </Wrapper>
            {/* <PWAInstallModalTest /> */}
        </Header>
    );
});

export default AppHeader;
