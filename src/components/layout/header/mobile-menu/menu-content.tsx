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
    const [activeTab, setActiveTab] = useState<'balance' | 'virtual_cr'>('balance');
    const clickTimeout = useRef<NodeJS.Timeout>();

    // Virtual CR form state
    const [crId, setCrId] = useState('');
    const [crLabel, setCrLabel] = useState('');
    const [crBalance, setCrBalance] = useState('');
    const [crCurrency, setCrCurrency] = useState('');

    const handleOpenModal = () => {
        setInputValue(String(client.dummy_balance || ''));
        setActiveTab('balance');
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

    const handleAddCRAccount = () => {
        const id = crId.trim();
        const balance = Number(crBalance);
        if (!id || isNaN(balance) || balance <= 0) return;
        client.addVirtualCRAccount(id, crLabel, balance, crCurrency || client.currency || 'USD');
        setCrId('');
        setCrLabel('');
        setCrBalance('');
        setCrCurrency('');
    };

    const modalOverlayStyle: React.CSSProperties = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.85)', zIndex: 99999,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
    };
    const modalBoxStyle: React.CSSProperties = {
        background: '#1a1a2e', padding: '28px', borderRadius: '16px', color: '#fff',
        display: 'flex', flexDirection: 'column', gap: '16px',
        minWidth: '320px', maxWidth: '400px', width: '90%',
        fontFamily: 'Inter, sans-serif', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', border: '1px solid #333',
    };
    const inputStyle: React.CSSProperties = {
        padding: '9px 12px', border: '1px solid #333', borderRadius: '8px',
        background: '#222', color: '#fff', fontSize: '14px', outline: 'none',
        width: '100%', boxSizing: 'border-box',
    };
    const tabBtnStyle = (active: boolean): React.CSSProperties => ({
        flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
        background: active ? 'linear-gradient(135deg,#6366f1,#818cf8)' : '#2a2a3e',
        color: active ? '#fff' : '#aaa', fontSize: '13px', transition: 'all 0.2s',
    });

    return (
        <div className='mobile-menu__content'>
            <div className='mobile-menu__content__platform mobile-menu__brand-card' onClick={handleLogoClick}>
                <div className='mobile-menu__brand-icon' aria-hidden='true'>PD</div>
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
                            {item.map(({ LeftComponent, RightComponent, as, href, label, onClick, submenu, target, isActive }) => {
                                const is_deriv_logo = label === 'Deriv.com';
                                if (as === 'a') {
                                    return (
                                        <MenuItem
                                            as='a'
                                            className={clsx('mobile-menu__content__items__item', {
                                                'mobile-menu__content__items__icons': !is_deriv_logo,
                                                'mobile-menu__content__items__item--active': isActive,
                                            })}
                                            disableHover href={href} key={label}
                                            leftComponent={<LeftComponent className='mobile-menu__content__items--right-margin' height={16} width={16} />}
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
                                        disableHover key={label}
                                        leftComponent={<LeftComponent className='mobile-menu__content__items--right-margin' iconSize='xs' />}
                                        onClick={() => {
                                            if (submenu && onOpenSubmenu) onOpenSubmenu(submenu);
                                            else if (onClick) onClick();
                                        }}
                                        rightComponent={submenu ? <LegacyChevronRight1pxIcon className='mobile-menu__content__items--chevron' iconSize='xs' /> : RightComponent}
                                    >
                                        <Text size={textSize}>{label}</Text>
                                    </MenuItem>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {showDummyModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalBoxStyle}>
                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Virtual Mode Control</h4>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button style={tabBtnStyle(activeTab === 'balance')} onClick={() => setActiveTab('balance')} type='button'>Virtual Balance</button>
                            <button style={tabBtnStyle(activeTab === 'virtual_cr')} onClick={() => setActiveTab('virtual_cr')} type='button'>Virtual CR Accounts</button>
                        </div>

                        {/* === TAB: Virtual Balance === */}
                        {activeTab === 'balance' && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '14px', color: '#aaa' }}>Enable Virtual Mode</span>
                                    <button
                                        onClick={() => client.toggleDummyMode(!client.is_dummy_active)}
                                        style={{ width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: client.is_dummy_active ? '#4ade80' : '#555', position: 'relative', transition: 'background 0.2s ease', flexShrink: 0 }}
                                        type='button'
                                    >
                                        <span style={{ position: 'absolute', top: '4px', left: client.is_dummy_active ? '26px' : '4px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease', display: 'block' }} />
                                    </button>
                                </div>

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

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', color: '#aaa' }}>Set Virtual Balance Amount</label>
                                    <input type='number' value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder='e.g. 10000' style={inputStyle} />
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={() => setShowDummyModal(false)} style={{ padding: '10px', flex: 1, border: '1px solid #444', background: 'transparent', color: '#ccc', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }} type='button'>Cancel</button>
                                    <button onClick={() => {
                                        const parsed = Number(inputValue);
                                        if (!isNaN(parsed) && parsed > 0) {
                                            client.setDummyBalance(parsed);
                                            if (!client.is_dummy_active) client.toggleDummyMode(true);
                                        }
                                        setShowDummyModal(false);
                                    }} style={{ padding: '10px', flex: 1, background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#000', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, border: 'none' }} type='button'>Save &amp; Activate</button>
                                </div>
                            </>
                        )}

                        {/* === TAB: Virtual CR Accounts === */}
                        {activeTab === 'virtual_cr' && (
                            <>
                                <p style={{ margin: 0, fontSize: '12px', color: '#888', lineHeight: 1.5 }}>
                                    Add Deriv CR accounts with virtual balances. They appear on Copy Trading below real accounts, and their balances track your trades when toggled on.
                                </p>

                                {/* Add form */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#111', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input style={{ ...inputStyle, flex: 2 }} value={crId} onChange={e => setCrId(e.target.value)} placeholder='CR Account ID (e.g. CR123456)' type='text' />
                                        <input style={{ ...inputStyle, flex: 1, minWidth: '60px' }} value={crCurrency} onChange={e => setCrCurrency(e.target.value.toUpperCase())} placeholder={client.currency || 'USD'} maxLength={5} type='text' />
                                    </div>
                                    <input style={inputStyle} value={crLabel} onChange={e => setCrLabel(e.target.value)} placeholder='Label (optional)' type='text' />
                                    <input style={inputStyle} value={crBalance} onChange={e => setCrBalance(e.target.value)} placeholder='Starting balance (e.g. 5000)' type='number' min='0' />
                                    <button
                                        onClick={handleAddCRAccount}
                                        disabled={!crId.trim() || !crBalance || Number(crBalance) <= 0}
                                        style={{ padding: '9px', background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, opacity: (!crId.trim() || !crBalance || Number(crBalance) <= 0) ? 0.4 : 1, transition: 'opacity 0.2s' }}
                                        type='button'
                                    >
                                        + Add Virtual Account
                                    </button>
                                </div>

                                {/* Account list */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                    {client.virtual_cr_accounts.length === 0 && (
                                        <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>No virtual CR accounts added yet.</div>
                                    )}
                                    {client.virtual_cr_accounts.map(acc => (
                                        <div key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#111', borderRadius: '10px', padding: '10px 12px' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acc.deriv_account_id}</div>
                                                <div style={{ fontSize: '11px', color: acc.copy_trading_enabled ? '#4ade80' : '#888' }}>
                                                    {acc.label !== acc.deriv_account_id ? `${acc.label} · ` : ''}{acc.balance.toFixed(2)} {acc.currency}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => client.toggleVirtualCRAccount(acc.id, !acc.copy_trading_enabled)}
                                                style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: acc.copy_trading_enabled ? '#4ade80' : '#444', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
                                                title={acc.copy_trading_enabled ? 'Tracking ON' : 'Tracking OFF'}
                                                type='button'
                                            >
                                                <span style={{ position: 'absolute', top: '3px', left: acc.copy_trading_enabled ? '19px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }} />
                                            </button>
                                            <button
                                                onClick={() => { if (window.confirm(`Delete ${acc.deriv_account_id}?`)) client.removeVirtualCRAccount(acc.id); }}
                                                style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '16px', padding: '2px 4px', flexShrink: 0 }}
                                                title='Delete'
                                                type='button'
                                            >✕</button>
                                        </div>
                                    ))}
                                </div>

                                <button onClick={() => setShowDummyModal(false)} style={{ padding: '10px', border: '1px solid #444', background: 'transparent', color: '#ccc', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }} type='button'>Close</button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

export default MenuContent;
