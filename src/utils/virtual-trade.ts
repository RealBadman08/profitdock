/**
 * Virtual Trading Utility
 * 
 * Provides simulation of trades when Dummy/Virtual Mode is active.
 * Used by Corsa, Mesh, MatchTool, and other trading pages.
 * No real API calls are made — all settlement is simulated locally.
 */

import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { normalizeApiMessage } from '@/features/deriv-live/api';
import { demoProxy } from './demo-proxy';

export const getActiveTransactionAccountId = () =>
    api_base.account_id || localStorage.getItem('active_loginid') || undefined;

type VirtualTradeParams = {
    api: any;
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
 * Get the current live spot price from the Deriv tick subscription.
 * Falls back to undefined if not available.
 */
export const getLiveSpot = async (api: { send: (p: Record<string, unknown>) => Promise<Record<string, unknown>> }, symbol: string): Promise<string | undefined> => {
    try {
        const res = normalizeApiMessage<{ history?: { prices?: number[] } }>(
            await api.send({ ticks_history: symbol, end: 'latest', count: 1, style: 'ticks' })
        );
        const q = res?.history?.prices?.[0];
        return q !== undefined ? String(q) : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Simulate a virtual trade and update the transaction store.
 * Deducts stake immediately, then after simulated duration credits payout (50/50).
 */
export const runVirtualTrade = async ({
    api,
    contractType,
    currency,
    stake,
    symbol,
    barrier,
    displayName,
    duration = 1,
    onUpdate,
    getDummyBalance,
    setDummyBalance,
}: VirtualTradeParams): Promise<number> => {
    // Send proposal to Demo
    const proposalReq: Record<string, any> = {
        proposal: 1,
        amount: stake,
        basis: 'stake',
        contract_type: contractType,
        currency,
        symbol,
        duration: duration,
        duration_unit: 't'
    };
    if (barrier !== undefined) {
        proposalReq.barrier = String(barrier);
    }

    try {
        const proposalRes = await demoProxy.sendRequest(proposalReq);
        if (proposalRes.error) {
            console.error('Virtual Trade Proposal Error:', proposalRes.error);
            return -stake; // Fail gracefully
        }
        
        const proposalId = proposalRes.proposal.id;
        
        // Deduct stake from dummy balance
        setDummyBalance(getDummyBalance() - stake);

        // Buy on Demo
        const buyRes = await demoProxy.sendRequest({
            buy: proposalId,
            price: stake,
        });

        if (buyRes.error) {
            console.error('Virtual Trade Buy Error:', buyRes.error);
            setDummyBalance(getDummyBalance() + stake); // refund
            return 0;
        }

        const contractId = buyRes.buy.contract_id;
        
        return new Promise<number>((resolve) => {
            const unsubscribe = demoProxy.subscribe((msg: any) => {
                if (msg.msg_type === 'proposal_open_contract') {
                    const contract = msg.proposal_open_contract;
                    if (contract.contract_id === contractId) {
                        // Map demo contract back to our transaction store schema
                        const mappedContract = {
                            ...contract,
                            accountID: getActiveTransactionAccountId(),
                            display_name: displayName || symbol,
                            longcode: `Virtual Trade: ${contract.longcode}`,
                            transaction_ids: { buy: contractId, sell: contract.is_sold ? `${contractId}_sell` : undefined },
                        };
                        
                        onUpdate(mappedContract);
                        
                        if (contract.is_sold) {
                            unsubscribe();
                            
                            const profit = contract.profit;
                            if (profit > 0) {
                                // Add payout back to dummy balance
                                const payout = stake + profit;
                                setDummyBalance(getDummyBalance() + payout);
                            } else if (profit < 0 && profit > -stake) {
                                // Partial refund (e.g. sold early)
                                setDummyBalance(getDummyBalance() + stake + profit);
                            }
                            resolve(profit);
                        }
                    }
                }
            });
        });
    } catch (e) {
        console.error('Virtual Trade Demo Proxy Exception:', e);
        return 0;
    }
};
