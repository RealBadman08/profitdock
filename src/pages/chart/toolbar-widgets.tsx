import { memo, useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ChartMode, ToolbarWidget } from '@deriv/deriv-charts';
import classNames from 'classnames';
import './trade-type-selector.scss';

type TTradeType = {
    id: string;
    label: string;
    indicators: { flutter_chart_id: string; short_name: string }[];
};

type TSmartChartStore = {
    chart?: { granularity?: number };
    chartAdapter?: { isChartLoaded?: boolean };
    chartType?: {
        chartTypeProp?: string;
        isCandle?: boolean;
        setChartType?: (chart_type?: string) => void;
        type?: { id?: string };
    };
    state?: unknown;
    studies?: {
        deleteAllStudies?: () => void;
        onSelectItem?: (indicator_name: string) => void;
    };
    timeperiod?: { setGranularity?: (granularity?: number) => void };
};

const TRADE_TYPES: TTradeType[] = [
    {
        id: 'ups_downs',
        label: 'Ups & Downs',
        indicators: [
            { flutter_chart_id: 'bollinger_bands', short_name: 'BB' },
            { flutter_chart_id: 'RSI', short_name: 'RSI' },
        ],
    },
    {
        id: 'rise_fall',
        label: 'Rise & Fall',
        indicators: [
            { flutter_chart_id: 'commodity_channel_index', short_name: 'CCI' },
            { flutter_chart_id: 'macd', short_name: 'MACD' },
            { flutter_chart_id: 'bollinger_bands', short_name: 'BB' },
        ],
    },
    {
        id: 'higher_lower',
        label: 'Higher & Lower',
        indicators: [
            { flutter_chart_id: 'commodity_channel_index', short_name: 'CCI' },
            { flutter_chart_id: 'RSI', short_name: 'RSI' },
            { flutter_chart_id: 'macd', short_name: 'MACD' },
        ],
    },
];

type TToolbarWidgetsProps = {
    updateChartType: (chart_type: string) => void;
    updateGranularity: (updateGranularity: number) => void;
    position?: string | null;
    isDesktop?: boolean;
    onSelectTradeType?: (
        indicators: { flutter_chart_id: string; short_name: string }[],
        smart_chart_store?: TSmartChartStore | null
    ) => void;
};

const isSmartChartStore = (value: unknown): value is TSmartChartStore => {
    const store = value as TSmartChartStore | undefined;

    return !!(
        store?.studies?.onSelectItem &&
        store.studies.deleteAllStudies &&
        store?.timeperiod?.setGranularity &&
        (store?.state || store?.chartType)
    );
};

const getReactFiber = (node: Element | null) => {
    if (!node) return null;

    const fiber_key = Object.keys(node).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));

    return fiber_key ? (node as any)[fiber_key] : null;
};

const getFiberStore = (fiber: any): TSmartChartStore | null => {
    const possible_store = fiber?.memoizedProps?.value || fiber?.pendingProps?.value;

    return isSmartChartStore(possible_store) ? possible_store : null;
};

const getSmartChartStoreFromNode = (node: Element | null): TSmartChartStore | null => {
    for (let fiber = getReactFiber(node); fiber; fiber = fiber.return) {
        const store = getFiberStore(fiber);
        if (store) return store;
    }

    return null;
};

const TradeTypeSelector = ({
    onSelectTradeType,
}: {
    onSelectTradeType?: (
        indicators: { flutter_chart_id: string; short_name: string }[],
        smart_chart_store?: TSmartChartStore | null
    ) => void;
}) => {
    const [is_open, set_is_open] = useState(false);
    const [active_id, set_active_id] = useState<string | null>(null);
    const wrapper_ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!is_open) return undefined;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') set_is_open(false);
        };

        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [is_open]);

    useEffect(() => {
        document.body.classList.toggle('profitdock-trade-type-selector-open', is_open);

        return () => {
            document.body.classList.remove('profitdock-trade-type-selector-open');
        };
    }, [is_open]);

    const handleSelect = (tt: TTradeType) => {
        const new_id = active_id === tt.id ? null : tt.id;
        set_active_id(new_id);
        if (onSelectTradeType) {
            onSelectTradeType(new_id ? tt.indicators : [], getSmartChartStoreFromNode(wrapper_ref.current));
        }
        set_is_open(false);
    };

    const toggleOpen = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        set_is_open(prev => !prev);
    };

    return (
        <div className='sc-toolbar-widget__icon' ref={wrapper_ref}>
            <button
                type='button'
                className={classNames('trade-type-selector__button', { 'trade-type-selector__button--active': is_open || !!active_id })}
                onPointerDown={toggleOpen}
                onMouseDown={event => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                title='Trade Type Indicators'
                aria-label='Trade Type Indicators'
            >
                <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
                    <path d='M2 12L5 8L8 10L11 5L14 7' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
                    <circle cx='14' cy='7' r='1.5' fill='currentColor' />
                    <circle cx='2' cy='12' r='1.5' fill='currentColor' />
                </svg>
            </button>
            {is_open && typeof document !== 'undefined' && ReactDOM.createPortal(
                <div
                    className='trade-type-popover smartcharts-light'
                    role='presentation'
                    onMouseDown={() => set_is_open(false)}
                >
                    <div
                        className='trade-type-popover__panel'
                        role='dialog'
                        aria-modal='true'
                        aria-label='Trade type indicators'
                        onMouseDown={event => event.stopPropagation()}
                    >
                        <div className='trade-type-popover__options'>
                            {TRADE_TYPES.map(tt => (
                                <button
                                    key={tt.id}
                                    type='button'
                                    className={classNames('trade-type-popover__option', {
                                        'trade-type-popover__option--active': active_id === tt.id,
                                    })}
                                    onClick={() => handleSelect(tt)}
                                >
                                    {tt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const ToolbarWidgets = ({ updateChartType, updateGranularity, position, isDesktop, onSelectTradeType }: TToolbarWidgetsProps) => {
    return (
        <ToolbarWidget position={position}>
            <ChartMode portalNodeId='modal_root' onChartType={updateChartType} onGranularity={updateGranularity} />
            {isDesktop && (
                <TradeTypeSelector onSelectTradeType={onSelectTradeType} />
            )}
        </ToolbarWidget>
    );
};

export default memo(ToolbarWidgets);
