import React from 'react';
import classNames from 'classnames';
import './corsa-nav-icon.scss';

type TIconProps = { className?: string; height?: number | string; width?: number | string };

const CorsaNavIcon = ({ className, height = 24, width = 24 }: TIconProps) => (
    <svg
        aria-hidden='true'
        className={classNames('corsa-nav-icon', className)}
        fill='none'
        height={height}
        viewBox='0 0 24 24'
        width={width}
        xmlns='http://www.w3.org/2000/svg'
    >
        <path className='corsa-nav-icon__track' d='M4.5 6.5H13.8C17 6.5 19.2 8.5 19.2 11.5S17 16.5 13.8 16.5H7.8' />
        <path className='corsa-nav-icon__track corsa-nav-icon__track--second' d='M19.5 17.5H10.2C7 17.5 4.8 15.5 4.8 12.5S7 7.5 10.2 7.5H16.2' />
        <path className='corsa-nav-icon__bolt' d='M12.8 3.8L8.4 12.1H12L10.9 20.2L15.7 10.7H12.2L12.8 3.8Z' />
        <circle className='corsa-nav-icon__dot corsa-nav-icon__dot--one' cx='5' cy='6.5' r='1.45' />
        <circle className='corsa-nav-icon__dot corsa-nav-icon__dot--two' cx='19' cy='17.5' r='1.45' />
    </svg>
);

export default CorsaNavIcon;
