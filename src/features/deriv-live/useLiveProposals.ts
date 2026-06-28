import { useEffect, useMemo, useRef, useState } from 'react';
import { isCustomLegacyOAuthDomain } from '@/components/shared/utils/config/config';
import { api_base } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import {
    getStoredProfitdockActiveCurrency,
    hasUsableProfitdockStoredSession,
} from '@/external/bot-skeleton/services/api/profitdock-oauth-session';
import { useApiBase } from '@/hooks/useApiBase';
import { getProposalStreamKey, normalizeApiMessage } from './api';
import { ProposalSnapshot, ProposalStreamState, TradeFamilyConfig } from './types';

type ProposalResponse = {
    msg_type?: string;
    error?: {
        message?: string;
    };
    echo_req?: {
        passthrough?: {
            streamKey?: string;
        };
    };
    proposal?: {
        ask_price?: number;
        display_value?: string;
        id?: string;
        longcode?: string;
        payout?: number;
        spot?: number;
    };
    subscription?: {
        id?: string;
    };
};

type UseLiveProposalsOptions = {
    barrierDigit: number;
    duration: number;
    stake: string;
    symbol: string;
    tradeFamily: TradeFamilyConfig;
};

const createInitialProposalState = (tradeFamily: TradeFamilyConfig) => {
    return tradeFamily.buttons.reduce<Record<string, ProposalStreamState>>((accumulator, button) => {
        accumulator[button.contractType] = {
            isLoading: true,
            error: null,
        };
        return accumulator;
    }, {});
};

const proposalFromResponse = (response: ProposalResponse): ProposalSnapshot | null => {
    if (!response.proposal?.id || typeof response.proposal.ask_price !== 'number' || typeof response.proposal.payout !== 'number') {
        return null;
    }

    return {
        askPrice: response.proposal.ask_price,
        payout: response.proposal.payout,
        displayValue: response.proposal.display_value ?? String(response.proposal.ask_price),
        proposalId: response.proposal.id,
        longcode: response.proposal.longcode,
        spot: response.proposal.spot,
    };
};

export const useLiveProposals = ({ barrierDigit, duration, stake, symbol, tradeFamily }: UseLiveProposalsOptions) => {
    const { authData, connectionStatus, isAuthorized } = useApiBase();
    const [proposals, setProposals] = useState<Record<string, ProposalStreamState>>(() => createInitialProposalState(tradeFamily));
    const [feedback, setFeedback] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const subscriptionIdsRef = useRef<Map<string, string>>(new Map());

    const hasRecoverableProfitdockSession = isCustomLegacyOAuthDomain() && hasUsableProfitdockStoredSession();
    const canTrade = isAuthorized || api_base.is_authorized;
    const currency = authData?.currency || getStoredProfitdockActiveCurrency() || 'USD';
    const numericStake = Number(stake);

    useEffect(() => {
        if (!hasRecoverableProfitdockSession || (connectionStatus === CONNECTION_STATUS.OPENED && api_base.is_authorized)) {
            return;
        }

        void api_base.init(true).catch(error => {
            console.warn('[ProfitDock Auth] Failed to recover the live proposal session before trading.', error);
        });
    }, [connectionStatus, hasRecoverableProfitdockSession]);

    useEffect(() => {
        setProposals(createInitialProposalState(tradeFamily));
    }, [tradeFamily]);

    useEffect(() => {
        if (!api_base.api || connectionStatus !== CONNECTION_STATUS.OPENED || !symbol || !Number.isFinite(numericStake) || numericStake <= 0 || duration <= 0) {
            return undefined;
        }

        let isCancelled = false;
        const api = api_base.api as {
            onMessage: () => { subscribe: (callback: (message: unknown) => void) => { unsubscribe: () => void } };
            send: (payload: unknown) => Promise<ProposalResponse>;
        };

        const forgetAll = async () => {
            const subscriptionEntries = Array.from(subscriptionIdsRef.current.entries());
            subscriptionIdsRef.current.clear();
            await Promise.all(
                subscriptionEntries.map(async ([, subscriptionId]) => {
                    try {
                        await api.send({ forget: subscriptionId });
                    } catch {
                        // Ignore proposal cleanup failures during reconnects.
                    }
                })
            );
        };

        const upsertProposal = (contractType: string, response: ProposalResponse) => {
            const nextProposal = proposalFromResponse(response);

            setProposals(previous => ({
                ...previous,
                [contractType]: {
                    ...previous[contractType],
                    error: response.error?.message ?? null,
                    isLoading: false,
                    proposal: nextProposal ?? previous[contractType]?.proposal,
                    subscriptionId: response.subscription?.id ?? previous[contractType]?.subscriptionId,
                },
            }));
        };

        const requestProposals = async () => {
            setFeedback(null);
            setProposals(createInitialProposalState(tradeFamily));
            await forgetAll();

            await Promise.all(
                tradeFamily.buttons.map(async button => {
                    const streamKey = getProposalStreamKey(button.contractType);
                    const requestPayload: Record<string, unknown> = {
                        amount: numericStake,
                        basis: 'stake',
                        contract_type: button.contractType,
                        currency,
                        duration,
                        duration_unit: 't',
                        passthrough: { streamKey },
                        proposal: 1,
                        subscribe: 1,
                        symbol,
                    };

                    if (tradeFamily.requiresBarrier) {
                        requestPayload.barrier = barrierDigit;
                    }

                    const response = await api.send(requestPayload);

                    if (response.subscription?.id) {
                        subscriptionIdsRef.current.set(button.contractType, response.subscription.id);
                    }

                    upsertProposal(button.contractType, response);
                })
            );
        };

        const messageSubscription = api.onMessage().subscribe((message: unknown) => {
            const data = normalizeApiMessage<ProposalResponse>(message);
            const streamKey = data?.echo_req?.passthrough?.streamKey;

            if (!data || data.msg_type !== 'proposal' || !streamKey) {
                return;
            }

            const contractType = streamKey.replace('proposal:', '');
            upsertProposal(contractType, data);
        });

        requestProposals().catch((caughtError: unknown) => {
            if (!isCancelled) {
                setFeedback(caughtError instanceof Error ? caughtError.message : 'Unable to load live proposals.');
                setProposals(previous => {
                    const nextState = { ...previous };
                    tradeFamily.buttons.forEach(button => {
                        nextState[button.contractType] = {
                            ...nextState[button.contractType],
                            error: caughtError instanceof Error ? caughtError.message : 'Unable to load live proposals.',
                            isLoading: false,
                        };
                    });
                    return nextState;
                });
            }
        });

        return () => {
            isCancelled = true;
            messageSubscription.unsubscribe();
            forgetAll();
        };
    }, [barrierDigit, connectionStatus, currency, duration, numericStake, symbol, tradeFamily]);

    const executeTrade = async (contractType: string) => {
        const activeProposal = proposals[contractType]?.proposal;

        if (!activeProposal) {
            setFeedback('The latest live quote is not ready yet.');
            return null;
        }

        let api = api_base.api as { send: (payload: unknown) => Promise<{ buy?: { contract_id?: number }; error?: { message?: string } }> } | null;

        if ((!api || !api_base.is_authorized) && hasRecoverableProfitdockSession) {
            try {
                await api_base.init(true);
                api = api_base.api as { send: (payload: unknown) => Promise<{ buy?: { contract_id?: number }; error?: { message?: string } }> } | null;
            } catch (error) {
                console.warn('[ProfitDock Auth] Failed to recover the live order session.', error);
            }
        }

        const canUseSession = api_base.is_authorized || api_base.has_authenticated_profitdock_socket;

        if (!api || !canUseSession) {
            setFeedback(
                hasRecoverableProfitdockSession
                    ? 'ProfitDock is still reconnecting to your Deriv trading session. Please try again in a moment.'
                    : 'Log in to a Deriv account before sending a live order.'
            );
            return null;
        }

        setFeedback(null);
        setIsSubmitting(true);

        try {
            const response = await api.send({
                buy: activeProposal.proposalId,
                price: String(activeProposal.askPrice),
            });

            if (response?.error) {
                throw new Error(response.error.message || 'Trade execution failed.');
            }

            setFeedback(`Order sent successfully. Contract #${response.buy?.contract_id ?? 'pending'}.`);
            return response;
        } catch (caughtError) {
            setFeedback(caughtError instanceof Error ? caughtError.message : 'Trade execution failed.');
            return null;
        } finally {
            setIsSubmitting(false);
        }
    };

    return useMemo(
        () => ({
            currency,
            executeTrade,
            feedback,
            isAuthorized: canTrade,
            isSubmitting,
            proposals,
            setFeedback,
        }),
        [canTrade, currency, feedback, isSubmitting, proposals]
    );
};
