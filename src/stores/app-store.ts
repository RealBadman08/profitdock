import Cookies from 'js-cookie';
import { action, makeObservable, reaction, when } from 'mobx';
import { BOT_RESTRICTED_COUNTRIES_LIST } from '@/components/layout/header/utils';
import {
    ContentFlag,
    isEuResidenceWithOnlyVRTC,
    showDigitalOptionsUnavailableError,
    standalone_routes,
} from '@/components/shared';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import ApiHelpers from '@/external/bot-skeleton/services/api/api-helpers';
import { TApiHelpersStore } from '@/types/stores.types';
import { isAnyCallbackFlow } from '@/utils/auth-utils';
import { getDBot, getScratchUtils } from '@/utils/lazy-bot-skeleton';
import { localize } from '@deriv-com/translations';
import RootStore from './root-store';

export default class AppStore {
    root_store: RootStore;
    core: RootStore['core'];
    dbot_store: RootStore | null;
    api_helpers_store: TApiHelpersStore | null;
    timer: ReturnType<typeof setInterval> | null;
    workspace_bootstrap_retry_id: ReturnType<typeof setTimeout> | null;
    disposeReloadOnLanguageChangeReaction: unknown;
    disposeCurrencyReaction: unknown;
    disposeSwitchAccountListener: unknown;
    disposeLandingCompanyChangeReaction: unknown;
    disposeResidenceChangeReaction: unknown;

    constructor(root_store: RootStore, core: RootStore['core']) {
        makeObservable(this, {
            onMount: action,
            onUnmount: action,
            registerCurrencyReaction: action,
            registerOnAccountSwitch: action,
            registerLandingCompanyChangeReaction: action,
            registerResidenceChangeReaction: action,
            refreshTradeDefinitionBlocks: action.bound,
            setDBotEngineStores: action,
            onClickOutsideBlockly: action,
            showDigitalOptionsMaltainvestError: action,
        });

        this.root_store = root_store;
        this.core = core;
        this.dbot_store = null;
        this.api_helpers_store = null;
        this.timer = null;
        this.workspace_bootstrap_retry_id = null;
    }

    getErrorForNonEuClients = () => ({
        text: localize(
            'Unfortunately, this trading platform is not available for EU Deriv account. Please switch to a non-EU account to continue trading.'
        ),
        title: localize('Deriv Bot is unavailable for this account'),
        link: localize('Switch to another account'),
    });

    getErrorForEuClients = (is_logged_in = false, country: string | undefined = undefined) => {
        return {
            text: ' ',
            title: is_logged_in
                ? localize(`Deriv Bot is not available for ${country || 'EU'} clients`)
                : localize(`Deriv Bot is unavailable in ${country || 'the EU'}`),
            link: is_logged_in ? localize("Back to Trader's Hub") : localize('Refresh'),
            route: standalone_routes.traders_hub,
        };
    };

    throwErrorForExceptionCountries = (client_country: string) => {
        const { client, common } = this.core;
        const bot_resticted_countries = BOT_RESTRICTED_COUNTRIES_LIST();

        const not_allowed_clients_country: { [key: string]: string } = {
            ...bot_resticted_countries,
        };

        const country_name = not_allowed_clients_country[client_country];

        if (country_name) {
            return showDigitalOptionsUnavailableError(
                common.showError,
                this.getErrorForEuClients(client.is_logged_in, country_name)
            );
        }
    };

    handleErrorForEu = () => {
        const { client, common } = this.core;
        const { is_landing_company_loaded } = client;

        // Check if we're in the process of logging in
        // When isSingleLoggingIn is true, we don't want to show the EU error message
        const is_tmb_enabled = window.is_tmb_enabled === true;
        const isSingleLoggingIn =
            isAnyCallbackFlow() ||
            (Cookies.get('logged_state') === 'true' &&
                !is_tmb_enabled &&
                Object.keys(JSON.parse(localStorage.getItem('accountsList') || '{}')).length === 0);

        if (isSingleLoggingIn) {
            common.setError(false, {});
            return false;
        }

        if (!client?.is_logged_in && client?.is_eu_country) {
            this.throwErrorForExceptionCountries(client?.clients_country as string);
            return showDigitalOptionsUnavailableError(common.showError, this.getErrorForEuClients());
        }

        if (is_landing_company_loaded !== undefined && !is_landing_company_loaded) {
            common.setError(false, {});
            return false;
        }

        this.throwErrorForExceptionCountries(client?.account_settings?.country_code as string);
        if (client.should_show_eu_error) {
            return showDigitalOptionsUnavailableError(common.showError, this.getErrorForEuClients(client.is_logged_in));
        }

        if (client.content_flag === ContentFlag.HIGH_RISK_CR) {
            common.setError(false, {});
            return false;
        }

        if (client.content_flag === ContentFlag.LOW_RISK_CR_EU) {
            return showDigitalOptionsUnavailableError(
                common.showError,
                this.getErrorForNonEuClients(),
                () => {
                    // TODOL: need to fix this from the deriv ui package
                    document.querySelector('.deriv-account-switcher__button')?.click();
                },
                false,
                false
            );
        }

        if (
            (!client.is_bot_allowed && client.is_eu && client.should_show_eu_error) ||
            isEuResidenceWithOnlyVRTC(client.active_accounts) ||
            client.is_options_blocked
        ) {
            return showDigitalOptionsUnavailableError(
                common.showError,
                this.getErrorForNonEuClients(),
                () => {
                    // TODOL: need to fix this from the deriv ui package
                    document.querySelector('.deriv-account-switcher__button')?.click();
                },
                false,
                false
            );
        }

        common.setError(false, {});
        return false;
    };

    refreshTradeDefinitionBlocks = async (should_force_symbols_refresh = false) => {
        const active_symbols = ApiHelpers?.instance?.active_symbols;
        const contracts_for = ApiHelpers?.instance?.contracts_for;
        const workspace = window.Blockly?.derivWorkspace;

        if (!active_symbols || !contracts_for || !workspace) {
            return false;
        }

        try {
            await active_symbols.retrieveActiveSymbols(should_force_symbols_refresh);
            contracts_for.disposeCache();

            const { runIrreversibleEvents } = await getScratchUtils();
            workspace
                .getAllBlocks()
                .filter(block => block.type === 'trade_definition_market')
                .forEach(block => {
                    runIrreversibleEvents(() => {
                        const fake_create_event = new window.Blockly.Events.BlockCreate(block);
                        window.Blockly.Events.fire(fake_create_event);
                    });
                });

            return true;
        } catch (error) {
            console.error('[Blockly] Failed to refresh trade definition market blocks.', error);
            return false;
        }
    };

    bootstrapBlocklyWorkspace = async (attempt = 0): Promise<boolean> => {
        const { blockly_store } = this.root_store;
        const { ui } = this.core;

        if (window.Blockly?.derivWorkspace) {
            return true;
        }

        if (!api_base.api) {
            void api_base.init().catch(error => {
                console.error('[Blockly] Failed to prime API before workspace bootstrap.', error);
            });
        }

        this.setDBotEngineStores();

        if (!this.dbot_store || !this.api_helpers_store?.ws) {
            if (attempt >= 80) {
                console.error('[Blockly] DBot engine stores were not ready in time. Workspace bootstrap aborted.', {
                    has_dbot_store: !!this.dbot_store,
                    has_api_helper_ws: !!this.api_helpers_store?.ws,
                });
                blockly_store.setLoading(false);
                return false;
            }

            if (attempt === 20) {
                console.warn('[Blockly] Waiting longer for DBot engine stores before aborting workspace bootstrap.', {
                    has_dbot_store: !!this.dbot_store,
                    has_api_helper_ws: !!this.api_helpers_store?.ws,
                });
            }

            await new Promise(resolve => {
                this.workspace_bootstrap_retry_id = window.setTimeout(resolve, 100);
            });

            return this.bootstrapBlocklyWorkspace(attempt + 1);
        }

        blockly_store.setLoading(true);

        try {
            const DBot = await getDBot();
            await DBot.initWorkspace('/', this.dbot_store, this.api_helpers_store, ui.is_mobile, false);
            blockly_store.setContainerSize();
            void this.refreshTradeDefinitionBlocks();
            return true;
        } catch (error) {
            console.error('[Blockly] ProfitDock workspace bootstrap failed.', error);
            return false;
        } finally {
            blockly_store.setLoading(false);
            this.workspace_bootstrap_retry_id = null;
        }
    };

    onMount = async () => {
        const { blockly_store, run_panel } = this.root_store;
        const { client } = this.core;
        this.showDigitalOptionsMaltainvestError();

        let timer_counter = 1;

        this.timer = setInterval(() => {
            if (window.sendRequestsStatistic) {
                window.sendRequestsStatistic(false);
                performance.clearMeasures();
                if (timer_counter === 6 || run_panel?.is_running) {
                    if (this.timer) clearInterval(this.timer);
                } else {
                    timer_counter++;
                }
            }
        }, 10000);

        const is_workspace_ready = await this.bootstrapBlocklyWorkspace();

        if (!is_workspace_ready) {
            return;
        }

        this.registerCurrencyReaction.call(this);
        this.registerOnAccountSwitch.call(this);
        this.registerLandingCompanyChangeReaction.call(this);
        this.registerResidenceChangeReaction.call(this);

        window.addEventListener('click', this.onClickOutsideBlockly);

        blockly_store.getCachedActiveTab();

        when(
            () => client?.should_show_eu_error || client?.is_landing_company_loaded,
            () => this.showDigitalOptionsMaltainvestError()
        );

        reaction(
            () => client?.content_flag,
            () => this.showDigitalOptionsMaltainvestError()
        );
    };

    onUnmount = () => {
        void getDBot().then(DBot => {
            DBot.terminateBot();
            DBot.terminateConnection();
        });
        if (window.Blockly?.derivWorkspace) {
            clearInterval(window.Blockly?.derivWorkspace.save_workspace_interval);
            window.Blockly.derivWorkspace?.dispose();
        }
        if (typeof this.disposeReloadOnLanguageChangeReaction === 'function') {
            this.disposeReloadOnLanguageChangeReaction();
        }
        if (typeof this.disposeCurrencyReaction === 'function') {
            this.disposeCurrencyReaction();
        }
        if (typeof this.disposeSwitchAccountListener === 'function') {
            this.disposeSwitchAccountListener();
        }
        if (typeof this.disposeLandingCompanyChangeReaction === 'function') {
            this.disposeLandingCompanyChangeReaction();
        }
        if (typeof this.disposeResidenceChangeReaction === 'function') {
            this.disposeResidenceChangeReaction();
        }

        window.removeEventListener('click', this.onClickOutsideBlockly);

        // Ensure account switch is re-enabled.
        // TODO: fix
        const { ui } = this.core;

        ui.setAccountSwitcherDisabledMessage();
        ui.setPromptHandler(false);

        if (this.timer) clearInterval(this.timer);
        if (this.workspace_bootstrap_retry_id) clearTimeout(this.workspace_bootstrap_retry_id);
        performance.clearMeasures();
    };

    registerCurrencyReaction = () => {
        // Syncs all trade options blocks' currency with the client's active currency.
        this.disposeCurrencyReaction = reaction(
            () => this.core.client.currency,
            () => {
                if (!window.Blockly?.derivWorkspace) return;

                void getScratchUtils().then(({ setCurrency }) => {
                    const trade_options_blocks = window.Blockly?.derivWorkspace
                        .getAllBlocks()
                        .filter(
                            b =>
                                b.type === 'trade_definition_tradeoptions' ||
                                b.type === 'trade_definition_multiplier' ||
                                b.type === 'trade_definition_accumulator' ||
                                (b.isDescendantOf('trade_definition_multiplier') && b.category_ === 'trade_parameters')
                        );

                    trade_options_blocks.forEach(trade_options_block => setCurrency(trade_options_block));
                });
            }
        );
    };

    registerOnAccountSwitch = () => {
        this.disposeSwitchAccountListener = reaction(
            () => this.root_store.common?.is_socket_opened,
            is_socket_opened => {
                if (!is_socket_opened) return;
                this.api_helpers_store = {
                    server_time: this.root_store.common.server_time,
                    ws: api_base.api,
                };

                ApiHelpers.setInstance(this.api_helpers_store);

                this.showDigitalOptionsMaltainvestError();

                const active_symbols = ApiHelpers?.instance?.active_symbols;
                const contracts_for = ApiHelpers?.instance?.contracts_for;

                if (ApiHelpers?.instance && active_symbols && contracts_for) {
                    if (window.Blockly?.derivWorkspace) {
                        void this.refreshTradeDefinitionBlocks(true);
                    }
                    void getDBot().then(DBot => DBot.initializeInterpreter());
                }
            }
        );
    };

    registerLandingCompanyChangeReaction = () => {
        const { client } = this.core;

        this.disposeLandingCompanyChangeReaction = reaction(
            () => client.landing_company_shortcode,
            () => this.handleErrorForEu()
        );
    };

    registerResidenceChangeReaction = () => {
        const { client } = this.core;

        this.disposeResidenceChangeReaction = reaction(
            () => client.account_settings?.country_code,
            () => this.handleErrorForEu()
        );
    };

    setDBotEngineStores = () => {
        const { flyout, toolbar, save_modal, dashboard, load_modal, run_panel, blockly_store, summary_card } =
            this.root_store;
        const { client, common } = this.core;
        const { handleFileChange } = load_modal;
        const { setLoading } = blockly_store;
        const { setContractUpdateConfig } = summary_card;
        const {
            ui: { is_mobile },
        } = this.core;

        this.dbot_store = {
            client,
            flyout,
            toolbar,
            save_modal,
            dashboard,
            load_modal,
            run_panel,
            setLoading,
            setContractUpdateConfig,
            handleFileChange,
            is_mobile,
            common,
        };

        this.api_helpers_store = {
            server_time: this.core.common.server_time,
            ws: api_base.api,
        };
    };

    onClickOutsideBlockly = (event: Event) => {
        if (document.querySelector('.injectionDiv')) {
            const path = event.path || (event.composedPath && event.composedPath());
            const is_click_outside_blockly = !path.some(
                (el: Element) => el.classList && el.classList.contains('injectionDiv')
            );

            if (is_click_outside_blockly) {
                window.Blockly?.hideChaff(/* allowToolbox */ false);
            }
        }
    };

    showDigitalOptionsMaltainvestError = () => {
        this.handleErrorForEu();
    };
}
