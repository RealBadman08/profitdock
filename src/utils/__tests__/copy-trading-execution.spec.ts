import {
    __copyTradingExecutionInternals,
    cacheCopyTradingProposalFromRequest,
    mirrorCopyTradingBuyFromRequest,
    mirrorCopyTradingContractParameters,
    normalizeCopyTradingContractParameters,
} from '../copy-trading-execution';

const { normalizeBulkPurchaseContractParameters } = require('../../../server/copy-trading-store.cjs');
const mockGetProfitdockOAuthToken = jest.fn(() => 'owner-oauth-token');

jest.mock('@/external/bot-skeleton/services/api/profitdock-oauth-session', () => ({
    getActiveProfitdockLoginId: jest.fn(() => 'CR1234567'),
    getProfitdockOAuthToken: () => mockGetProfitdockOAuthToken(),
}));

const fetchMock = jest.fn();

describe('copy-trading-execution', () => {
    beforeEach(() => {
        __copyTradingExecutionInternals.clear();
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            json: () => Promise.resolve({ result: { transactions: [] } }),
            ok: true,
            status: 200,
        });
        global.fetch = fetchMock;
        mockGetProfitdockOAuthToken.mockReturnValue('owner-oauth-token');
    });

    it('normalizes legacy symbol proposal fields for the new copy-trading endpoint', () => {
        expect(
            normalizeCopyTradingContractParameters({
                amount: 1,
                basis: 'stake',
                contract_type: 'DIGITOVER',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                loginid: 'CR1234567',
                proposal: 1,
                symbol: '1HZ100V',
            })
        ).toEqual({
            amount: 1,
            basis: 'stake',
            contract_type: 'DIGITOVER',
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            underlying_symbol: '1HZ100V',
        });
    });

    it('mirrors a successful proposal-id buy to enabled copy-trading accounts', async () => {
        cacheCopyTradingProposalFromRequest(
            {
                amount: 0.35,
                barrier: '5',
                basis: 'stake',
                contract_type: 'DIGITUNDER',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                proposal: 1,
                symbol: '1HZ75V',
            },
            {
                proposal: {
                    id: 'proposal-1',
                },
            }
        );

        await mirrorCopyTradingBuyFromRequest(
            {
                buy: 'proposal-1',
                price: '0.35',
            },
            {
                buy: {
                    contract_id: 991,
                },
            },
            'demo'
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/copy-trading/bulk-purchase',
            expect.objectContaining({
                credentials: 'include',
                headers: expect.objectContaining({
                    Authorization: 'Bearer owner-oauth-token',
                    'Content-Type': 'application/json',
                }),
                method: 'POST',
            })
        );
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            contract_parameters: {
                amount: 0.35,
                barrier: '5',
                basis: 'stake',
                contract_type: 'DIGITUNDER',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                underlying_symbol: '1HZ75V',
            },
            source_account_type: 'demo',
        });
    });

    it('mirrors a successful direct buy with parameters', async () => {
        await mirrorCopyTradingBuyFromRequest(
            {
                buy: '1',
                parameters: {
                    amount: 1,
                    basis: 'stake',
                    contract_type: 'CALL',
                    currency: 'USD',
                    duration: 5,
                    duration_unit: 't',
                    underlying_symbol: 'R_100',
                },
                price: '1',
            },
            {
                buy: {
                    contract_id: 992,
                },
            },
            'real'
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            contract_parameters: {
                amount: 1,
                basis: 'stake',
                contract_type: 'CALL',
                currency: 'USD',
                duration: 5,
                duration_unit: 't',
                underlying_symbol: 'R_100',
            },
            source_account_type: 'real',
        });
    });

    it('mirrors a wrapped new-api buy response with passthrough metadata', async () => {
        await mirrorCopyTradingBuyFromRequest(
            {
                buy: '1',
                parameters: {
                    amount: 0.5,
                    basis: 'stake',
                    contract_type: 'DIGITEVEN',
                    currency: 'USD',
                    duration: 1,
                    duration_unit: 't',
                    symbol: '1HZ10V',
                },
                passthrough: {
                    purchase_reference: 'bot-builder-ref-1',
                },
                price: '0.5',
            },
            {
                data: {
                    buy: {
                        id: 'new-api-contract-1',
                    },
                },
            },
            'real'
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            contract_parameters: {
                amount: 0.5,
                basis: 'stake',
                contract_type: 'DIGITEVEN',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                underlying_symbol: '1HZ10V',
            },
            source_account_type: 'real',
        });
    });

    it('does not duplicate a mirrored contract id', async () => {
        await mirrorCopyTradingContractParameters(
            {
                amount: 1,
                basis: 'stake',
                contract_type: 'CALL',
                currency: 'USD',
                duration: 5,
                duration_unit: 't',
                underlying_symbol: 'R_100',
            },
            'real',
            'real:contract-1'
        );
        await mirrorCopyTradingContractParameters(
            {
                amount: 1,
                basis: 'stake',
                contract_type: 'CALL',
                currency: 'USD',
                duration: 5,
                duration_unit: 't',
                underlying_symbol: 'R_100',
            },
            'real',
            'real:contract-1'
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('still mirrors when OAuth is only available through the HttpOnly session cookie', async () => {
        mockGetProfitdockOAuthToken.mockReturnValue('');

        await mirrorCopyTradingContractParameters(
            {
                amount: 1,
                basis: 'stake',
                contract_type: 'CALL',
                currency: 'USD',
                duration: 5,
                duration_unit: 't',
                underlying_symbol: 'R_100',
            },
            'demo',
            'demo:cookie-only-contract'
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/copy-trading/bulk-purchase',
            expect.objectContaining({
                credentials: 'include',
                headers: expect.not.objectContaining({
                    Authorization: expect.any(String),
                }),
                method: 'POST',
            })
        );
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            contract_parameters: {
                amount: 1,
                basis: 'stake',
                contract_type: 'CALL',
                currency: 'USD',
                duration: 5,
                duration_unit: 't',
                underlying_symbol: 'R_100',
            },
            source_account_type: 'demo',
        });
    });

    it('converts copied websocket parameters to Deriv bulk-purchase symbol parameters', () => {
        expect(
            normalizeBulkPurchaseContractParameters(
                {
                    amount: 1,
                    basis: 'stake',
                    contract_type: 'DIGITOVER',
                    currency: 'USD',
                    duration: 1,
                    duration_unit: 't',
                    underlying_symbol: '1HZ100V',
                },
                'symbol'
            )
        ).toEqual({
            amount: 1,
            basis: 'stake',
            contract_type: 'DIGITOVER',
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            symbol: '1HZ100V',
        });
    });
});
