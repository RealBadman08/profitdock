import React from 'react';
import classNames from 'classnames';
import './accumulators-nav-icon.scss';

type TIconProps = { className?: string; height?: number | string; width?: number | string };

const AccumulatorsNavIcon = ({ className, height = 24, width = 24 }: TIconProps) => (
    <svg aria-hidden='true' className={classNames('accumulators-nav-icon', className)} fill='none' height={height} viewBox='0 0 24 24' width={width} xmlns='http://www.w3.org/2000/svg'>
        <path className='accumulators-nav-icon__box' d='M4 8.2L12 3.8L20 8.2V15.8L12 20.2L4 15.8V8.2Z' />
        <path className='accumulators-nav-icon__edge accumulators-nav-icon__edge--one' d='M4.4 8.4L12 12.7L19.6 8.4' />
        <path className='accumulators-nav-icon__edge accumulators-nav-icon__edge--two' d='M12 12.7V20' />
        <path className='accumulators-nav-icon__spark accumulators-nav-icon__spark--one' d='M7.3 5.2L8.2 3.6L9.1 5.2L10.8 6L9.1 6.8L8.2 8.4L7.3 6.8L5.6 6L7.3 5.2Z' />
        <path className='accumulators-nav-icon__spark accumulators-nav-icon__spark--two' d='M17.1 15.3L17.7 14.2L18.3 15.3L19.4 15.9L18.3 16.5L17.7 17.6L17.1 16.5L16 15.9L17.1 15.3Z' />
    </svg>
);

export default AccumulatorsNavIcon;
