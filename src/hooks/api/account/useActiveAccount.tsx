import { useMemo } from 'react';
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { addComma, getDecimalPlaces } from '@/components/shared';
import {
    getStoredProfitdockAccounts,
    getStoredProfitdockActiveAccount,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { useApiBase } from '@/hooks/useApiBase';
import { Balance } from '@deriv/api-types';
import { localize } from '@deriv-com/translations';

/** A custom hook that returns the account object for the current active account. */
const useActiveAccount = ({ allBalanceData }: { allBalanceData: Balance | null }) => {
    const { accountList, activeLoginid } = useApiBase();

    const effectiveAccountList = useMemo(() => {
        return accountList?.length ? accountList : getStoredProfitdockAccounts();
    }, [accountList]);

    const activeAccount = useMemo(
        () =>
            effectiveAccountList?.find(account => account.loginid === activeLoginid) ||
            getStoredProfitdockActiveAccount() ||
            effectiveAccountList?.[0],
        [activeLoginid, effectiveAccountList]
    );

    const currentBalanceData = allBalanceData?.accounts?.[activeAccount?.loginid ?? ''];

    const modifiedAccount = useMemo(() => {
        const balance_currency = currentBalanceData?.currency || activeAccount?.currency || 'USD';
        const raw_balance = currentBalanceData?.balance ?? (activeAccount as { balance?: number | string })?.balance;
        const formatted_balance = Number.isFinite(Number(raw_balance))
            ? addComma(Number(raw_balance).toFixed(getDecimalPlaces(balance_currency)))
            : '0';

        return activeAccount
            ? {
                  ...activeAccount,
                  balance: formatted_balance,
                  currencyLabel: activeAccount?.is_virtual ? localize('Demo') : activeAccount?.currency,
                  icon: (
                      <CurrencyIcon
                          currency={activeAccount?.currency?.toLowerCase()}
                          isVirtual={Boolean(activeAccount?.is_virtual)}
                      />
                  ),
                  isVirtual: Boolean(activeAccount?.is_virtual),
                  isActive: activeAccount?.loginid === activeLoginid,
              }
            : undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAccount, activeLoginid, allBalanceData]);

    return {
        /** User's current active account. */
        data: modifiedAccount,
    };
};

export default useActiveAccount;
