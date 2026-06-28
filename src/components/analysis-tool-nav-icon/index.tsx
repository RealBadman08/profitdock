import React from 'react';
import classNames from 'classnames';
import './analysis-tool-nav-icon.scss';

type TAnalysisToolNavIconProps = {
    className?: string;
    height?: number | string;
    width?: number | string;
};

const AnalysisToolNavIcon = ({
    className,
    height = 24,
    width = 24,
}: TAnalysisToolNavIconProps) => {
    return (
        <svg
            aria-hidden='true'
            className={classNames('analysis-tool-nav-icon', className)}
            fill='none'
            height={height}
            viewBox='0 0 24 24'
            width={width}
            xmlns='http://www.w3.org/2000/svg'
        >
            <path
                className='analysis-tool-nav-icon__frame'
                d='M9.6 20H14.4C18.4 20 20 18.4 20 14.4V9.6C20 5.6 18.4 4 14.4 4H9.6C5.6 4 4 5.6 4 9.6V14.4C4 18.4 5.6 20 9.6 20Z'
            />
            <path
                className='analysis-tool-nav-icon__core'
                d='M10.5 17H13.5C16 17 17 16 17 13.5V10.5C17 8 16 7 13.5 7H10.5C8 7 7 8 7 10.5V13.5C7 16 8 17 10.5 17Z'
            />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--1' d='M8.01 4V2' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--2' d='M12 4V2' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--3' d='M16 4V2' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--4' d='M20 8H22' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--5' d='M20 12H22' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--6' d='M20 16H22' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--7' d='M16 20V22' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--8' d='M12.01 20V22' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--9' d='M8.01 20V22' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--10' d='M2 8H4' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--11' d='M2 12H4' />
            <path className='analysis-tool-nav-icon__pin analysis-tool-nav-icon__pin--12' d='M2 16H4' />
            <path
                className='analysis-tool-nav-icon__bolt'
                d='M12 9.69995L11.06 11.34C10.85 11.7 11.02 12 11.44 12H12.56C12.98 12 13.15 12.3 12.94 12.66L12 14.3'
            />
            <circle className='analysis-tool-nav-icon__pulse analysis-tool-nav-icon__pulse--1' cx='12' cy='12' r='0.9' />
            <circle className='analysis-tool-nav-icon__pulse analysis-tool-nav-icon__pulse--2' cx='12' cy='12' r='0.9' />
        </svg>
    );
};

export default AnalysisToolNavIcon;
