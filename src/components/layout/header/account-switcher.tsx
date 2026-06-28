import React, { lazy, Suspense, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { addComma, getDecimalPlaces } from '@/components/shared';
import Popover from '@/components/shared_ui/popover';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { getStoredProfitdockAccounts } from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { Analytics } from '@deriv-com/analytics';
import { AccountSwitcher as UIAccountSwitcher, Loader } from '@deriv-com/ui';
import DemoAccounts from './common/demo-accounts';
import RealAccounts from './common/real-accounts';
import { TAccountSwitcher, TAccountSwitcherProps, TModifiedAccount } from './common/types';
import { LOW_RISK_COUNTRIES } from './utils';
import './account-switcher.scss';

const AccountInfoWallets = lazy(() => import('./wallets/account-info-wallets'));

const tabs_labels = {
    demo: 'Demo',
    real: 'Real',
};

const getDisplayBalance = (raw_balance: number | string | undefined, currency = 'USD') => {
    const numeric_balance = Number(raw_balance);

    if (!Number.isFinite(numeric_balance)) {
        return '0';
    }

    return addComma(numeric_balance.toFixed(getDecimalPlaces(currency)));
};

const isDemoAccount = (account?: { account_type?: string; is_virtual?: boolean; loginid?: string }) =>
    Boolean(
        account?.is_virtual ||
            account?.account_type === 'demo' ||
            /^(VR|VRTC|VRW)/i.test(account?.loginid || '')
    );

const RenderAccountItems = ({
    isVirtual,
    modifiedCRAccountList,
    modifiedMFAccountList,
    modifiedVRTCRAccountList,
    switchAccount,
    activeLoginId,
    client,
}: TAccountSwitcherProps) => {
    const { oAuthLogout } = useOauth2({ handleLogout: async () => client.logout(), client });
    const is_low_risk_country = LOW_RISK_COUNTRIES().includes(client.account_settings?.country_code ?? '');
    const is_virtual = !!isVirtual;
    const residence = client.residence;

    if (is_virtual) {
        return (
            <>
                <DemoAccounts
                    modifiedVRTCRAccountList={modifiedVRTCRAccountList as TModifiedAccount[]}
                    switchAccount={switchAccount}
                    activeLoginId={activeLoginId}
                    isVirtual={is_virtual}
                    tabs_labels={tabs_labels}
                    oAuthLogout={oAuthLogout}
                    is_logging_out={client.is_logging_out}
                />
            </>
        );
    } else {
        return (
            <RealAccounts
                modifiedCRAccountList={modifiedCRAccountList as TModifiedAccount[]}
                modifiedMFAccountList={modifiedMFAccountList as TModifiedAccount[]}
                switchAccount={switchAccount}
                isVirtual={is_virtual}
                tabs_labels={tabs_labels}
                is_low_risk_country={is_low_risk_country}
                oAuthLogout={oAuthLogout}
                loginid={activeLoginId}
                is_logging_out={client.is_logging_out}
                upgradeable_landing_companies={client?.landing_companies?.all_company ?? null}
                residence={residence}
            />
        );
    }
};

const AccountSwitcher = observer(({ activeAccount }: TAccountSwitcher) => {
    const { accountList } = useApiBase();
    const { ui, run_panel, client } = useStore();
    const { accounts } = client;
    const { toggleAccountsDialog, is_accounts_switcher_on, account_switcher_disabled_message } = ui;
    const { is_stop_button_visible } = run_panel;
    const has_wallet = Object.keys(accounts).some(id => accounts[id].account_category === 'wallet');
    const effectiveAccountList = useMemo(
        () => (accountList?.length ? accountList : getStoredProfitdockAccounts()),
        [accountList]
    );

    const modifiedAccountList = useMemo(() => {
        return effectiveAccountList?.map(account => {
            const live_balance = client.all_accounts_balance?.accounts?.[account?.loginid]?.balance;

            return {
                ...account,
                balance: getDisplayBalance(live_balance ?? account?.balance, account?.currency || 'USD'),
                currencyLabel: account?.is_virtual
                    ? tabs_labels.demo
                    : (client.website_status?.currencies_config?.[account?.currency]?.name ?? account?.currency),
                icon: (
                    <CurrencyIcon
                        currency={account?.currency?.toLowerCase()}
                        isVirtual={Boolean(account?.is_virtual)}
                    />
                ),
                isVirtual: Boolean(account?.is_virtual),
                isActive: account?.loginid === activeAccount?.loginid,
            };
        });
    }, [
        effectiveAccountList,
        client.all_accounts_balance?.accounts,
        client.website_status?.currencies_config,
        activeAccount?.loginid,
    ]);
    const modifiedCRAccountList = useMemo(
        () => modifiedAccountList?.filter(account => !isDemoAccount(account) && !account?.loginid?.includes('MF')) ?? [],
        [modifiedAccountList]
    );

    const modifiedMFAccountList = useMemo(
        () => modifiedAccountList?.filter(account => !isDemoAccount(account) && account?.loginid?.includes('MF')) ?? [],
        [modifiedAccountList]
    );

    const modifiedVRTCRAccountList = useMemo(
        () => modifiedAccountList?.filter(account => isDemoAccount(account)) ?? [],
        [modifiedAccountList]
    );

    const switchAccount = async (loginId: string) => {
        if (loginId === activeAccount?.loginid) return;
        const account_list = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
        const token = account_list[loginId] || localStorage.getItem('authToken');
        if (!token) return;
        localStorage.setItem('authToken', token);
        localStorage.setItem('active_loginid', loginId);
        client.setLoginId(loginId);
        const selected_account = modifiedAccountList.find(acc => acc.loginid === loginId);
        client.setCurrency(selected_account?.currency || client.getCurrency(loginId) || client.currency);
        const account_type = selected_account?.is_virtual ? 'demo' : selected_account?.account_type || 'real';

        Analytics.setAttributes({
            account_type,
        });
        await api_base?.init(true);
        client.setIsLoggedIn(Boolean(api_base.is_authorized || api_base.has_authenticated_profitdock_socket));
        const search_params = new URLSearchParams(window.location.search);
        if (!selected_account) return;
        const account_param = isDemoAccount(selected_account) ? 'demo' : selected_account.currency;
        search_params.set('account', account_param);
        sessionStorage.setItem('query_param_currency', account_param);
        window.history.pushState({}, '', `${window.location.pathname}?${search_params.toString()}`);
    };

    return (
        activeAccount &&
        (has_wallet ? (
            <Suspense fallback={<Loader />}>
                <AccountInfoWallets is_dialog_on={is_accounts_switcher_on} toggleDialog={toggleAccountsDialog} />
            </Suspense>
        ) : (
            <Popover
                className='run-panel__info'
                classNameBubble='run-panel__info--bubble'
                alignment='bottom'
                message={account_switcher_disabled_message}
                zIndex='10020'
            >
                <UIAccountSwitcher
                    activeAccount={activeAccount}
                    isDisabled={is_stop_button_visible}
                    tabsLabels={tabs_labels}
                >
                    <UIAccountSwitcher.Tab title={tabs_labels.real}>
                        <RenderAccountItems
                            modifiedCRAccountList={modifiedCRAccountList as TModifiedAccount[]}
                            modifiedMFAccountList={modifiedMFAccountList as TModifiedAccount[]}
                            switchAccount={switchAccount}
                            activeLoginId={activeAccount?.loginid}
                            client={client}
                        />
                    </UIAccountSwitcher.Tab>
                    <UIAccountSwitcher.Tab title={tabs_labels.demo}>
                        <RenderAccountItems
                            modifiedVRTCRAccountList={modifiedVRTCRAccountList as TModifiedAccount[]}
                            switchAccount={switchAccount}
                            isVirtual
                            activeLoginId={activeAccount?.loginid}
                            client={client}
                        />
                    </UIAccountSwitcher.Tab>
                </UIAccountSwitcher>
            </Popover>
        ))
    );
});

export default AccountSwitcher;

