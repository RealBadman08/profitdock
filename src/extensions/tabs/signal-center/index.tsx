import React from 'react';
import { Text } from '@deriv-com/ui';
import './signal-center.scss';

const SignalCenter = () => {
    return (
        <div className='signal-center-page'>
            <div className='signal-center-page__header'>
                <Text size='xl' weight='bold'>
                    Signal Center
                </Text>
                <Text size='md' color='less-prominent'>
                    Real-time trading signals and market analysis
                </Text>
            </div>
            <div className='signal-center-page__content'>
                <div className='signal-center-page__placeholder'>
                    <Text size='lg'>Signal engine initializing...</Text>
                    {/* Placeholder for ProfitDocker signal logic replication */}
                </div>
            </div>
        </div>
    );
};

export default SignalCenter;
