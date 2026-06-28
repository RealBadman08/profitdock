import React from 'react';
import classNames from 'classnames';
import './flipper-switcher-nav-icon.scss';

type TIconProps = { className?: string; height?: number | string; width?: number | string };

const FlipperSwitcherNavIcon = ({ className, height = 24, width = 24 }: TIconProps) => (
    <svg aria-hidden='true' className={classNames('flipper-switcher-nav-icon', className)} fill='none' height={height} viewBox='0 0 24 24' width={width} xmlns='http://www.w3.org/2000/svg'>
        <g className='flipper-switcher-nav-icon__cube'>
            <path className='flipper-switcher-nav-icon__face flipper-switcher-nav-icon__face--top' d='M12 3.8L19.3 7.8L12 11.8L4.7 7.8L12 3.8Z' />
            <path className='flipper-switcher-nav-icon__face flipper-switcher-nav-icon__face--left' d='M4.7 7.8L12 11.8V20.2L4.7 16.1V7.8Z' />
            <path className='flipper-switcher-nav-icon__face flipper-switcher-nav-icon__face--right' d='M19.3 7.8L12 11.8V20.2L19.3 16.1V7.8Z' />
        </g>
        <path className='flipper-switcher-nav-icon__orbit' d='M5.2 18.8C8.2 21.5 15.8 21.5 18.8 18.8' />
    </svg>
);

export default FlipperSwitcherNavIcon;
