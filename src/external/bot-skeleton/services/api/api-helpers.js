import AccountLimits from './account-limits';
import ActiveSymbols from './active-symbols';
import ContractsFor from './contracts-for';
import TradingTimes from './trading-times';

class ApiHelpers {
    static singleton = null;

    constructor(api_helpers_store) {
        this.trading_times = new TradingTimes(api_helpers_store);
        this.contracts_for = new ContractsFor(api_helpers_store);
        this.active_symbols = new ActiveSymbols(this.trading_times);
        this.account_limits = new AccountLimits(api_helpers_store);
    }

    updateStore(api_helpers_store) {
        this.trading_times?.updateStore?.(api_helpers_store);
        this.contracts_for?.updateStore?.(api_helpers_store);
        this.account_limits?.updateStore?.(api_helpers_store);
    }

    static disposeInstance() {
        this.singleton = null;
    }

    static setInstance(api_helpers_store) {
        if (!this.singleton) {
            this.singleton = new ApiHelpers(api_helpers_store);
        } else {
            this.singleton.updateStore(api_helpers_store);
        }

        return this.instance;
    }

    static get instance() {
        return this.singleton;
    }
}

export default ApiHelpers;
