import React from 'react';
import { Text } from '@deriv-com/ui';
import './fast-trader.scss';

const FastTrader = () => {
    return (
        <div className='fast-trader-page'>
            <div className='fast-trader-page__header'>
                <Text size='xl' weight='bold'>
                    Fast Trader
                </Text>
                <Text size='md' color='less-prominent'>
                    Rapid trade execution and instant results
                </Text>
            </div>
            <div className='fast-trader-page__content'>
                <div className='fast-trader-page__placeholder'>
                    <Text size='lg'>Fast Trader interface loading...</Text>
                    {/* Placeholder for ProfitDocker Fast Trader replication */}
                </div>
            </div>
        </div>
    );
};

export default FastTrader;
