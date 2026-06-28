import clsx from 'clsx';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { getProfitdockOAuthToken } from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { localize } from '@deriv-com/translations';
import { AccountSwitcher as UIAccountSwitcher } from '@deriv-com/ui';
import AccountSwitcherFooter from './account-swticher-footer';
import { TDemoAccounts } from './types';
import { AccountSwitcherDivider, convertCommaValue } from './utils';

const resetProfitdockDemoBalance = async (loginid: string) => {
    const response = await fetch('/api/deriv/options/reset-demo-balance', {
        body: JSON.stringify({
            access_token: getProfitdockOAuthToken(),
            loginid,
        }),
        headers: {
            'Content-Type': 'application/json',
        },
        method: 'POST',
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(payload?.message || localize('Unable to reset this demo balance.'));
    }

    await api_base.init(true);
    await api_base.api
        ?.send({
            balance: 1,
            subscribe: 1,
        })
        .catch(() => undefined);
    return payload;
};

const DemoAccounts = ({
    tabs_labels,
    modifiedVRTCRAccountList,
    switchAccount,
    isVirtual,
    activeLoginId,
    oAuthLogout,
    is_logging_out,
}: TDemoAccounts) => {
    return (
        <>
            <UIAccountSwitcher.AccountsPanel
                isOpen
                title={localize('Deriv account')}
                className='account-switcher-panel'
                key={tabs_labels.demo.toLowerCase()}
            >
                {modifiedVRTCRAccountList &&
                    modifiedVRTCRAccountList.map(account => (
                        <span
                            className={clsx('account-switcher__item', {
                                'account-switcher__item--disabled': account.is_disabled,
                            })}
                            key={account.loginid}
                        >
                            <UIAccountSwitcher.AccountsItem
                                account={account}
                                onSelectAccount={() => {
                                    if (!account.is_disabled) switchAccount(account.loginid);
                                }}
                                onResetBalance={
                                    isVirtual &&
                                    activeLoginId === account.loginid &&
                                    convertCommaValue(account.balance) !== 10000
                                        ? () => {
                                              if (isCustomLegacyOAuthDomain()) {
                                                  void resetProfitdockDemoBalance(account.loginid).catch(error => {
                                                      console.error('[ProfitDock Options] Demo reset failed:', error);
                                                      window.alert(
                                                          error instanceof Error
                                                              ? error.message
                                                              : localize('Unable to reset this demo balance.')
                                                      );
                                                  });
                                                  return;
                                              }

                                              api_base?.api?.send({
                                                  topup_virtual: 1,
                                              });
                                          }
                                        : undefined
                                }
                            />
                        </span>
                    ))}
            </UIAccountSwitcher.AccountsPanel>
            <AccountSwitcherDivider />
            <AccountSwitcherFooter
                loginid={activeLoginId}
                oAuthLogout={oAuthLogout}
                is_logging_out={is_logging_out}
                type='demo'
            />
        </>
    );
};

export default DemoAccounts;

