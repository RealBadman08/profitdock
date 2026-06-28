import React, { useEffect, useMemo, useState } from 'react';
import { BrandMark } from '@/features/deriv-live/components';
import { SOCIAL_LINKS } from '@/features/deriv-live/constants';
import './SocialOverlay.scss';

type SocialBrand = keyof typeof SOCIAL_LINKS;

const SocialOverlay = () => {
    const [isVisible, setIsVisible] = useState(false);

    const channels = useMemo(
        () => [
            {
                brand: 'whatsapp' as SocialBrand,
                title: 'WhatsApp',
                subtitle: 'Join our group chat',
                href: SOCIAL_LINKS.whatsapp,
            },
            {
                brand: 'telegram' as SocialBrand,
                title: 'Telegram',
                subtitle: 'Get live signals daily',
                href: SOCIAL_LINKS.telegram,
            },
            {
                brand: 'tiktok' as SocialBrand,
                title: 'TikTok',
                subtitle: 'Watch trading tutorials',
                href: SOCIAL_LINKS.tiktok,
            },
        ],
        []
    );

    useEffect(() => {
        const hasSeenOverlay = sessionStorage.getItem('hasSeenSocialOverlay');

        if (hasSeenOverlay) {
            return undefined;
        }

        const timer = window.setTimeout(() => {
            setIsVisible(true);
            sessionStorage.setItem('hasSeenSocialOverlay', 'true');
        }, 900);

        return () => window.clearTimeout(timer);
    }, []);

    return (
        <>
            <nav className='social-overlay__dock' aria-label='Official social channels'>
                {channels.map(channel => (
                    <a
                        key={channel.brand}
                        href={channel.href}
                        target='_blank'
                        rel='noopener noreferrer'
                        className={`social-overlay__dock-link social-overlay__dock-link--${channel.brand}`}
                        aria-label={channel.title}
                    >
                        <BrandMark brand={channel.brand} />
                    </a>
                ))}
            </nav>

            {isVisible && (
                <div className='social-overlay'>
                    <button className='social-overlay__backdrop' onClick={() => setIsVisible(false)} type='button' />
                    <div className='social-overlay__modal' role='dialog' aria-modal='true' aria-labelledby='social-overlay-title'>
                        <button className='social-overlay__close' onClick={() => setIsVisible(false)} type='button' aria-label='Close popup'>
                            X
                        </button>
                        <div className='social-overlay__content'>
                            <div className='social-overlay__header'>
                                <span className='social-overlay__logo-shell'>
                                    <img
                                        src='/assets/images/profitdocker-gold-d.png'
                                        alt='ProfitDock logo'
                                        className='social-overlay__logo'
                                    />
                                </span>
                                <div>
                                    <h2 id='social-overlay-title' className='social-overlay__title'>
                                        ProfitDock Community
                                    </h2>
                                    <p className='social-overlay__subtitle'>Join our trading community for signals and bots</p>
                                </div>
                            </div>

                            <p className='social-overlay__lead'>
                                Get live trading signals, free bots, expert copy trading strategies, and 24/7
                                community support.
                            </p>

                            <div className='social-overlay__links'>
                                {channels.map(channel => (
                                    <a
                                        key={channel.brand}
                                        href={channel.href}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className={`social-overlay__link social-overlay__link--${channel.brand}`}
                                    >
                                        <span className='social-overlay__icon'>
                                            <BrandMark brand={channel.brand} />
                                        </span>
                                        <span>
                                            <strong>{channel.title}</strong>
                                            <small>{channel.subtitle}</small>
                                        </span>
                                    </a>
                                ))}
                            </div>

                            <button className='social-overlay__continue' onClick={() => setIsVisible(false)} type='button'>
                                Continue to Platform
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default SocialOverlay;
