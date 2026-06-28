import React from 'react';
import clsx from 'clsx';
import { SOCIAL_LINKS } from './constants';
import { formatEpochTime, formatSignedValue } from './api';
import { AnalyticsSummary, ModuleSummary, TickEntry, Tone } from './types';

type PanelProps = {
    children: React.ReactNode;
    className?: string;
    subtitle?: string;
    title?: string;
};

type StatsGridItem = {
    helper?: string;
    label: string;
    tone?: Tone;
    value: string;
};

type BrandName = keyof typeof SOCIAL_LINKS;

const toneClassName = (tone?: Tone) => (tone ? `deriv-live__tone--${tone}` : undefined);

const ToneBadge = ({ children, tone }: { children: React.ReactNode; tone?: Tone }) => (
    <span className={clsx('deriv-live__badge', toneClassName(tone))}>{children}</span>
);

export const Panel = ({ children, className, subtitle, title }: PanelProps) => (
    <section className={clsx('deriv-live__panel', className)}>
        {(title || subtitle) && (
            <header className='deriv-live__panel-header'>
                {title && <h3>{title}</h3>}
                {subtitle && <p>{subtitle}</p>}
            </header>
        )}
        {children}
    </section>
);

type DigitCircleBoardProps = {
    analytics: AnalyticsSummary | null;
    hideDescription?: boolean;
    highlightExtremes?: boolean;
    showRecentDigits?: boolean;
    showTickCounts?: boolean;
};

type DigitRank = 'highest' | 'lowest' | 'second-highest' | 'second-lowest';

export const DigitCircleBoard = ({
    analytics,
    hideDescription = false,
    highlightExtremes = false,
    showRecentDigits = true,
    showTickCounts = true,
}: DigitCircleBoardProps) => {
    if (!analytics) {
        return (
            <Panel
                title='Last Digit Flow'
                subtitle={hideDescription ? undefined : 'Waiting for live ticks to start filling the 0-9 board.'}
            >
                <div className='deriv-live__empty'>Live digit distribution will appear here as soon as the market stream arrives.</div>
            </Panel>
        );
    }

    const rankByDigit = new Map<number, DigitRank>();
    if (highlightExtremes) {
        const ascending = [...analytics.digitStats].sort((left, right) =>
            left.percentage === right.percentage ? left.digit - right.digit : left.percentage - right.percentage
        );
        const descending = [...analytics.digitStats].sort((left, right) =>
            left.percentage === right.percentage ? left.digit - right.digit : right.percentage - left.percentage
        );

        if (ascending[0]) {
            rankByDigit.set(ascending[0].digit, 'lowest');
        }
        if (ascending[1]) {
            rankByDigit.set(ascending[1].digit, 'second-lowest');
        }
        if (descending[0]) {
            rankByDigit.set(descending[0].digit, 'highest');
        }
        if (descending[1]) {
            rankByDigit.set(descending[1].digit, 'second-highest');
        }
    }

    return (
        <Panel
            className='deriv-live__panel--digit-board'
            title='Last Digit Flow'
            subtitle={
                hideDescription
                    ? undefined
                    : 'Every circle is driven by the current rolling tick buffer, with the latest digit highlighted in real time.'
            }
        >
            <div className='deriv-live__digit-board'>
                {analytics.digitStats.map(stat => (
                    <article
                        key={stat.digit}
                        className={clsx('deriv-live__digit-card', {
                            [`deriv-live__digit-card--rank-${rankByDigit.get(stat.digit)}`]: Boolean(rankByDigit.get(stat.digit)),
                            'deriv-live__digit-card--latest': analytics.lastDigit === stat.digit,
                        })}
                        style={{ '--digit-fill': `${stat.percentage}%` } as React.CSSProperties}
                    >
                        <div className='deriv-live__digit-ring'>
                            <span className='deriv-live__digit-value'>{stat.digit}</span>
                            <span className='deriv-live__digit-percent'>{stat.percentage.toFixed(1)}%</span>
                        </div>
                        {showTickCounts && <span className='deriv-live__digit-count'>{stat.count} ticks</span>}
                    </article>
                ))}
            </div>
            {showRecentDigits && (
                <div className='deriv-live__latest-digits'>
                    {analytics.latestDigits.map((digit, index) => (
                        <span key={`${digit}-${index}`} className='deriv-live__latest-digit'>
                            {digit}
                        </span>
                    ))}
                </div>
            )}
        </Panel>
    );
};

const MetricBlock = ({
    count,
    helper,
    label,
    percentage,
    tone,
}: {
    count: number;
    helper?: string;
    label: string;
    percentage: number;
    tone: Tone;
}) => (
    <article className={clsx('deriv-live__metric', toneClassName(tone))}>
        <div className='deriv-live__metric-label-row'>
            <span className='deriv-live__metric-label'>{label}</span>
            <ToneBadge tone={tone}>{count}</ToneBadge>
        </div>
        <strong className='deriv-live__metric-value'>{percentage.toFixed(1)}%</strong>
        {helper && <span className='deriv-live__metric-helper'>{helper}</span>}
        <div className='deriv-live__meter'>
            <span className={clsx('deriv-live__meter-fill', toneClassName(tone))} style={{ width: `${percentage}%` }} />
        </div>
    </article>
);

export const ModuleCard = ({
    footer,
    selector,
    summary,
    title,
}: {
    footer?: React.ReactNode;
    selector?: React.ReactNode;
    summary: ModuleSummary;
    title: string;
}) => (
    <Panel className='deriv-live__panel--module'>
        <div className='deriv-live__module-head'>
            <div>
                <h3>{title}</h3>
                <p>
                    Current streak: {summary.currentStreak}x {summary.currentLabel}
                </p>
            </div>
            {summary.neutralCount !== undefined && summary.neutralLabel ? (
                <ToneBadge tone='slate'>
                    {summary.neutralLabel}: {summary.neutralCount}
                </ToneBadge>
            ) : null}
        </div>
        {selector && <div className='deriv-live__selector-row'>{selector}</div>}
        <div className='deriv-live__metric-grid'>
            <MetricBlock
                count={summary.primaryCount}
                label={summary.primaryLabel}
                percentage={summary.primaryPercentage}
                tone={summary.primaryTone}
            />
            <MetricBlock
                count={summary.secondaryCount}
                label={summary.secondaryLabel}
                percentage={summary.secondaryPercentage}
                tone={summary.secondaryTone}
            />
        </div>
        <div className='deriv-live__sequence'>
            {summary.sequence.map(tile => (
                <span key={tile.id} className={clsx('deriv-live__sequence-tile', toneClassName(tile.tone))}>
                    {tile.label}
                </span>
            ))}
        </div>
        {footer && <div className='deriv-live__module-footer'>{footer}</div>}
    </Panel>
);

export const KeyStatsGrid = ({ items }: { items: StatsGridItem[] }) => (
    <div className='deriv-live__stats-grid'>
        {items.map(item => (
            <article key={item.label} className='deriv-live__stat-card'>
                <span className='deriv-live__stat-label'>{item.label}</span>
                <strong className={clsx('deriv-live__stat-value', toneClassName(item.tone))}>{item.value}</strong>
                {item.helper && <span className='deriv-live__stat-helper'>{item.helper}</span>}
            </article>
        ))}
    </div>
);

export const RecentQuotesPanel = ({ title, ticks }: { title: string; ticks: TickEntry[] }) => (
    <Panel title={title} subtitle='Latest observed quotes in the active rolling sample.'>
        {ticks.length ? (
            <div className='deriv-live__quotes-list'>
                {ticks
                    .slice()
                    .reverse()
                    .map(tick => (
                        <article key={`${tick.epoch}-${tick.quote}`} className='deriv-live__quote-row'>
                            <div>
                                <strong>{tick.displayQuote}</strong>
                                <span>{formatEpochTime(tick.epoch)}</span>
                            </div>
                            <ToneBadge tone='cyan'>Digit {tick.digit}</ToneBadge>
                        </article>
                    ))}
            </div>
        ) : (
            <div className='deriv-live__empty'>Waiting for the latest live ticks.</div>
        )}
    </Panel>
);

export const DistributionSummary = ({ analytics }: { analytics: AnalyticsSummary | null }) => {
    if (!analytics) {
        return null;
    }

    return (
        <Panel title='Digit Balance' subtitle='Most common and least common last digits in the current rolling window.'>
            <div className='deriv-live__distribution-columns'>
                <div>
                    <h4>Most common</h4>
                    <div className='deriv-live__distribution-list'>
                        {analytics.mostCommonDigits.map(stat => (
                            <div key={`most-${stat.digit}`} className='deriv-live__distribution-row'>
                                <span>Digit {stat.digit}</span>
                                <strong>{stat.percentage.toFixed(1)}%</strong>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <h4>Least common</h4>
                    <div className='deriv-live__distribution-list'>
                        {analytics.leastCommonDigits.map(stat => (
                            <div key={`least-${stat.digit}`} className='deriv-live__distribution-row'>
                                <span>Digit {stat.digit}</span>
                                <strong>{stat.percentage.toFixed(1)}%</strong>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Panel>
    );
};

const WhatsAppIcon = () => (
    <svg viewBox='0 0 24 24' aria-hidden='true'>
        <path
            fill='currentColor'
            d='M20.52 3.48A11.86 11.86 0 0 0 12.1.02C5.58.02.29 5.31.29 11.82c0 2.08.54 4.11 1.56 5.89L0 24l6.48-1.69a11.8 11.8 0 0 0 5.62 1.43h.01c6.51 0 11.79-5.29 11.79-11.8 0-3.15-1.23-6.12-3.38-8.46Zm-8.42 18.27h-.01a9.85 9.85 0 0 1-5.02-1.37l-.36-.21-3.84 1 1.03-3.74-.24-.38a9.82 9.82 0 0 1-1.5-5.22c0-5.43 4.42-9.85 9.86-9.85 2.63 0 5.1 1.02 6.96 2.89a9.79 9.79 0 0 1 2.88 6.97c0 5.43-4.42 9.86-9.86 9.86Zm5.4-7.37c-.29-.15-1.72-.85-1.99-.94-.27-.1-.47-.15-.67.15-.2.29-.77.94-.94 1.13-.17.2-.35.22-.64.08-.29-.15-1.23-.45-2.35-1.44-.87-.77-1.46-1.71-1.63-2-.17-.29-.02-.45.13-.6.13-.13.29-.35.44-.52.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37s-1.04 1.01-1.04 2.46 1.06 2.85 1.2 3.05c.15.2 2.09 3.18 5.07 4.46.71.31 1.27.49 1.7.62.71.23 1.35.2 1.86.12.57-.08 1.72-.7 1.96-1.38.24-.68.24-1.27.17-1.39-.07-.12-.27-.2-.57-.35Z'
        />
    </svg>
);

const TelegramIcon = () => (
    <svg viewBox='0 0 24 24' aria-hidden='true'>
        <path
            fill='currentColor'
            d='M9.78 15.16 9.4 20.5c.54 0 .77-.23 1.05-.51l2.51-2.4 5.2 3.8c.95.52 1.63.25 1.89-.88l3.43-16.07v-.01c.31-1.43-.52-1.99-1.45-1.65L1.87 10.56c-1.38.54-1.36 1.31-.23 1.66l5.16 1.61L18.8 6.3c.57-.37 1.09-.16.66.21l-9.68 8.65Z'
        />
    </svg>
);

const TikTokIcon = () => (
    <svg viewBox='0 0 24 24' aria-hidden='true'>
        <path
            fill='currentColor'
            d='M16.6 1.82c.25 2.12 1.44 3.88 3.36 4.88.62.32 1.31.54 2.04.64v3.23a8.68 8.68 0 0 1-4.27-1.11v6.19c0 3.12-2.54 5.67-5.67 5.67S6.39 18.77 6.39 15.65s2.54-5.67 5.67-5.67c.33 0 .65.03.96.08v3.26a2.66 2.66 0 0 0-.96-.18 2.51 2.51 0 0 0 0 5.03 2.52 2.52 0 0 0 2.52-2.52V1.82h2.02Z'
        />
    </svg>
);

export const BrandMark = ({ brand }: { brand: BrandName }) => {
    if (brand === 'whatsapp') {
        return <WhatsAppIcon />;
    }

    if (brand === 'telegram') {
        return <TelegramIcon />;
    }

    return <TikTokIcon />;
};

export const SocialDock = () => (
    <div className='deriv-live__social-dock'>
        {(Object.keys(SOCIAL_LINKS) as BrandName[]).map(brand => (
            <a
                key={brand}
                href={SOCIAL_LINKS[brand]}
                target='_blank'
                rel='noopener noreferrer'
                className={clsx('deriv-live__social-link', `deriv-live__social-link--${brand}`)}
                aria-label={brand}
            >
                <BrandMark brand={brand} />
            </a>
        ))}
    </div>
);

export const formatPnL = (value: number) => formatSignedValue(value, 2);
