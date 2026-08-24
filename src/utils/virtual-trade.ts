/**
 * Virtual Trading Utility
 *
 * Routes trade execution through the local VirtualTradingEngine.
 * No Deriv Demo API is used — all settlement is done locally via tick stream.
 * Used by Corsa, Mesh, MatchTool and other manual trading pages.
 */

import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { mirrorCopyTradingContractParameters } from './copy-trading-execution';
import { virtualEngine } from './virtual-engine';

export const getActiveTransactionAccountId = () =>
    api_base.account_id || localStorage.getItem('active_loginid') || undefined;

type VirtualTradeParams = {
    contractType: string;
    currency: string;
    stake: number;
    symbol: string;
    barrier?: number | string;
    displayName?: string;
    duration?: number;
    /** Called with the simulated contract update (open then settled) */
    onUpdate: (contract: Record<string, unknown>) => void;
    /** Reference to dummy_balance getter */
    getDummyBalance: () => number;
    /** Setter for dummy balance */
    setDummyBalance: (val: number) => void;
};

/**
 * Simulate a virtual trade via the local VirtualTradingEngine.
 * Deducts stake immediately; credits payout on win after tick-based settlement.
 */
export const runVirtualTrade = async ({
    contractType,
    currency,
    stake,
    symbol,
    barrier,
    displayName,
    duration = 5,
    onUpdate,
    getDummyBalance,
    setDummyBalance,
}: VirtualTradeParams): Promise<number> => {
    try {
        // 1. Get a virtual quote
        const proposalReq: Record<string, any> = {
            proposal: 1,
            amount: stake,
            basis: 'stake',
            contract_type: contractType,
            currency,
            symbol,
            duration,
            duration_unit: 't',
        };
        if (barrier !== undefined) proposalReq.barrier = String(barrier);

        const proposalRes = await virtualEngine.handleRequest(proposalReq);
        if (!proposalRes?.proposal?.id) {
            console.error('[VirtualTrade] Proposal failed:', proposalRes);
            return -stake;
        }

        // 2. Buy the virtual contract
        const buyRes = await virtualEngine.handleRequest({
            buy: proposalRes.proposal.id,
            price: stake,
        });

        if (buyRes?.error) {
            console.error('[VirtualTrade] Buy failed:', buyRes.error);
            return 0;
        }

        const contractId = buyRes?.buy?.contract_id;
        if (!contractId) return 0;

        void mirrorCopyTradingContractParameters(proposalReq, 'virtual', `virtual:${contractId}`);

        // 3. Wait for settlement via the engine's event emitter
        return new Promise<number>((resolve) => {
            const unsubscribe = virtualEngine.subscribe((msg: any) => {
                if (msg?.msg_type !== 'proposal_open_contract') return;
                const contract = msg.proposal_open_contract;
                if (contract?.contract_id !== contractId) return;

                const mappedContract = {
                    ...contract,
                    accountID: getActiveTransactionAccountId(),
                    display_name: displayName || symbol,
                    longcode: contract.longcode,
                    transaction_ids: {
                        buy: contractId,
                        sell: contract.is_sold ? `${contractId}_sell` : undefined,
                    },
                };

                onUpdate(mappedContract);

                if (contract.is_sold) {
                    unsubscribe();
                    const profit = contract.profit ?? 0;

                    // Balance already updated by engine on win.
                    // On a partial refund (early sell with positive proceeds), sync:
                    if (profit < 0 && profit > -stake) {
                        setDummyBalance(getDummyBalance() + stake + profit);
                    }
                    resolve(profit);
                }
            });
        });
    } catch (e) {
        console.error('[VirtualTrade] Exception:', e);
        return 0;
    }
};
