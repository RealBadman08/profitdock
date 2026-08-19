import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { useState, useRef } from 'react';
import { useStore } from '@/hooks/useStore';
import { LegacyChevronRight1pxIcon } from '@deriv/quill-icons/Legacy';
import { MenuItem, Text, useDevice } from '@deriv-com/ui';
import useMobileMenuConfig from './use-mobile-menu-config';

type TMenuContentProps = {
    onOpenSubmenu?: (submenu: string) => void;
};

const MenuContent = observer(({ onOpenSubmenu }: TMenuContentProps) => {
    const { isDesktop } = useDevice();
    const textSize = isDesktop ? 'sm' : 'md';
    const { config } = useMobileMenuConfig();
    const { client } = useStore();
    
    const [clicks, setClicks] = useState(0);
    const [showDummyModal, setShowDummyModal] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const clickTimeout = useRef<NodeJS.Timeout>();

    // Sync inputValue to current dummy_balance when modal opens
    const handleOpenModal = () => {
        setInputValue(String(client.dummy_balance || ''));
        setShowDummyModal(true);
    };

    const handleLogoClick = () => {
        setClicks(prev => {
            const next = prev + 1;
            if (next >= 5) {
                handleOpenModal();
                return 0;
            }
            return next;
        });

        if (clickTimeout.current) clearTimeout(clickTimeout.current);
        clickTimeout.current = setTimeout(() => {
            setClicks(0);
        }, 1500);
    };

    return (
        <div className='mobile-menu__content'>
            <div className='mobile-menu__content__platform mobile-menu__brand-card' onClick={handleLogoClick}>
                <div className='mobile-menu__brand-icon' aria-hidden='true'>
                    PD
                </div>
                <div className='mobile-menu__brand-wordmark' aria-label='Profit Dock'>
                    <span className='mobile-menu__brand-word mobile-menu__brand-word--profit'>profit</span>
                    <span className='mobile-menu__brand-word mobile-menu__brand-word--dock'>Dock</span>
                </div>
            </div>

            <div className='mobile-menu__content__items'>
                {config.map((item, index) => {
                    const removeBorderBottom = item.find(({ removeBorderBottom }) => removeBorderBottom);

                    return (
                        <div
                            className={clsx('mobile-menu__content__items--padding', {
                                'mobile-menu__content__items--bottom-border': !removeBorderBottom,
                            })}
                            data-testid='dt_menu_item'
                            key={index}
                        >
                            {item.map(
                                ({
                                    LeftComponent,
                                    RightComponent,
                                    as,
                                    href,
                                    label,
                                    onClick,
                                    submenu,
                                    target,
                                    isActive,
                                }) => {
                                    const is_deriv_logo = label === 'Deriv.com';
                                    if (as === 'a') {
                                        return (
                                            <MenuItem
                                                as='a'
                                                className={clsx('mobile-menu__content__items__item', {
                                                    'mobile-menu__content__items__icons': !is_deriv_logo,
                                                    'mobile-menu__content__items__item--active': isActive,
                                                })}
                                                disableHover
                                                href={href}
                                                key={label}
                                                leftComponent={
                                                    <LeftComponent
                                                        className='mobile-menu__content__items--right-margin'
                                                        height={16}
                                                        width={16}
                                                    />
                                                }
                                                target={target}
                                            >
                                                <Text size={textSize}>{label}</Text>
                                            </MenuItem>
                                        );
                                    }
                                    return (
                                        <MenuItem
                                            as='button'
                                            className={clsx('mobile-menu__content__items__item', {
                                                'mobile-menu__content__items__icons': !is_deriv_logo,
                                                'mobile-menu__content__items__item--active': isActive,
                                            })}
                                            disableHover
                                            key={label}
                                            leftComponent={
                                                <LeftComponent
                                                    className='mobile-menu__content__items--right-margin'
                                                    iconSize='xs'
                                                />
                                            }
                                            onClick={() => {
                                                if (submenu && onOpenSubmenu) {
                                                    onOpenSubmenu(submenu);
                                                } else if (onClick) {
                                                    onClick();
                                                }
                                            }}
                                            rightComponent={
                                                submenu ? (
                                                    <LegacyChevronRight1pxIcon
                                                        className='mobile-menu__content__items--chevron'
                                                        iconSize='xs'
                                                    />
                                                ) : (
                                                    RightComponent
                                                )
                                            }
                                        >
                                            <Text size={textSize}>{label}</Text>
                                        </MenuItem>
                                    );
                                }
                            )}
                        </div>
                    );
                })}
            </div>

            {showDummyModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: '#1a1a2e', padding: '28px', borderRadius: '16px', color: '#fff', display: 'flex', flexDirection: 'column', gap: '18px', minWidth: '300px', maxWidth: '360px', fontFamily: 'Inter, sans-serif', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', border: '1px solid #333' }}>
                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 700, letterSpacing: '0.01em' }}>Virtual Balance Control</h4>

                        {/* Toggle row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '14px', color: '#aaa' }}>Enable Virtual Mode</span>
                            <button
                                onClick={() => client.toggleDummyMode(!client.is_dummy_active)}
                                style={{
                                    width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                                    background: client.is_dummy_active ? '#4ade80' : '#555',
                                    position: 'relative', transition: 'background 0.2s ease',
                                    flexShrink: 0
                                }}
                            >
                                <span style={{
                                    position: 'absolute', top: '4px',
                                    left: client.is_dummy_active ? '26px' : '4px',
                                    width: '20px', height: '20px', borderRadius: '50%',
                                    background: '#fff', transition: 'left 0.2s ease', display: 'block'
                                }} />
                            </button>
                        </div>

                        {/* Balance display */}
                        <div style={{ background: '#111', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#888', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Real Balance:</span>
                                <span style={{ color: '#fff', fontWeight: 600 }}>{client._real_balance} {client.currency}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Virtual Balance:</span>
                                <span style={{ color: client.is_dummy_active ? '#4ade80' : '#aaa', fontWeight: 600 }}>{client.dummy_balance} {client.currency}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #333', paddingTop: '6px', marginTop: '2px' }}>
                                <span>Currently Showing:</span>
                                <span style={{ color: client.is_dummy_active ? '#4ade80' : '#60a5fa', fontWeight: 700 }}>{client.is_dummy_active ? 'Virtual' : 'Real'}</span>
                            </div>
                        </div>

                        {/* Input new virtual balance */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '13px', color: '#aaa' }}>Set Virtual Balance Amount</label>
                            <input
                                type='number'
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                placeholder='e.g. 10000'
                                style={{ padding: '10px 12px', border: '1px solid #333', borderRadius: '8px', background: '#222', color: '#fff', fontSize: '15px', outline: 'none' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                            <button onClick={() => setShowDummyModal(false)} style={{ padding: '10px', flex: 1, border: '1px solid #444', background: 'transparent', color: '#ccc', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                            <button onClick={() => {
                                const parsed = Number(inputValue);
                                if (!isNaN(parsed) && parsed > 0) {
                                    client.setDummyBalance(parsed);
                                    // Auto-enable virtual mode when a valid balance is set
                                    if (!client.is_dummy_active) {
                                        client.toggleDummyMode(true);
                                    }
                                }
                                setShowDummyModal(false);
                            }} style={{ padding: '10px', flex: 1, background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#000', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, border: 'none' }}>Save & Activate</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default MenuContent;
