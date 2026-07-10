import React from 'react';
import classNames from 'classnames';
import { TradeTypeIcon } from '@/components/trade-type/trade-type-icon';

type TIconProps = { className?: string; height?: number | string; width?: number | string };

const MatchtoolNavIcon = ({ className, height = 24, width = 24 }: TIconProps) => (
    <span
        aria-hidden='true'
        className={classNames('matchtool-nav-icon', className)}
        style={{ alignItems: 'center', display: 'inline-flex', height, justifyContent: 'center', width }}
    >
        <TradeTypeIcon type='DIGITMATCH' size='sm' />
    </span>
);

export default MatchtoolNavIcon;
