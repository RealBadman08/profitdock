import React from 'react';
import classNames from 'classnames';

type TIconProps = { className?: string; height?: number | string; width?: number | string };

const MatchtoolNavIcon = ({ className, height = 24, width = 24 }: TIconProps) => (
    <svg
        aria-hidden='true'
        className={classNames('matchtool-nav-icon', className)}
        fill='none'
        height={height}
        viewBox='0 0 24 24'
        width={width}
        xmlns='http://www.w3.org/2000/svg'
    >
        <path fill='var(--text-general)' d='M21 3H3C2 3 1 4 1 5V19C1 20 2 21 3 21H21C22 21 23 20 23 19V5C23 4 22 3 21 3ZM21 19H3V5H21V19ZM11 7H8V9H11V7ZM11 11H8V13H11V11ZM11 15H8V17H11V15ZM16 7H13V9H16V7ZM16 11H13V13H16V11ZM16 15H13V17H16V15Z' />
    </svg>
);

export default MatchtoolNavIcon;
