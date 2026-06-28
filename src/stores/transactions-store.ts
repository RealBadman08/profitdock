import { action, computed, makeObservable, observable, reaction } from 'mobx';
import { formatDate, isEnded } from '@/components/shared';
import { LogTypes } from '@/external/bot-skeleton/constants/messages';
import { ProposalOpenContract } from '@deriv/api-types';
import { TPortfolioPosition, TStores } from '@deriv/stores/types';
import { TContractInfo } from '../components/summary/summary-card.types';
import { transaction_elements } from '../constants/transactions';
import { getStoredItemsByKey, getStoredItemsByUser, setStoredItemsByKey } from '../utils/session-storage';
import RootStore from './root-store';

type TTransaction = {
    type: string;
    data?: string | TContractInfo;
};

type TElement = {
    [key: string]: TTransaction[];
};

const isPresent = (value: unknown) => value !== undefined && value !== null && value !== '';

const pickPresent = <T,>(...values: T[]) => values.find(isPresent);

const toNumber = (value: unknown) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};

const formatDateValue = (value: unknown) => {
    if (!isPresent(value)) return undefined;
    return formatDate(value as number | string, 'YYYY-M-D HH:mm:ss [GMT]');
};

const isContractCompleted = (data: TContractInfo) => {
    const raw_data = data as TContractInfo & {
        is_expired?: number | boolean;
        is_sold?: number | boolean;
        sell_price?: number | string;
        status?: string;
    };

    return Boolean(
        isEnded(data as ProposalOpenContract) ||
            raw_data.is_sold === 1 ||
            raw_data.is_sold === true ||
            raw_data.is_expired === 1 ||
            raw_data.is_expired === true ||
            raw_data.status === 'sold' ||
            raw_data.status === 'won' ||
            raw_data.status === 'lost' ||
            isPresent(raw_data.sell_price)
    );
};

const getContractBuyPrice = (data: TContractInfo, previous_contract?: TContractInfo) => {
    const raw_data = data as TContractInfo & {
        buy_price?: number | string;
    };

    return toNumber(raw_data.buy_price) ?? toNumber(previous_contract?.buy_price) ?? 0;
};

const getContractExitPrice = (data: TContractInfo, previous_contract?: TContractInfo) => {
    const raw_data = data as TContractInfo & {
        bid_price?: number | string;
        payout?: number | string;
        sell_price?: number | string;
    };
    const previous_data = previous_contract as
        | (TContractInfo & {
              bid_price?: number | string;
              payout?: number | string;
              sell_price?: number | string;
          })
        | undefined;

    return (
        toNumber(raw_data.sell_price) ??
        toNumber(raw_data.payout) ??
        toNumber(raw_data.bid_price) ??
        toNumber(previous_data?.sell_price) ??
        toNumber(previous_data?.payout) ??
        toNumber(previous_data?.bid_price) ??
        0
    );
};

const getFallbackProfit = (data: TContractInfo, previous_contract?: TContractInfo) => {
    const raw_data = data as TContractInfo & {
        bid_price?: number | string;
        buy_price?: number | string;
        payout?: number | string;
        profit?: number | string;
        sell_price?: number | string;
    };
    const direct_profit = toNumber(raw_data.profit);

    if (direct_profit !== undefined) {
        return direct_profit;
    }

    const sell_price = getContractExitPrice(data, previous_contract);
    const buy_price = getContractBuyPrice(data, previous_contract);

    if (buy_price > 0 || sell_price > 0) {
        return sell_price - buy_price;
    }

    return toNumber(previous_contract?.profit) ?? 0;
};

export default class TransactionsStore {
    root_store: RootStore;
    core: TStores;
    disposeReactionsFn: () => void;

    constructor(root_store: RootStore, core: TStores) {
        this.root_store = root_store;
        this.core = core;
        this.is_transaction_details_modal_open = false;
        this.disposeReactionsFn = this.registerReactions();

        makeObservable(this, {
            elements: observable,
            active_transaction_id: observable,
            recovered_completed_transactions: observable,
            recovered_transactions: observable,
            is_called_proposal_open_contract: observable,
            is_transaction_details_modal_open: observable,
            transactions: computed,
            onBotContractEvent: action.bound,
            pushTransaction: action.bound,
            clear: action.bound,
            registerReactions: action.bound,
            recoverPendingContracts: action.bound,
            updateResultsCompletedContract: action.bound,
            sortOutPositionsBeforeAction: action.bound,
            recoverPendingContractsById: action.bound,
        });
    }
    TRANSACTION_CACHE = 'transaction_cache';

    elements: TElement = getStoredItemsByUser(this.TRANSACTION_CACHE, this.core?.client?.loginid, []);
    active_transaction_id: null | number = null;
    recovered_completed_transactions: number[] = [];
    recovered_transactions: number[] = [];
    is_called_proposal_open_contract = false;
    is_transaction_details_modal_open = false;

    get transactions(): TTransaction[] {
        if (this.core?.client?.loginid) return this.elements[this.core?.client?.loginid] ?? [];
        return [];
    }

    get statistics() {
        let total_runs = 0;
        // Filter out only contract transactions and remove dividers
        const trxs = this.transactions.filter(
            trx => trx.type === transaction_elements.CONTRACT && typeof trx.data === 'object'
        );
        const statistics = trxs.reduce(
            (stats, { data }) => {
                const { is_completed = false } = data as TContractInfo;
                if (is_completed) {
                    const buy_price = getContractBuyPrice(data as TContractInfo);
                    const payout = getContractExitPrice(data as TContractInfo);
                    const profit = getFallbackProfit(data as TContractInfo);

                    if (profit > 0) {
                        stats.won_contracts += 1;
                    } else {
                        stats.lost_contracts += 1;
                    }
                    stats.total_profit += profit;
                    stats.total_payout += payout;
                    stats.total_stake += buy_price;
                    total_runs += 1;
                }
                return stats;
            },
            {
                lost_contracts: 0,
                number_of_runs: 0,
                total_profit: 0,
                total_payout: 0,
                total_stake: 0,
                won_contracts: 0,
            }
        );
        statistics.number_of_runs = total_runs;
        return statistics;
    }

    toggleTransactionDetailsModal = (is_open: boolean) => {
        this.is_transaction_details_modal_open = is_open;
    };

    onBotContractEvent(data: TContractInfo) {
        this.pushTransaction(data);
    }

    pushTransaction(data: TContractInfo) {
        const { run_id } = this.root_store.run_panel;
        const current_account = (this.core?.client?.loginid || data.accountID || 'default') as string;
        const raw_data = data as TContractInfo & {
            current_spot?: number | string;
            current_spot_display_value?: number | string;
            entry_spot?: number | string;
            entry_spot_display_value?: number | string;
            exit_spot?: number | string;
            exit_spot_display_value?: number | string;
            sell_time?: number | string;
            status?: string;
        };

        if (!this.elements[current_account]) {
            this.elements = {
                ...this.elements,
                [current_account]: [],
            };
        }

        const same_contract_index = this.elements[current_account]?.findIndex(c => {
            if (typeof c.data === 'string') return false;
            const previous_data = c.data as TContractInfo;

            if (data.contract_id && previous_data.contract_id === data.contract_id) {
                return true;
            }

            return (
                c.type === transaction_elements.CONTRACT &&
                c.data?.transaction_ids &&
                c.data.transaction_ids.buy === data.transaction_ids?.buy
            );
        });
        const previous_contract =
            same_contract_index > -1 && typeof this.elements[current_account]?.[same_contract_index]?.data === 'object'
                ? (this.elements[current_account]?.[same_contract_index]?.data as TContractInfo)
                : undefined;
        const is_completed = isContractCompleted(data);
        const entry_tick = pickPresent(
            data.entry_tick_display_value,
            data.entry_tick,
            raw_data.entry_spot_display_value,
            raw_data.entry_spot,
            previous_contract?.entry_tick
        );
        const exit_tick = pickPresent(
            data.exit_tick_display_value,
            data.exit_tick,
            raw_data.exit_spot_display_value,
            raw_data.exit_spot,
            is_completed ? raw_data.current_spot_display_value : undefined,
            is_completed ? raw_data.current_spot : undefined,
            previous_contract?.exit_tick
        );
        const entry_tick_time = formatDateValue(data.entry_tick_time) ?? previous_contract?.entry_tick_time;
        const exit_tick_time =
            formatDateValue(data.exit_tick_time) ??
            formatDateValue(raw_data.sell_time) ??
            (is_completed ? formatDateValue(data.date_expiry) : undefined) ??
            previous_contract?.exit_tick_time;
        const profit = is_completed ? getFallbackProfit(data, previous_contract) : getFallbackProfit(data, previous_contract);

        const contract: TContractInfo = {
            ...previous_contract,
            ...data,
            is_completed,
            run_id,
            date_start: formatDateValue(data.date_start) ?? previous_contract?.date_start,
            entry_tick,
            entry_tick_time,
            exit_tick,
            exit_tick_time,
            profit,
            status: raw_data.status || (is_completed ? 'sold' : previous_contract?.status),
            transaction_ids: data.transaction_ids || previous_contract?.transaction_ids,
        };

        if (same_contract_index === -1) {
            // Render a divider if the "run_id" for this contract is different.
            if (this.elements[current_account]?.length > 0) {
                const temp_contract = this.elements[current_account]?.[0];
                const is_contract = temp_contract.type === transaction_elements.CONTRACT;
                const is_new_run =
                    is_contract &&
                    typeof temp_contract.data === 'object' &&
                    contract.run_id !== temp_contract?.data?.run_id;

                if (is_new_run) {
                    this.elements[current_account]?.unshift({
                        type: transaction_elements.DIVIDER,
                        data: contract.run_id,
                    });
                }
            }

            this.elements[current_account]?.unshift({
                type: transaction_elements.CONTRACT,
                data: contract,
            });
        } else {
            // If data belongs to existing contract in memory, update it.
            this.elements[current_account]?.splice(same_contract_index, 1, {
                type: transaction_elements.CONTRACT,
                data: contract,
            });
        }

        this.elements = { ...this.elements }; // force update
    }

    clear() {
        if (this.elements && this.elements[this.core?.client?.loginid as string]?.length > 0) {
            this.elements[this.core?.client?.loginid as string] = [];
        }
        this.recovered_completed_transactions = this.recovered_completed_transactions?.slice(0, 0);
        this.recovered_transactions = this.recovered_transactions?.slice(0, 0);
        this.is_transaction_details_modal_open = false;
    }

    registerReactions() {
        const { client } = this.core;

        // Write transactions to session storage on each change in transaction elements.
        const disposeTransactionElementsListener = reaction(
            () => this.elements[client?.loginid as string],
            elements => {
                const stored_transactions = getStoredItemsByKey(this.TRANSACTION_CACHE, {});
                stored_transactions[client.loginid as string] = elements?.slice(0, 5000) ?? [];
                setStoredItemsByKey(this.TRANSACTION_CACHE, stored_transactions);
            }
        );

        // User could've left the page mid-contract. On initial load, try
        // to recover any pending contracts so we can reflect accurate stats
        // and transactions.
        const disposeRecoverContracts = reaction(
            () => this.transactions.length,
            () => this.recoverPendingContracts()
        );

        return () => {
            disposeTransactionElementsListener();
            disposeRecoverContracts();
        };
    }

    recoverPendingContracts(contract = null) {
        this.transactions.forEach(({ data: trx }) => {
            if (
                typeof trx === 'string' ||
                trx?.is_completed ||
                !trx?.contract_id ||
                this.recovered_transactions.includes(trx?.contract_id)
            )
                return;
            this.recoverPendingContractsById(trx.contract_id, contract);
        });
    }

    updateResultsCompletedContract(contract: ProposalOpenContract) {
        const { journal, summary_card } = this.root_store;
        const { contract_info } = summary_card;
        const { currency, profit } = contract;

        if (contract.contract_id !== contract_info?.contract_id) {
            this.onBotContractEvent(contract);

            if (contract.contract_id && !this.recovered_transactions.includes(contract.contract_id)) {
                this.recovered_transactions.push(contract.contract_id);
            }
            if (
                contract.contract_id &&
                !this.recovered_completed_transactions.includes(contract.contract_id) &&
                isEnded(contract)
            ) {
                this.recovered_completed_transactions.push(contract.contract_id);

                journal.onLogSuccess({
                    log_type: profit && profit > 0 ? LogTypes.PROFIT : LogTypes.LOST,
                    extra: { currency, profit },
                });
            }
        }
    }

    sortOutPositionsBeforeAction(positions: TPortfolioPosition[], element_id?: number) {
        positions?.forEach(position => {
            if (!element_id || (element_id && position.id === element_id)) {
                const contract_details = position.contract_info;
                this.updateResultsCompletedContract(contract_details);
            }
        });
    }

    async recoverPendingContractsById(contract_id: number, contract: ProposalOpenContract | null = null) {
        // TODO: need to fix as the portfolio is not available now
        // const positions = this.core.portfolio.positions;
        const positions: unknown[] = [];

        if (contract) {
            this.is_called_proposal_open_contract = true;
            if (contract.contract_id === contract_id) {
                this.updateResultsCompletedContract(contract);
            }
        }

        if (!this.is_called_proposal_open_contract) {
            if (this.core?.client?.loginid) {
                const current_account = this.core?.client?.loginid;
                if (!this.elements[current_account]?.length) {
                    this.sortOutPositionsBeforeAction(positions);
                }

                const elements = this.elements[current_account];
                const [element = null] = elements;
                if (typeof element?.data === 'object' && !element?.data?.profit) {
                    const element_id = element.data.contract_id;
                    this.sortOutPositionsBeforeAction(positions, element_id);
                }
            }
        }
    }
}
