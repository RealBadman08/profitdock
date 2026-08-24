import React, { PropsWithChildren, ReactNode } from 'react';
import classNames from 'classnames';
import './profitdock-smooth-layout.scss';

type TSmoothPageProps = PropsWithChildren<{
    className?: string;
    maxWidth?: string;
}>;

type TSmoothHeroProps = {
    action?: ReactNode;
    description?: string;
    eyebrow?: string;
    title: string;
};

type TSmoothSectionProps = PropsWithChildren<{
    ariaLabel?: string;
    className?: string;
}>;

export const ProfitDockSmoothPage = ({ children, className, maxWidth }: TSmoothPageProps) => {
    const style = maxWidth
        ? ({ '--profitdock-smooth-max-width': maxWidth } as React.CSSProperties)
        : undefined;

    return (
        <main className={classNames('profitdock-smooth-page', className)} style={style}>
            <div className='profitdock-smooth-page__shell'>{children}</div>
        </main>
    );
};

export const ProfitDockSmoothHero = ({ action, description, eyebrow, title }: TSmoothHeroProps) => (
    <header className='profitdock-smooth-hero'>
        <div className='profitdock-smooth-hero__copy'>
            {eyebrow ? <span className='profitdock-smooth-hero__eyebrow'>{eyebrow}</span> : null}
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className='profitdock-smooth-hero__action'>{action}</div> : null}
    </header>
);

export const ProfitDockSmoothSection = ({ ariaLabel, children, className }: TSmoothSectionProps) => (
    <section aria-label={ariaLabel} className={classNames('profitdock-smooth-section', className)}>
        {children}
    </section>
);
