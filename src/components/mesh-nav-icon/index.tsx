import React from 'react';
import classNames from 'classnames';
import './mesh-nav-icon.scss';

type TIconProps = { className?: string; height?: number | string; width?: number | string };

const MeshNavIcon = ({ className, height = 24, width = 24 }: TIconProps) => (
    <svg
        aria-hidden='true'
        className={classNames('mesh-nav-icon', className)}
        fill='none'
        height={height}
        viewBox='0 0 24 24'
        width={width}
        xmlns='http://www.w3.org/2000/svg'
    >
        <path className='mesh-nav-icon__wave' d='M3.5 14.2C5.3 9.8 7.1 9.8 8.9 14.2C10.7 18.6 12.5 18.6 14.3 14.2C16.1 9.8 17.9 9.8 20.5 14.2' />
        <path className='mesh-nav-icon__bar mesh-nav-icon__bar--one' d='M5.2 18.5V11.2' />
        <path className='mesh-nav-icon__bar mesh-nav-icon__bar--two' d='M9.7 18.5V6.2' />
        <path className='mesh-nav-icon__bar mesh-nav-icon__bar--three' d='M14.2 18.5V8.8' />
        <path className='mesh-nav-icon__bar mesh-nav-icon__bar--four' d='M18.7 18.5V5.5' />
    </svg>
);

export default MeshNavIcon;
