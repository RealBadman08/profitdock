import React from 'react';
import classNames from 'classnames';
import './dashboard-nav-icon.scss';

type TDashboardNavIconProps = {
    className?: string;
    height?: number | string;
    width?: number | string;
};

const DashboardNavIcon = ({ className, height = 24, width = 24 }: TDashboardNavIconProps) => {
    return (
        <svg
            aria-hidden='true'
            className={classNames('dashboard-nav-icon', className)}
            fill='none'
            height={height}
            viewBox='0 0 24 24'
            width={width}
            xmlns='http://www.w3.org/2000/svg'
        >
            <rect className='dashboard-nav-icon__tile dashboard-nav-icon__tile--1' height='7' rx='2' width='8.5' x='13' y='2' />
            <rect className='dashboard-nav-icon__tile dashboard-nav-icon__tile--2' height='11' rx='2' width='8.5' x='2.5' y='11' />
            <rect className='dashboard-nav-icon__tile dashboard-nav-icon__tile--3' height='7' rx='2' width='8.5' x='13' y='15' />
            <rect className='dashboard-nav-icon__tile dashboard-nav-icon__tile--4' height='7' rx='2' width='8.5' x='2.5' y='2' />
            <rect className='dashboard-nav-icon__glow dashboard-nav-icon__glow--1' height='7' rx='2' width='8.5' x='13' y='2' />
            <rect className='dashboard-nav-icon__glow dashboard-nav-icon__glow--2' height='11' rx='2' width='8.5' x='2.5' y='11' />
        </svg>
    );
};

export default DashboardNavIcon;
