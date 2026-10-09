import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { useStore } from '@/hooks/useStore';
import {
    ActiveSymbolsRequest,
    ServerTimeRequest,
    TicksHistoryResponse,
    TicksStreamRequest,
    TradingTimesRequest,
} from '@deriv/api-types';
import { ChartTitle, SmartChart } from '@deriv/deriv-charts';
import { useDevice } from '@deriv-com/ui';
import ToolbarWidgets from './toolbar-widgets';
import '@deriv/deriv-charts/dist/smartcharts.css';

type TSubscription = {
    [key: string]: null | { unsubscribe?: () => void };
};

type TError = null | { error?: { code?: string; message?: string } };
type TTradeTypeIndicator = { flutter_chart_id: string; short_name: string };
type TFlutterIndicatorBridge = {
    app?: { addOrUpdateIndicator?: (config: string, index?: number) => void };
    indicators?: { clearIndicators?: () => void; removeIndicator?: (index: number) => void };
};
type TSmartChartStore = {
    chart?: { granularity?: number };
    chartAdapter?: {
        checkIndicatorHover?: (...args: unknown[]) => void;
        debouncedIndicatorHover?: (...args: unknown[]) => void;
        flutterChart?: TFlutterIndicatorBridge;
        isChartLoaded?: boolean;
    };
    bottomWidgetsContainer?: { updateChartHeight?: () => void };
    chartType?: {
        chartTypeProp?: string;
        isCandle?: boolean;
        setChartType?: (chart_type?: string) => void;
        type?: { id?: string };
    };
    state?: {
        chartType?: string;
        isChartReady?: boolean;
        saveLayout?: () => void;
    };
    studies?: {
        activeItems?: unknown[];
        clearHoverItem?: (index: number) => void;
        currentHoverIndex?: number | null;
        deleteAllStudies?: () => void;
        highlightIndicator?: (...args: unknown[]) => void;
        onSelectItem?: (indicator_name: string) => void;
        previousHoverIndex?: number | null;
    };
    crosshair?: { removeIndicatorToolTip?: () => void };
    timeperiod?: { setGranularity?: (granularity?: number) => void };
};

type TSmartChartInteropIndicators = {
    onEdit?: (index: number) => void;
    onRemove?: (index: number) => void;
};

type TIndicatorControlCallbacks = TSmartChartInteropIndicators & {
    chart_adapter?: TSmartChartStore['chartAdapter'];
    checkIndicatorHover?: TSmartChartStore['chartAdapter'] extends infer T ? T extends { checkIndicatorHover?: infer F } ? F : never : never;
    debouncedIndicatorHover?: TSmartChartStore['chartAdapter'] extends infer T ? T extends { debouncedIndicatorHover?: infer F } ? F : never : never;
    highlightIndicator?: TSmartChartStore['studies'] extends infer T ? T extends { highlightIndicator?: infer F } ? F : never : never;
    onCrosshairHover?: (...args: unknown[]) => void;
    studies?: TSmartChartStore['studies'];
};

type TSmartChartWindow = Window & {
    flutterChart?: TFlutterIndicatorBridge;
    jsInterop?: { indicators?: TSmartChartInteropIndicators; onCrosshairHover?: (...args: unknown[]) => void };
};

const subscriptions: TSubscription = {};
const CHART_ID = 'dbot';
const CANDLE_CHART_TYPE = 'candles';
const ONE_MINUTE_GRANULARITY = 60;
const BOTTOM_PANEL_INDICATORS = new Set(['RSI', 'commodity_channel_index', 'macd']);
const TRADE_TYPE_INDICATOR_STYLE = {
    aqua: 0xff85acb0,
    green: 0xff00dd00,
    red: 0xffff444f,
    soft_aqua: 0x3385acb0,
    white: 0xffffffff,
    grey: 0xff626b73,
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getPropertyDescriptor = (target: object, property: PropertyKey) => {
    for (let current: object | null = target; current; current = Object.getPrototypeOf(current)) {
        const descriptor = Object.getOwnPropertyDescriptor(current, property);
        if (descriptor) return descriptor;
    }

    return undefined;
};

const safeSetProperty = (target: object | null | undefined, property: PropertyKey, value: unknown) => {
    if (!target) return false;

    try {
        const descriptor = getPropertyDescriptor(target, property);
        if (descriptor && !descriptor.set && descriptor.writable === false) return false;

        (target as Record<PropertyKey, unknown>)[property] = value;
        return true;
    } catch {
        return false;
    }
};

const safeDeleteProperty = (target: object | null | undefined, property: PropertyKey) => {
    if (!target) return false;

    try {
        const descriptor = getPropertyDescriptor(target, property);
        if (descriptor && descriptor.configurable === false) return false;

        return delete (target as Record<PropertyKey, unknown>)[property];
    } catch {
        return false;
    }
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

const getFiberStore = (fiber: any): TSmartChartStore | null => {
    const possible_store = fiber?.memoizedProps?.value || fiber?.pendingProps?.value;

    return isSmartChartStore(possible_store) ? possible_store : null;
};

const getReactFiber = (node: Element | null) => {
    if (!node) return null;

    const fiber_key = Object.keys(node).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));

    return fiber_key ? (node as any)[fiber_key] : null;
};

const getSmartChartStore = (chart_id: string): TSmartChartStore | null => {
    if (typeof document === 'undefined') return null;

    const root_node = document.getElementById(chart_id);
    const root_fiber = getReactFiber(root_node);
    if (!root_fiber) return null;

    for (let fiber = root_fiber; fiber; fiber = fiber.return) {
        const store = getFiberStore(fiber);
        if (store) return store;
    }

    const visited = new Set();
    const stack = [root_fiber];
    while (stack.length > 0) {
        const fiber = stack.pop();
        if (!fiber || visited.has(fiber)) continue;
        visited.add(fiber);

        const store = getFiberStore(fiber);
        if (store) return store;

        if (fiber.child) stack.push(fiber.child);
        if (fiber.sibling) stack.push(fiber.sibling);
    }

    return null;
};

const resolveSmartChartStore = (chart_id: string, preferred_store?: unknown) => {
    return isSmartChartStore(preferred_store) ? preferred_store : getSmartChartStore(chart_id);
};

const waitForSmartChartStore = async (chart_id: string, should_be_ready = false, preferred_store?: unknown) => {
    for (let attempt = 0; attempt < 50; attempt++) {
        const store = resolveSmartChartStore(chart_id, preferred_store);
        const is_ready = !!(store?.state?.isChartReady && store?.chartAdapter?.isChartLoaded);

        if (store && (!should_be_ready || is_ready)) return store;
        await delay(60);
    }

    return resolveSmartChartStore(chart_id, preferred_store);
};

const waitForOneMinuteCandles = async (chart_id: string, preferred_store?: unknown) => {
    for (let attempt = 0; attempt < 70; attempt++) {
        const store = resolveSmartChartStore(chart_id, preferred_store);
        const granularity = store?.chart?.granularity ?? undefined;
        const chart_type = store?.state?.chartType || store?.chartType?.chartTypeProp || store?.chartType?.type?.id;
        const is_ready = !!(store?.state?.isChartReady && store?.chartAdapter?.isChartLoaded);

        if (store && is_ready && granularity === ONE_MINUTE_GRANULARITY && chart_type === CANDLE_CHART_TYPE) {
            return store;
        }

        await delay(75);
    }

    return waitForSmartChartStore(chart_id, true, preferred_store);
};

const getFlutterChartBridge = (store?: TSmartChartStore | null) =>
    store?.chartAdapter?.flutterChart || (window as TSmartChartWindow).flutterChart;

const waitForIndicatorBridge = async (store?: TSmartChartStore | null) => {
    for (let attempt = 0; attempt < 80; attempt++) {
        const bridge = getFlutterChartBridge(store);
        if (bridge?.app?.addOrUpdateIndicator && bridge?.indicators?.clearIndicators) return bridge;
        await delay(75);
    }

    return getFlutterChartBridge(store);
};

const createDirectIndicatorConfig = (indicator: TTradeTypeIndicator, index: number) => {
    const id = `profitdock_${indicator.flutter_chart_id}_${Date.now()}_${index}`;
    const line_style = { color: TRADE_TYPE_INDICATOR_STYLE.white, thickness: 1 };
    const muted_line_style = { color: TRADE_TYPE_INDICATOR_STYLE.grey, thickness: 1 };

    switch (indicator.flutter_chart_id) {
        case 'bollinger_bands':
            return {
                id,
                name: 'bollinger_bands',
                title: 'BOLLINGER BANDS (20,C,2,SMA)',
                upperLineStyle: { color: TRADE_TYPE_INDICATOR_STYLE.aqua, thickness: 1 },
                middleLineStyle: { color: TRADE_TYPE_INDICATOR_STYLE.white, thickness: 1 },
                lowerLineStyle: { color: TRADE_TYPE_INDICATOR_STYLE.aqua, thickness: 1 },
                fillColor: TRADE_TYPE_INDICATOR_STYLE.soft_aqua,
                period: 20,
                fieldType: 'close',
                standardDeviation: 2,
                movingAverageType: 'simple',
                showChannelFill: true,
                showLastIndicator: true,
            };
        case 'RSI':
            return {
                id,
                name: 'RSI',
                title: 'RSI (14,C)',
                lineStyle: line_style,
                oscillatorLinesConfig: {
                    overboughtValue: 80,
                    oversoldValue: 20,
                    overboughtStyle: muted_line_style,
                    oversoldStyle: muted_line_style,
                },
                period: 14,
                fieldType: 'close',
                showZones: true,
                pipSize: 2,
                showLastIndicator: true,
            };
        case 'commodity_channel_index':
            return {
                id,
                name: 'commodity_channel_index',
                title: 'CCI (20,C)',
                lineStyle: line_style,
                period: 20,
                fieldType: 'close',
                pipSize: 2,
                showLastIndicator: true,
            };
        case 'macd':
            return {
                id,
                name: 'macd',
                title: 'MACD (12,26,9)',
                lineStyle: line_style,
                signalLineStyle: { color: TRADE_TYPE_INDICATOR_STYLE.red, thickness: 1 },
                barStyle: {
                    positiveColor: TRADE_TYPE_INDICATOR_STYLE.green,
                    negativeColor: TRADE_TYPE_INDICATOR_STYLE.red,
                },
                fastMAPeriod: 12,
                slowMAPeriod: 26,
                signalPeriod: 9,
                pipSize: 2,
                showLastIndicator: true,
            };
        default:
            return {
                id,
                name: indicator.flutter_chart_id,
                title: indicator.short_name.toUpperCase(),
                showLastIndicator: true,
            };
    }
};

const applyIndicatorsThroughBridge = (bridge: TFlutterIndicatorBridge, indicators: TTradeTypeIndicator[]) => {
    bridge.indicators?.clearIndicators?.();
    indicators.forEach((indicator, index) => {
        bridge.app?.addOrUpdateIndicator?.(JSON.stringify(createDirectIndicatorConfig(indicator, index)), index);
    });
};

const Chart = observer(({ show_digits_stats }: { show_digits_stats: boolean }) => {
    const barriers: [] = [];
    const { common, ui } = useStore();
    const { chart_store, run_panel, dashboard } = useStore();
    const [isSafari, setIsSafari] = useState(false);
    const [is_connection_opened, set_is_connection_opened] = useState(false);
    const [has_trade_type_indicators, set_has_trade_type_indicators] = useState(false);
    const [trade_type_bottom_indicator_count, set_trade_type_bottom_indicator_count] = useState(0);

    const tradeTypeApplyTokenRef = useRef(0);
    const indicatorControlCallbacksRef = useRef<TIndicatorControlCallbacks | null>(null);

    const {
        chart_type,
        getMarketsOrder,
        granularity,
        onSymbolChange,
        setChartStatus,
        symbol,
        updateChartType,
        updateGranularity,
        updateSymbol,
        setChartSubscriptionId,
        chart_subscription_id,
    } = chart_store;
    const chartSubscriptionIdRef = useRef(chart_subscription_id);
    const { isDesktop, isMobile } = useDevice();
    const { is_drawer_open } = run_panel;
    const { is_chart_modal_visible } = dashboard;
    const settings = {
        assetInformation: false,
        countdown: true,
        isHighestLowestMarkerEnabled: false,
        language: common.current_language.toLowerCase(),
        position: ui.is_chart_layout_default ? 'bottom' : 'left',
        theme: ui.is_dark_mode_on ? 'dark' : 'light',
    };

    // Poll the main api_base connection state
    useEffect(() => {
        const check = () => {
            const rs = api_base?.api?.connection?.readyState;
            const open = rs === WebSocket.OPEN;
            set_is_connection_opened(open);
        };
        check();
        const iv = setInterval(check, 300);
        return () => clearInterval(iv);
    }, []);

    // Safari detection + cleanup on unmount
    useEffect(() => {
        const ua = navigator.userAgent.toLowerCase();
        setIsSafari(ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android'));
        return () => {
            api_base?.api?.forgetAll?.('ticks').catch(() => {});
        };
    }, []);

    useEffect(() => {
        chartSubscriptionIdRef.current = chart_subscription_id;
    }, [chart_subscription_id]);

    useEffect(() => {
        document.body.classList.toggle('profitdock-trade-type-indicators-active', has_trade_type_indicators);

        return () => {
            document.body.classList.remove('profitdock-trade-type-indicators-active');
        };
    }, [has_trade_type_indicators]);

    useEffect(() => {
        if (!symbol) updateSymbol();
    }, [symbol, updateSymbol]);

    // Wait for the main api_base WebSocket to be open
    const waitForConnection = (): Promise<void> =>
        new Promise(resolve => {
            if (api_base?.api?.connection?.readyState === WebSocket.OPEN) return resolve();
            const iv = setInterval(() => {
                if (api_base?.api?.connection?.readyState === WebSocket.OPEN) {
                    clearInterval(iv);
                    resolve();
                }
            }, 100);
        });

    // Wait for api_base to have fetched and normalized active symbols
    const waitForActiveSymbols = (): Promise<void> =>
        new Promise(resolve => {
            if (api_base?.active_symbols?.length > 0) return resolve();
            let attempts = 0;
            const iv = setInterval(() => {
                attempts++;
                if (api_base?.active_symbols?.length > 0 || attempts > 50) {
                    clearInterval(iv);
                    resolve();
                }
            }, 200);
        });

    const active_symbol = symbol || 'R_100';

    const getFilteredSymbols = () => {
        const allowed_submarkets = ['jump_index', 'random_daily', 'random_index'];
        return (api_base.active_symbols || []).filter((s: any) => allowed_submarkets.includes(s.submarket));
    };

    const requestAPI = async (req: ServerTimeRequest | ActiveSymbolsRequest | TradingTimesRequest) => {
        if ('active_symbols' in req) {
            await waitForActiveSymbols();
            return {
                active_symbols: getFilteredSymbols(),
                msg_type: 'active_symbols',
                req_id: req.req_id || 1,
                echo_req: req,
            };
        }
        
        await waitForConnection();
        const res = await api_base.api.send(req);

        // If it's a trading times response, make sure ALL active symbols exist in it to prevent SmartChart from hanging.
        if ('trading_times' in req && res?.trading_times?.markets) {
            await waitForActiveSymbols();
            const existingSymbols = new Set<string>();
            
            // Collect all symbols already in trading times
            res.trading_times.markets.forEach((m: any) => {
                m.submarkets.forEach((sub: any) => {
                    sub.symbols.forEach((s: any) => {
                        existingSymbols.add(s.symbol);
                    });
                });
            });

            // Find an existing submarket to inject into (to guarantee correct structure)
            const fallback_market = res.trading_times.markets[0];
            const fallback_submarket = fallback_market?.submarkets?.[0];

            if (fallback_submarket) {
                const missing_symbols = getFilteredSymbols().filter((s: any) => !existingSymbols.has(s.symbol));
                missing_symbols.forEach((s: any) => {
                    fallback_submarket.symbols.push({
                        name: s.display_name,
                        symbol: s.symbol,
                        events: [], // Safe empty array to prevent 'every' exception
                        times: { close: ["23:59:59"], open: ["00:00:00"], settlement: "23:59:59" }
                    });
                });
            }
        }

        return res;
    };

    const requestForget = async (req: any) => {
        await waitForConnection();
        return api_base.api.send(req);
    };

    const requestForgetStream = async (subscription_id: string) => {
        if (!subscription_id) return Promise.resolve();
        await waitForConnection();
        return api_base.api.send({ forget: subscription_id });
    };

    const requestSubscribe = async (req: TicksStreamRequest, callback: (data: any) => void) => {
        try {
            await waitForConnection();
            if (chartSubscriptionIdRef.current) {
                await requestForgetStream(chartSubscriptionIdRef.current).catch(() => {});
            }
            
            // SmartCharts natively asks for ticks_history.
            const payload = { ...req };
            
            const history = await api_base.api.send(payload);
            setChartSubscriptionId(history?.subscription?.id);
            if (history) callback(history);
            if (req.subscribe === 1 && history?.subscription?.id) {
                subscriptions[history.subscription.id] = api_base.api
                    .onMessage()
                    ?.subscribe(({ data }: { data: any }) => {
                        if (
                            data?.subscription?.id === history.subscription.id ||
                            data?.req_id === history.req_id
                        ) {
                            callback(data);
                        }
                    });
            }
        } catch (e) {
            if ((e as TError)?.error?.code === 'MarketIsClosed') callback([]);
            console.warn('[ProfitDock] Chart subscribe error:', (e as TError)?.error?.message);
        }
    };

    const setTradeTypeStudyControlsHidden = useCallback((should_hide: boolean, store?: TSmartChartStore | null) => {
        const smart_chart_window = window as TSmartChartWindow;
        const indicators_interop = smart_chart_window.jsInterop?.indicators;
        const chart_adapter = store?.chartAdapter;
        const studies = store?.studies;

        document.body.classList.toggle('profitdock-trade-type-indicators-active', should_hide);
        store?.crosshair?.removeIndicatorToolTip?.();

        if (should_hide) {
            if (!indicatorControlCallbacksRef.current) {
                indicatorControlCallbacksRef.current = {
                    chart_adapter,
                    checkIndicatorHover: chart_adapter?.checkIndicatorHover,
                    debouncedIndicatorHover: chart_adapter?.debouncedIndicatorHover,
                    highlightIndicator: studies?.highlightIndicator,
                    onEdit: indicators_interop?.onEdit,
                    onRemove: indicators_interop?.onRemove,
                    onCrosshairHover: smart_chart_window.jsInterop?.onCrosshairHover,
                    studies,
                };
            }

            const suppressIndicatorControl = () => {
                store?.crosshair?.removeIndicatorToolTip?.();
            };

            if (indicators_interop) {
                safeDeleteProperty(indicators_interop, 'onEdit');
                safeDeleteProperty(indicators_interop, 'onRemove');
            }
            if (smart_chart_window.jsInterop) {
                safeSetProperty(smart_chart_window.jsInterop, 'onCrosshairHover', suppressIndicatorControl);
            }
            if (chart_adapter) {
                (chart_adapter.debouncedIndicatorHover as ((...args: unknown[]) => void) & { cancel?: () => void })?.cancel?.();
                safeSetProperty(chart_adapter, 'checkIndicatorHover', suppressIndicatorControl);
                safeSetProperty(chart_adapter, 'debouncedIndicatorHover', suppressIndicatorControl);
            }
            if (studies) {
                const hover_index = studies.currentHoverIndex ?? studies.previousHoverIndex;
                if (typeof hover_index === 'number') studies.clearHoverItem?.(hover_index);
                safeSetProperty(studies, 'currentHoverIndex', null);
                safeSetProperty(studies, 'previousHoverIndex', null);
                safeSetProperty(studies, 'highlightIndicator', suppressIndicatorControl);
            }
            return;
        }

        const saved_callbacks = indicatorControlCallbacksRef.current;
        if (saved_callbacks) {
            if (indicators_interop) {
                safeSetProperty(indicators_interop, 'onEdit', saved_callbacks.onEdit);
                safeSetProperty(indicators_interop, 'onRemove', saved_callbacks.onRemove);
            }
            if (smart_chart_window.jsInterop) {
                safeSetProperty(smart_chart_window.jsInterop, 'onCrosshairHover', saved_callbacks.onCrosshairHover);
            }
            if (saved_callbacks.chart_adapter) {
                safeSetProperty(saved_callbacks.chart_adapter, 'checkIndicatorHover', saved_callbacks.checkIndicatorHover);
                safeSetProperty(saved_callbacks.chart_adapter, 'debouncedIndicatorHover', saved_callbacks.debouncedIndicatorHover);
            }
            if (saved_callbacks.studies) {
                safeSetProperty(saved_callbacks.studies, 'highlightIndicator', saved_callbacks.highlightIndicator);
            }
            indicatorControlCallbacksRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => setTradeTypeStudyControlsHidden(false);
    }, [setTradeTypeStudyControlsHidden]);

    const handleTradeTypeSelect = useCallback(async (indicators: TTradeTypeIndicator[], smart_chart_store?: unknown) => {
        const apply_token = ++tradeTypeApplyTokenRef.current;
        const store = await waitForSmartChartStore(CHART_ID, false, smart_chart_store);

        localStorage.removeItem('predictionIndicators');

        if (!indicators.length) {
            store?.studies?.deleteAllStudies?.();
            getFlutterChartBridge(store)?.indicators?.clearIndicators?.();
            store?.bottomWidgetsContainer?.updateChartHeight?.();
            set_has_trade_type_indicators(false);
            set_trade_type_bottom_indicator_count(0);
            setTradeTypeStudyControlsHidden(false, store);
            return;
        }

        if (granularity !== ONE_MINUTE_GRANULARITY) updateGranularity(ONE_MINUTE_GRANULARITY);
        if (chart_type !== CANDLE_CHART_TYPE) updateChartType(CANDLE_CHART_TYPE);

        const ready_store = await waitForOneMinuteCandles(CHART_ID, store || smart_chart_store);
        if (apply_token !== tradeTypeApplyTokenRef.current) return;

        const studies = ready_store?.studies;
        const indicator_bridge = await waitForIndicatorBridge(ready_store || store);

        if (!indicator_bridge?.app?.addOrUpdateIndicator) {
            console.warn('[ProfitDock] SmartChart indicator bridge is not ready; trade type indicators were not applied.');
            return;
        }

        setTradeTypeStudyControlsHidden(false, ready_store);
        let did_apply_through_store = false;
        const bottom_indicator_count = indicators.filter(indicator =>
            BOTTOM_PANEL_INDICATORS.has(indicator.flutter_chart_id)
        ).length;

        if (studies?.deleteAllStudies && studies?.onSelectItem) {
            studies.deleteAllStudies();
            setTradeTypeStudyControlsHidden(true, ready_store);
            indicators.forEach(indicator => studies.onSelectItem?.(indicator.flutter_chart_id));
            did_apply_through_store = (studies.activeItems?.length ?? indicators.length) >= indicators.length;
        }

        if (!did_apply_through_store) {
            setTradeTypeStudyControlsHidden(true, ready_store);
            applyIndicatorsThroughBridge(indicator_bridge, indicators);
            ready_store?.bottomWidgetsContainer?.updateChartHeight?.();
        }

        set_has_trade_type_indicators(true);
        set_trade_type_bottom_indicator_count(bottom_indicator_count);
        setTradeTypeStudyControlsHidden(true, ready_store);
        ready_store?.crosshair?.removeIndicatorToolTip?.();
        ready_store?.state?.saveLayout?.();
    }, [granularity, chart_type, updateGranularity, updateChartType, setTradeTypeStudyControlsHidden]);

    return (
        <div
            className={classNames('dashboard__chart-wrapper', {
                'dashboard__chart-wrapper--expanded': is_drawer_open && isDesktop,
                'dashboard__chart-wrapper--modal': is_chart_modal_visible && isDesktop,
                'dashboard__chart-wrapper--safari': isSafari,
                'dashboard__chart-wrapper--trade-type-indicators': has_trade_type_indicators,
            })}
            dir='ltr'
            style={{ position: 'relative' }}
        >
            {has_trade_type_indicators && trade_type_bottom_indicator_count > 0 && (
                <div
                    aria-hidden='true'
                    className={classNames(
                        'trade-type-indicator-control-masks',
                        `trade-type-indicator-control-masks--${Math.min(trade_type_bottom_indicator_count, 3)}`
                    )}
                >
                    {Array.from({ length: Math.min(trade_type_bottom_indicator_count, 3) }, (_, index) => (
                        <span
                            key={`trade-type-indicator-control-mask-${index}`}
                            className='trade-type-indicator-control-masks__item'
                            style={{ '--trade-type-mask-index': index } as CSSProperties}
                        />
                    ))}
                </div>
            )}
            <SmartChart
                    id={CHART_ID}
                    barriers={barriers}
                    showLastDigitStats={show_digits_stats}
                    enabledChartFooter={false}
                    chartStatusListener={(v: boolean) => setChartStatus(!v)}
                    toolbarWidget={() => (
                        <ToolbarWidgets
                            updateChartType={updateChartType}
                            updateGranularity={updateGranularity}
                            position={!isDesktop ? 'bottom' : 'top'}
                            isDesktop={true}
                            onSelectTradeType={handleTradeTypeSelect}
                        />
                    )}
                chartType={chart_type}
                isMobile={isMobile}
                enabledNavigationWidget={isDesktop}
                granularity={granularity}
                requestAPI={requestAPI}
                requestForget={requestForget}
                requestForgetStream={requestForgetStream}
                requestSubscribe={requestSubscribe}
                settings={settings}
                symbol={active_symbol}
                topWidgets={() => <ChartTitle onChange={onSymbolChange} />}
                isConnectionOpened={is_connection_opened}
                getMarketsOrder={getMarketsOrder}
                isLive
                leftMargin={80}
            />
        </div>
    );
});

export default Chart;
