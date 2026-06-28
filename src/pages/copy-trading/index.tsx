import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import type { CopyTradingStartRequest } from '@deriv/api-types';
import './copy-trading.scss';

type TCopyTradingApi = {
    send: (payload: unknown) => Promise<Record<string, unknown> & { error?: { message?: string } }>;
};

type TNotice = {
    message: string;
    tone: 'error' | 'success';
} | null;

type TSavedToken = {
    id: string;
    value: string;
};

const MAX_COPY_TOKENS = 20;

const getCopyTradingApi = async () => {
    if (!api_base.api) {
        await api_base.init();
    }

    const api = api_base.api as unknown as TCopyTradingApi | null;

    if (!api) {
        throw new Error('The Deriv connection is not ready yet.');
    }

    return api;
};

const maskToken = (token: string) => {
    if (token.length <= 10) {
        return token;
    }

    return `${token.slice(0, 6)}...${token.slice(-4)}`;
};

const buildTokenId = () => `copy-token-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const CopyTrading = observer(() => {
    const { activeLoginid, connectionStatus, isAuthorized, isAuthorizing } = useApiBase();
    const [tokenInput, setTokenInput] = useState('');
    const [savedTokens, setSavedTokens] = useState<TSavedToken[]>([]);
    const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
    const [notice, setNotice] = useState<TNotice>(null);

    const canStartCopyTrading = isAuthorized && connectionStatus === CONNECTION_STATUS.OPENED;
    const tokenLimitReached = savedTokens.length >= MAX_COPY_TOKENS;
    const normalizedInput = tokenInput.trim();

    useEffect(() => {
        if (!notice) {
            return undefined;
        }

        const timeout = window.setTimeout(() => setNotice(null), 5000);
        return () => window.clearTimeout(timeout);
    }, [notice]);

    const hasDuplicateInput = useMemo(
        () => savedTokens.some(token => token.value.toLowerCase() === normalizedInput.toLowerCase()),
        [normalizedInput, savedTokens]
    );

    const handleAddToken = () => {
        if (!normalizedInput) {
            setNotice({ message: 'Enter the API token you want to add.', tone: 'error' });
            return;
        }

        if (hasDuplicateInput) {
            setNotice({ message: 'That API token is already in the list.', tone: 'error' });
            return;
        }

        if (tokenLimitReached) {
            setNotice({ message: 'You can save up to 20 API tokens here.', tone: 'error' });
            return;
        }

        setSavedTokens(previous => [...previous, { id: buildTokenId(), value: normalizedInput }]);
        setTokenInput('');
        setNotice({ message: 'API token added.', tone: 'success' });
    };

    const handleRemoveToken = (tokenId: string) => {
        setSavedTokens(previous => previous.filter(token => token.id !== tokenId));
    };

    const handleStartCopy = async (tokenValue: string) => {
        const token = tokenValue.trim();

        if (!token) {
            setNotice({ message: 'Enter the API token you want to copy.', tone: 'error' });
            return;
        }

        if (!canStartCopyTrading) {
            setNotice({ message: 'Authorize a Deriv account first before starting copy trading.', tone: 'error' });
            return;
        }

        setIsSubmitting(token);

        try {
            const api = await getCopyTradingApi();
            const payload: CopyTradingStartRequest = {
                copy_start: token,
                ...(activeLoginid ? { loginid: activeLoginid } : {}),
            };

            const response = await api.send(payload);

            if (response.error) {
                throw new Error(response.error.message || 'Unable to start copy trading.');
            }

            setNotice({ message: 'Copy trading started successfully.', tone: 'success' });
        } catch (error) {
            setNotice({
                message: error instanceof Error ? error.message : 'Unable to start copy trading.',
                tone: 'error',
            });
        } finally {
            setIsSubmitting(null);
        }
    };

    return (
        <div className='copy-trading'>
            <section className='copy-trading__panel'>
                <div className='copy-trading__composer'>
                    <label className='copy-trading__field'>
                        <span>API token</span>
                        <input
                            autoComplete='off'
                            onChange={event => setTokenInput(event.target.value)}
                            placeholder='Paste trader API token'
                            type='text'
                            value={tokenInput}
                        />
                    </label>

                    <button
                        className='copy-trading__button copy-trading__button--secondary'
                        disabled={isAuthorizing || tokenLimitReached}
                        onClick={handleAddToken}
                        type='button'
                    >
                        {tokenLimitReached ? 'Token limit reached' : 'Add token'}
                    </button>
                </div>

                <div className='copy-trading__token-count'>{savedTokens.length} / {MAX_COPY_TOKENS} tokens saved</div>

                <div className='copy-trading__token-list'>
                    {savedTokens.length ? (
                        savedTokens.map(token => (
                            <div className='copy-trading__token-row' key={token.id}>
                                <div className='copy-trading__token-value'>
                                    <strong>{maskToken(token.value)}</strong>
                                </div>

                                <div className='copy-trading__token-actions'>
                                    <button
                                        className='copy-trading__button'
                                        disabled={isSubmitting !== null || isAuthorizing}
                                        onClick={() => void handleStartCopy(token.value)}
                                        type='button'
                                    >
                                        {isSubmitting === token.value ? 'Starting...' : 'Start copy trading'}
                                    </button>

                                    <button
                                        className='copy-trading__remove'
                                        disabled={isSubmitting !== null}
                                        onClick={() => handleRemoveToken(token.id)}
                                        type='button'
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className='copy-trading__empty'>Add up to 20 trader API tokens, then start copy trading from the one you want.</div>
                    )}
                </div>

                {notice ? <div className={`copy-trading__notice copy-trading__notice--${notice.tone}`}>{notice.message}</div> : null}
            </section>
        </div>
    );
});

export default CopyTrading;
