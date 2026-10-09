import { memo, useState } from 'react';
import classNames from 'classnames';
import './trade-type-panel.scss';

type TTradeType = {
    id: string;
    label: string;
    description: string;
    icon: string;
    indicators: { flutter_chart_id: string; short_name: string }[];
};

const TRADE_TYPES: TTradeType[] = [
    {
        id: 'ups_downs',
        label: 'Ups & Downs',
        description: 'Asian, Digits, Touch/No Touch',
        icon: '📊',
        indicators: [
            { flutter_chart_id: 'bollinger_bands', short_name: 'BB' },
            { flutter_chart_id: 'RSI', short_name: 'RSI' },
        ],
    },
    {
        id: 'rise_fall',
        label: 'Rise & Fall',
        description: 'Rise/Fall, Up/Down ticks',
        icon: '📈',
        indicators: [
            { flutter_chart_id: 'commodity_channel_index', short_name: 'CCI' },
            { flutter_chart_id: 'macd', short_name: 'MACD' },
            { flutter_chart_id: 'bollinger_bands', short_name: 'BB' },
        ],
    },
    {
        id: 'higher_lower',
        label: 'Higher & Lower',
        description: 'Higher/Lower barrier trades',
        icon: '⚡',
        indicators: [
            { flutter_chart_id: 'commodity_channel_index', short_name: 'CCI' },
            { flutter_chart_id: 'RSI', short_name: 'RSI' },
            { flutter_chart_id: 'macd', short_name: 'MACD' },
        ],
    },
];

type TTradeTypePanelProps = {
    onSelectTradeType: (indicators: { flutter_chart_id: string; short_name: string }[]) => void;
};

const TradeTypePanel = ({ onSelectTradeType }: TTradeTypePanelProps) => {
    const [active_id, set_active_id] = useState<string | null>(null);

    const handleClick = (trade_type: TTradeType) => {
        const new_id = active_id === trade_type.id ? null : trade_type.id;
        set_active_id(new_id);
        if (new_id) {
            onSelectTradeType(trade_type.indicators);
        } else {
            onSelectTradeType([]);
        }
    };

    return (
        <div className='trade-type-panel'>
            <div className='trade-type-panel__header'>
                <span className='trade-type-panel__title'>Trade Type</span>
                <span className='trade-type-panel__subtitle'>Auto-adds indicators</span>
            </div>
            <div className='trade-type-panel__buttons'>
                {TRADE_TYPES.map(tt => (
                    <button
                        key={tt.id}
                        className={classNames('trade-type-panel__btn', {
                            'trade-type-panel__btn--active': active_id === tt.id,
                        })}
                        onClick={() => handleClick(tt)}
                        title={tt.description}
                    >
                        <span className='trade-type-panel__btn-icon'>{tt.icon}</span>
                        <span className='trade-type-panel__btn-label'>{tt.label}</span>
                        {active_id === tt.id && (
                            <span className='trade-type-panel__btn-badge'>
                                {tt.indicators.map(i => i.short_name).join(' + ')}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default memo(TradeTypePanel);
