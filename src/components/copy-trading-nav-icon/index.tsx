import React from 'react';
import classNames from 'classnames';
import './copy-trading-nav-icon.scss';

type TCopyTradingNavIconProps = {
    className?: string;
    height?: number | string;
    width?: number | string;
};

const CopyTradingNavIcon = ({ className, height = 24, width = 24 }: TCopyTradingNavIconProps) => {
    return (
        <svg
            aria-hidden='true'
            className={classNames('copy-trading-nav-icon', className)}
            fill='none'
            height={height}
            viewBox='0 0 24 24'
            width={width}
            xmlns='http://www.w3.org/2000/svg'
        >
            <circle className='copy-trading-nav-icon__loop copy-trading-nav-icon__loop--left' cx='9.2' cy='12' r='5.1' />
            <circle className='copy-trading-nav-icon__loop copy-trading-nav-icon__loop--right' cx='14.8' cy='12' r='5.1' />
            <ellipse className='copy-trading-nav-icon__blend' cx='12' cy='12' rx='3.2' ry='5.1' />
            <path className='copy-trading-nav-icon__spark copy-trading-nav-icon__spark--top' d='M12 4.2V6.3' />
            <path className='copy-trading-nav-icon__spark copy-trading-nav-icon__spark--right' d='M19.8 12H17.7' />
            <path className='copy-trading-nav-icon__spark copy-trading-nav-icon__spark--bottom' d='M12 19.8V17.7' />
            <path className='copy-trading-nav-icon__spark copy-trading-nav-icon__spark--left' d='M4.2 12H6.3' />
            <circle className='copy-trading-nav-icon__orb copy-trading-nav-icon__orb--one' cx='9.2' cy='12' r='0.85' />
            <circle className='copy-trading-nav-icon__orb copy-trading-nav-icon__orb--two' cx='14.8' cy='12' r='0.85' />
        </svg>
    );
};

export default CopyTradingNavIcon;
