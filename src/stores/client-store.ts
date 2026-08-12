import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { ContentFlag, isEmptyObject } from '@/components/shared';
import { isEuCountry, isMultipliersOnly, isOptionsBlocked } from '@/components/shared/common/utility';
import { removeCookies } from '@/components/shared/utils/storage/storage';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import {
    authData$,
    setAccountList,
    setAuthData,
    setIsAuthorized,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import type { TAuthData, TLandingCompany } from '@/types/api-types';
import type { Balance, GetAccountStatus, GetSettings, WebsiteStatus } from '@deriv/api-types';
import { Analytics } from '@deriv-com/analytics';

const eu_shortcode_regex = /^maltainvest$/;
const eu_excluded_regex = /^mt$/;
export default class ClientStore {
    loginid = '';
    account_list: TAuthData['account_list'] = [];
    _real_balance = '0';
    dummy_balance = Number(localStorage.getItem('profitdock_dummy_balance') || '0');
    is_dummy_active = localStorage.getItem('profitdock_dummy_active') === 'true';
    currency = 'AUD';
    is_logged_in = false;
    account_status: GetAccountStatus | undefined;
    account_settings: GetSettings | undefined;
    website_status: WebsiteStatus | undefined;
    landing_companies: TLandingCompany | undefined;
    upgradeable_landing_companies: string[] = [];
    accounts: Record<string, TAuthData['account_list'][number]> = {};
    is_landing_company_loaded: boolean | undefined;
    _real_all_accounts_balance: Balance | null = null;
    is_logging_out = false;

    // TODO: fix with self exclusion
    updateSelfExclusion = () => {};

    private authDataSubscription: { unsubscribe: () => void } | null = null;

    constructor() {
        // Subscribe to auth data changes
        this.authDataSubscription = authData$.subscribe(authData => {
            if (authData?.upgradeable_landing_companies) {
                this.setUpgradeableLandingCompanies(authData.upgradeable_landing_companies);
            }
        });
        
        if (this.is_dummy_active) {
            this.toggleDummyMode(true);
        }

        makeObservable(this, {
            accounts: observable,
            account_list: observable,
            account_settings: observable,
            account_status: observable,
            _real_all_accounts_balance: observable,
            _real_balance: observable,
            dummy_balance: observable,
            is_dummy_active: observable,
            currency: observable,
            is_landing_company_loaded: observable,
            is_logged_in: observable,
            landing_companies: observable,
            loginid: observable,
            upgradeable_landing_companies: observable,
            website_status: observable,
            is_logging_out: observable,
            balance: computed,
            all_accounts_balance: computed,
            active_accounts: computed,
            clients_country: computed,
            is_bot_allowed: computed,
            is_eu: computed,
            is_eu_country: computed,
            is_eu_or_multipliers_only: computed,
            is_low_risk: computed,
            is_multipliers_only: computed,
            is_options_blocked: computed,
            is_virtual: computed,
            landing_company_shortcode: computed,
            residence: computed,
            should_show_eu_error: computed,
            logout: action,
            setAccountList: action,
            setAccountSettings: action,
            setAccountStatus: action,
            setAllAccountsBalance: action,
            setBalance: action,
            setDummyBalance: action,
            toggleDummyMode: action,
            setCurrency: action,
            setIsLoggedIn: action,
            setIsLoggingOut: action,
            setLandingCompany: action,
            setLoginId: action,
            setWebsiteStatus: action,
            setUpgradeableLandingCompanies: action,
            updateTncStatus: action,
            is_trading_experience_incomplete: computed,
            is_cr_account: computed,
            account_open_date: computed,
        });
    }

    get active_accounts() {
        return this.accounts instanceof Object
            ? Object.values(this.accounts).filter(account => !account.is_disabled)
            : [];
    }

    get balance() {
        const hasCustomBalance = typeof window !== 'undefined' && localStorage.getItem('profitdock_dummy_balance') !== null;
        if (this.is_dummy_active && hasCustomBalance) {
            return this.dummy_balance.toFixed(2);
        }
        return this._real_balance;
    }

    get all_accounts_balance() {
        const real_all = this._real_all_accounts_balance;
        if (this.is_dummy_active && this.loginid && !this.is_virtual) {
            if (real_all?.accounts?.[this.loginid]) {
                return {
                    ...real_all,
                    accounts: {
                        ...real_all.accounts,
                        [this.loginid]: {
                            ...real_all.accounts[this.loginid],
                            balance: this.dummy_balance,
                        }
                    }
                };
            } else {
                return {
                    ...real_all,
                    balance: this.dummy_balance,
                    currency: this.currency,
                    loginid: this.loginid,
                    total: {
                        deriv: { amount: this.dummy_balance, currency: this.currency },
                        ...(real_all?.total || {})
                    },
                    accounts: {
                        ...(real_all?.accounts || {}),
                        [this.loginid]: {
                            balance: this.dummy_balance,
                            currency: this.currency,
                            demo_account: 0,
                            status: 1
                        }
                    }
                } as any;
            }
        }
        return real_all;
    }

    get clients_country() {
        return this.website_status?.clients_country;
    }

    get is_bot_allowed() {
        return this.isBotAllowed();
    }
    get is_trading_experience_incomplete() {
        return this.account_status?.status?.some(status => status === 'trading_experience_not_complete');
    }

    get is_eu() {
        if (!this.landing_companies) return false;
        const { gaming_company, financial_company, mt_gaming_company } = this.landing_companies;
        const financial_shortcode = financial_company?.shortcode;
        const gaming_shortcode = gaming_company?.shortcode;
        const mt_gaming_shortcode = mt_gaming_company?.financial.shortcode || mt_gaming_company?.swap_free.shortcode;
        const is_current_mf = this.landing_company_shortcode === 'maltainvest';
        return (
            is_current_mf || //is_currently logged in mf account via tradershub
            (financial_shortcode || gaming_shortcode || mt_gaming_shortcode
                ? (eu_shortcode_regex.test(financial_shortcode) && gaming_shortcode !== 'svg') ||
                  eu_shortcode_regex.test(gaming_shortcode)
                : eu_excluded_regex.test(this.residence))
        );
    }

    get is_eu_country() {
        const country = this.website_status?.clients_country;
        if (country) return isEuCountry(country);
        return false;
    }

    get is_low_risk() {
        const { gaming_company, financial_company } = this.landing_companies ?? {};
        const low_risk_landing_company =
            financial_company?.shortcode === 'maltainvest' && gaming_company?.shortcode === 'svg';
        return low_risk_landing_company;
    }

    get should_show_eu_error() {
        if (!this.is_landing_company_loaded) {
            return false;
        }
        return this.is_eu && !this.is_low_risk;
    }

    get landing_company_shortcode() {
        if (this.accounts[this.loginid]) {
            return this.accounts[this.loginid].landing_company_name;
        }
        return undefined;
    }

    get residence() {
        if (this.is_logged_in) {
            return this.account_settings?.country_code ?? '';
        }
        return '';
    }

    get is_options_blocked() {
        return isOptionsBlocked(this.residence);
    }

    get is_multipliers_only() {
        return isMultipliersOnly(this.residence);
    }

    get is_eu_or_multipliers_only() {
        // Check whether account is multipliers only and if the account is from eu countries
        return !this.is_multipliers_only ? !isEuCountry(this.residence) : !this.is_multipliers_only;
    }

    get is_virtual() {
        return !isEmptyObject(this.accounts) && this.accounts[this.loginid] && !!this.accounts[this.loginid].is_virtual;
    }

    get all_loginids() {
        return !isEmptyObject(this.accounts) ? Object.keys(this.accounts) : [];
    }

    get virtual_account_loginid() {
        return this.all_loginids.find(loginid => !!this.accounts[loginid].is_virtual);
    }

    get content_flag() {
        const { is_logged_in, landing_companies, residence, is_landing_company_loaded } = this;
        if (is_landing_company_loaded) {
            const { financial_company, gaming_company } = landing_companies ?? {};

            //this is a conditional check for countries like Australia/Norway which fulfills one of these following conditions
            const restricted_countries = financial_company?.shortcode === 'svg' || gaming_company?.shortcode === 'svg';

            if (!is_logged_in) return '';
            if (!gaming_company?.shortcode && financial_company?.shortcode === 'maltainvest') {
                if (this.is_virtual) return ContentFlag.EU_DEMO;
                return ContentFlag.EU_REAL;
            } else if (
                financial_company?.shortcode === 'maltainvest' &&
                gaming_company?.shortcode === 'svg' &&
                !this.is_virtual
            ) {
                if (this.is_eu) return ContentFlag.LOW_RISK_CR_EU;
                return ContentFlag.LOW_RISK_CR_NON_EU;
            } else if (
                ((financial_company?.shortcode === 'svg' && gaming_company?.shortcode === 'svg') ||
                    restricted_countries) &&
                !this.is_virtual
            ) {
                return ContentFlag.HIGH_RISK_CR;
            }

            // Default Check
            if (isEuCountry(residence)) {
                if (this.is_virtual) return ContentFlag.EU_DEMO;
                return ContentFlag.EU_REAL;
            }
            if (this.is_virtual) return ContentFlag.CR_DEMO;
        }
        return ContentFlag.LOW_RISK_CR_NON_EU;
    }

    get is_cr_account() {
        return this.loginid?.startsWith('CR');
    }

    get should_hide_header() {
        return (this.is_eu && this.should_show_eu_error) || (!this.is_logged_in && this.is_eu_country);
    }

    get account_open_date() {
        if (isEmptyObject(this.accounts) || !this.accounts[this.loginid]) return undefined;
        return Object.keys(this.accounts[this.loginid]).includes('created_at')
            ? this.accounts[this.loginid].created_at
            : undefined;
    }

    isBotAllowed = () => {
        // Stop showing Bot, DBot, DSmartTrader for logged out EU IPs
        if (!this.is_logged_in && this.is_eu_country) return false;
        const is_mf = this.landing_company_shortcode === 'maltainvest';
        return this.is_virtual ? this.is_eu_or_multipliers_only : !is_mf && !this.is_options_blocked;
    };

    setLoginId = (loginid: string) => {
        this.loginid = loginid;
    };

    setAccountList = (account_list?: TAuthData['account_list']) => {
        this.accounts = {};
        account_list?.forEach(account => {
            this.accounts[account.loginid] = account;
        });
        if (account_list) this.account_list = account_list;
    };

    setBalance = (balance: string) => {
        const newRealBalance = parseFloat(balance) || 0;
        const oldRealBalance = parseFloat(this._real_balance) || 0;
        const hasCustomBalance = typeof window !== 'undefined' && localStorage.getItem('profitdock_dummy_balance') !== null;

        if (this.is_dummy_active && hasCustomBalance && oldRealBalance > 0) {
            const diff = newRealBalance - oldRealBalance;
            if (diff !== 0) {
                this.dummy_balance = Math.max(0, this.dummy_balance + diff);
                localStorage.setItem('profitdock_dummy_balance', this.dummy_balance.toString());
            }
        }

        this._real_balance = balance;

        if (this.is_dummy_active && !hasCustomBalance) {
            this.dummy_balance = newRealBalance;
        }
    };

    setDummyBalance = (balance: number) => {
        this.dummy_balance = balance;
        localStorage.setItem('profitdock_dummy_balance', balance.toString());
    };

    /** Key used to store the real account loginid before virtual mode swap */
    private _savedRealLoginId: string | null = null;

    toggleDummyMode = (isActive: boolean) => {
        // Update observable state synchronously so UI responds immediately
        this.is_dummy_active = isActive;
        localStorage.setItem('profitdock_dummy_active', isActive.toString());

        // Clear any old interceptor
        if (typeof window !== 'undefined') {
            window._profitdock_dummy_interceptor = undefined;
        }

        if (isActive) {
            // --- Find VRTC (demo) account ---
            const demoLoginId = this.virtual_account_loginid || this.all_loginids.find(id => id.startsWith('VRTC'));

            if (!demoLoginId) {
                console.warn('[VirtualMode] No VRTC demo account found — virtual mode inactive');
                runInAction(() => {
                    this.is_dummy_active = false;
                });
                localStorage.setItem('profitdock_dummy_active', 'false');
                return;
            }

            // Save the current real account so we can restore it later
            this._savedRealLoginId = localStorage.getItem('active_loginid') || this.loginid;

            // Swap active loginid to demo
            localStorage.setItem('active_loginid', demoLoginId);

            // Re-init API in the background — don't block the toggle
            Promise.resolve().then(() => api_base.init(true)).catch(e =>
                console.warn('[VirtualMode] API re-init failed:', e)
            );
        } else {
            // --- Restore real account ---
            const restoreLoginId = this._savedRealLoginId ||
                this.all_loginids.find(id => !this.accounts[id].is_virtual) || '';

            if (restoreLoginId) {
                localStorage.setItem('active_loginid', restoreLoginId);
            }
            this._savedRealLoginId = null;

            // Re-init API in the background
            Promise.resolve().then(() => api_base.init(true)).catch(e =>
                console.warn('[VirtualMode] API restore failed:', e)
            );
        }
    };

    setCurrency = (currency: string) => {
        this.currency = currency;
    };

    setIsLoggedIn = (is_logged_in: boolean) => {
        this.is_logged_in = is_logged_in;
    };

    getCurrency = (loginid = this.loginid || localStorage.getItem('active_loginid') || '') => {
        const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') ?? '{}');
        return clientAccounts[loginid]?.currency ?? this.accounts[loginid]?.currency ?? '';
    };

    getToken = (loginid = this.loginid || localStorage.getItem('active_loginid') || '') => {
        const accountList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
        const account_token = accountList[loginid];
        if (typeof account_token === 'string') {
            return account_token;
        }

        const stored_token = localStorage.getItem('authToken');
        if (typeof stored_token === 'string' && stored_token !== 'null') {
            return stored_token;
        }

        return '';
    };

    setAccountStatus(status: GetAccountStatus | undefined) {
        this.account_status = status;
    }

    setAccountSettings(settings: GetSettings | undefined) {
        try {
            const is_equal_settings = JSON.stringify(settings) === JSON.stringify(this.account_settings);
            if (!is_equal_settings) {
                this.account_settings = settings;
            }
        } catch (error) {
            console.error('setAccountSettings error', error);
        }
    }

    updateTncStatus(landing_company_shortcode: string, status: number) {
        try {
            if (!this.account_settings) return;

            const updated_settings = {
                ...this.account_settings,
                tnc_status: {
                    ...this.account_settings.tnc_status,
                    [landing_company_shortcode]: status,
                },
            };

            this.setAccountSettings(updated_settings);
        } catch (error) {
            console.error('updateTncStatus error', error);
        }
    }

    setWebsiteStatus(status: WebsiteStatus | undefined) {
        this.website_status = status;
    }

    setLandingCompany(landing_companies: TLandingCompany) {
        this.landing_companies = landing_companies;
        this.is_landing_company_loaded = true;
    }

    setUpgradeableLandingCompanies = (upgradeable_landing_companies: string[]) => {
        this.upgradeable_landing_companies = upgradeable_landing_companies;
    };

    setAllAccountsBalance = (all_accounts_balance: Balance | undefined) => {
        this._real_all_accounts_balance = all_accounts_balance ?? null;
    };

    setIsLoggingOut = (is_logging_out: boolean) => {
        this.is_logging_out = is_logging_out;
    };

    logout = async () => {
        // reset all the states
        this.account_list = [];
        this.account_status = undefined;
        this.account_settings = undefined;
        this.landing_companies = undefined;
        this.accounts = {};
        this.is_logged_in = false;
        this.loginid = '';
        this._real_balance = '0';
        this.currency = 'USD';

        this.is_landing_company_loaded = false;

        this._real_all_accounts_balance = null;

        localStorage.removeItem('active_loginid');
        localStorage.removeItem('accountsList');
        localStorage.removeItem('authToken');
        localStorage.removeItem('clientAccounts');
        localStorage.removeItem('client_account_details');
        localStorage.removeItem('config.post_login_redirect_uri');
        localStorage.removeItem('profitdock_auth_stage');
        sessionStorage.removeItem('redirect_url');
        removeCookies('client_information');

        setIsAuthorized(false);
        setAccountList([]);
        setAuthData(null);

        this.setIsLoggingOut(false);

        Analytics.reset();

        // disable livechat
        window.LC_API?.close_chat?.();
        window.LiveChatWidget?.call('hide');

        // shutdown and initialize intercom
        if (window.Intercom) {
            window.Intercom('shutdown');
            window.DerivInterCom.initialize({
                hideLauncher: true,
                token: null,
            });
        }

        const resolveNavigation = () => {
            if (window.history.length > 1) {
                history.back();
            } else {
                window.location.replace('/');
            }
        };
        return api_base?.api
            ?.logout()
            .then(() => {
                resolveNavigation();
                return Promise.resolve();
            })
            .catch((error: Error) => {
                console.error('test Logout failed:', error);
                resolveNavigation();
                return Promise.reject(error);
            });
    };
}

