import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { isAccumulatorContract, isMultiplierContract } from '@/components/shared';
import Text from '@/components/shared_ui/text';
import { getContractTypeDisplay } from '@/constants/contract';
import { contract_stages } from '@/constants/contract-stage';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import ContractCardLoader from '../contract-card-loading';
import { getCardLabels } from '../shared';
import ContractCard from '../shared_ui/contract-card';
import { TContractInfo, TSummaryCardProps } from './summary-card.types';

const getSummaryContractKey = (contract: TContractInfo, index: number) =>
    String(
        contract.contract_id ||
            (contract as TContractInfo & { id?: number | string }).id ||
            contract.transaction_ids?.buy ||
            contract.transaction_ids?.sell ||
            index
    );

const SummaryCard = observer(
    ({ contract_cards = [], contract_info, is_contract_loading, is_bot_running }: TSummaryCardProps) => {
        const { summary_card, run_panel, ui, common } = useStore();
        const { is_contract_completed, is_contract_inactive, setIsBotRunning } = summary_card;
        const { onClickSell, is_sell_requested, contract_stage } = run_panel;
        const { addToast, current_focus, removeToast, setCurrentFocus } = ui;
        const { server_time } = common;

        const { isDesktop } = useDevice();
        const visible_contracts = contract_cards.length ? contract_cards : contract_info ? [contract_info] : [];

        React.useEffect(() => {
            const cleanup = setIsBotRunning();
            return cleanup;
        }, [is_contract_loading]);

        const renderContractCard = (contract: TContractInfo, index: number) => {
            const is_card_multiplier = isMultiplierContract(contract.contract_type);
            const is_card_accumulator = isAccumulatorContract(contract.contract_type);
            const is_card_completed =
                !!contract.is_sold && run_panel.contract_stage !== contract_stages.PURCHASE_RECEIVED;

            const card_header = (
                <ContractCard.Header
                    contract_info={contract}
                    getCardLabels={getCardLabels}
                    getContractTypeDisplay={getContractTypeDisplay}
                    has_progress_slider={!is_card_multiplier}
                    is_sold={is_card_completed}
                    onClickSell={onClickSell}
                    server_time={server_time}
                />
            );

            const card_body = (
                <ContractCard.Body
                    addToast={addToast}
                    contract_info={contract}
                    currency={contract?.currency ?? ''}
                    current_focus={current_focus}
                    error_message_alignment='left'
                    getCardLabels={getCardLabels}
                    getContractById={() => summary_card}
                    is_mobile={!isDesktop}
                    is_multiplier={is_card_multiplier}
                    is_accumulator={is_card_accumulator}
                    is_sold={is_card_completed}
                    removeToast={removeToast}
                    server_time={server_time}
                    setCurrentFocus={setCurrentFocus}
                />
            );

            const card_footer = (
                <ContractCard.Footer
                    contract_info={contract}
                    getCardLabels={getCardLabels}
                    is_multiplier={is_card_multiplier}
                    is_sell_requested={is_sell_requested}
                    onClickSell={onClickSell}
                />
            );

            return (
                <ContractCard
                    contract_info={contract}
                    getCardLabels={getCardLabels}
                    is_multiplier={is_card_multiplier}
                    key={getSummaryContractKey(contract, index)}
                    profit_loss={contract.profit}
                    should_show_result_overlay={true}
                >
                    <div
                        className={classNames('dc-contract-card', {
                            'dc-contract-card--green': contract.profit > 0,
                            'dc-contract-card--red': contract.profit < 0,
                        })}
                    >
                        {card_header}
                        {card_body}
                        {card_footer}
                    </div>
                </ContractCard>
            );
        };

        return (
            <div
                className={classNames('db-summary-card', {
                    'db-summary-card--mobile': !isDesktop,
                    'db-summary-card--inactive': is_contract_inactive && !is_contract_loading && !visible_contracts.length,
                    'db-summary-card--completed': is_contract_completed,
                    'db-summary-card--completed-mobile': is_contract_completed && !isDesktop,
                    'db-summary-card--delayed-loading': is_bot_running,
                })}
                data-testid='dt_mock_summary_card'
            >
                {is_contract_loading && !is_bot_running && !visible_contracts.length && <ContractCardLoader speed={2} />}
                {is_bot_running && !visible_contracts.length && (
                    <ContractCardLoader speed={2} contract_stage={contract_stage} />
                )}
                {!!visible_contracts.length && (
                    <div className='db-summary-card__contracts'>
                        {visible_contracts.map((contract, index) => renderContractCard(contract, index))}
                    </div>
                )}
                {!is_contract_loading && !visible_contracts.length && !is_bot_running && (
                    <Text as='p' align='center' lineHeight='s' size='xs'>
                        {localize('When you’re ready to trade, hit ')}
                        <strong className='summary-panel-inactive__strong'>{localize('Run')}</strong>
                        {localize('. You’ll be able to track your bot’s performance here.')}
                    </Text>
                )}
            </div>
        );
    }
);

export default SummaryCard;
