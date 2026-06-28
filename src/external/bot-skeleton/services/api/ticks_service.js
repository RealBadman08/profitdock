/* eslint-disable no-confusing-arrow */
import { Map } from 'immutable';
import { clearAuthData } from '@/utils/auth-utils';
import { getLast, historyToTicks } from '../../utils/binary-utils';
import { observer as globalObserver } from '../../utils/observer';
import { doUntilDone, getUUID } from '../tradeEngine/utils/helpers';
import { api_base } from './api-base';

const getTickSymbol = tick => tick?.symbol || tick?.underlying_symbol || tick?.underlying;

const parseTick = tick => ({
    epoch: +(tick?.epoch ?? tick?.time ?? 0),
    quote: +(tick?.quote ?? tick?.price ?? 0),
});

const parseOhlc = ohlc => ({
    open: +ohlc.open,
    high: +ohlc.high,
    low: +ohlc.low,
    close: +ohlc.close,
    epoch: +(ohlc.open_time || ohlc.epoch),
});

const parseCandles = candles => candles.map(t => parseOhlc(t));

const updateTicks = (ticks, newTick) => (getLast(ticks).epoch >= newTick.epoch ? ticks : [...ticks.slice(1), newTick]);

const updateCandles = (candles, ohlc) => {
    const lastCandle = getLast(candles);
    if (
        (lastCandle.open === ohlc.open &&
            lastCandle.high === ohlc.high &&
            lastCandle.low === ohlc.low &&
            lastCandle.close === ohlc.close &&
            lastCandle.epoch === ohlc.epoch) ||
        lastCandle.epoch > ohlc.epoch
    ) {
        return candles;
    }
    const prevCandles = lastCandle.epoch === ohlc.epoch ? candles.slice(0, -1) : candles.slice(1);
    return [...prevCandles, ohlc];
};

const getType = isCandle => (isCandle ? 'candles' : 'ticks');

const shouldIgnoreForgetError = error => {
    const api_error = error?.error || error;
    return ['RateLimit', 'InvalidSubscription', 'InputValidationFailed'].includes(api_error?.code);
};

const getApiErrorCode = error => error?.error?.code || error?.code;

export default class TicksService {
    constructor() {
        this.ticks = new Map();
        this.candles = new Map();
        this.tickListeners = new Map();
        this.ohlcListeners = new Map();
        this.subscriptions = new Map();
        this.ticks_history_promise = null;
        this.active_symbols_promise = null;
        this.candles_promise = null;

        this.observe();
    }

    requestPipSizes() {
        if (this.pipSizes) {
            return Promise.resolve(this.pipSizes);
        }

        if (!this.active_symbols_promise) {
            this.active_symbols_promise = new Promise(resolve => {
                this.pipSizes = api_base.pip_sizes;
                resolve(this.pipSizes);
            });
        }
        return this.active_symbols_promise;
    }

    async request(options) {
        return new Promise((resolve, reject) => {
            const { symbol, granularity } = options;

            const style = getType(granularity);

            if (style === 'ticks' && this.ticks.has(symbol)) {
                resolve(this.ticks.get(symbol));
            }

            if (style === 'candles' && this.candles.hasIn([symbol, Number(granularity)])) {
                resolve(this.candles.getIn([symbol, Number(granularity)]));
            }
            this.requestStream({ ...options, style })
                .then(res => {
                    resolve(res);
                })
                .catch(e => {
                    reject(e);
                });
        });
    }

    monitor(options) {
        return new Promise((resolve, reject) => {
            const { symbol, granularity, callback } = options;

            const type = getType(granularity);

            const key = getUUID();
            this.request(options)
                .then(() => {
                    if (type === 'ticks') {
                        this.tickListeners = this.tickListeners.setIn([symbol, key], callback);
                        globalObserver.emit('bot.bot_ready');
                        api_base.toggleRunButton(false);
                    } else {
                        this.ohlcListeners = this.ohlcListeners.setIn([symbol, Number(granularity), key], callback);
                    }
                    resolve(key);
                })
                .catch(e => {
                    globalObserver.emit('Error', e);
                    this.ticks_history_promise = null;
                    api_base.toggleRunButton(false);
                    reject(e);
                });
        });
    }

    async stopMonitor(options) {
        const { symbol, granularity, key } = options;
        const type = getType(granularity);

        if (type === 'ticks' && this.tickListeners.hasIn([symbol, key])) {
            this.tickListeners = this.tickListeners.deleteIn([symbol, key]);
        }

        if (type === 'candles' && this.ohlcListeners.hasIn([symbol, Number(granularity), key])) {
            this.ohlcListeners = this.ohlcListeners.deleteIn([symbol, Number(granularity), key]);
        }

        await this.unsubscribeIfEmptyListeners(options);
    }

    async unsubscribeIfEmptyListeners(options) {
        const { symbol, granularity } = options;

        let needToUnsubscribe = false;

        const tickListener = this.tickListeners.get(symbol);

        if (tickListener && !tickListener.size) {
            this.tickListeners = this.tickListeners.delete(symbol);
            this.ticks = this.ticks.delete(symbol);
            needToUnsubscribe = true;
        }

        const ohlcListener = this.ohlcListeners.getIn([symbol, Number(granularity)]);

        if (ohlcListener && !ohlcListener.size) {
            this.ohlcListeners = this.ohlcListeners.deleteIn([symbol, Number(granularity)]);
            this.candles = this.candles.deleteIn([symbol, Number(granularity)]);
            needToUnsubscribe = true;
        }

        if (needToUnsubscribe) {
            await this.unsubscribeAllAndSubscribeListeners(symbol);
        }
    }

    unsubscribeAllAndSubscribeListeners(symbol) {
        const ohlcSubscriptions = this.subscriptions.getIn(['ohlc', symbol]);

        const subscription = [...(ohlcSubscriptions ? Array.from(ohlcSubscriptions.values()) : [])];

        Promise.all(subscription.map(id => doUntilDone(() => api_base.api.forget(id))));

        this.subscriptions = new Map();
    }

    updateTicksAndCallListeners(symbol, ticks) {
        if (this.ticks.get(symbol) === ticks) {
            return;
        }
        this.ticks = this.ticks.set(symbol, ticks);

        const listeners = this.tickListeners.get(symbol);

        if (listeners) {
            listeners.forEach(callback => callback(this.ticks.get(symbol)));
        }
    }

    updateCandlesAndCallListeners(address, candles) {
        if (this.ticks.getIn(address) === candles) {
            return;
        }
        this.candles = this.candles.setIn(address, candles);

        const listeners = this.ohlcListeners.getIn(address);

        if (listeners) {
            listeners.forEach(callback => callback(this.candles.getIn(address)));
        }
    }

    observe() {
        if (api_base.api) {
            const subscription = api_base.api.onMessage().subscribe(message => {
                const data = message?.data;

                if (!data || typeof data !== 'object') {
                    return;
                }

                if (data.msg_type === 'tick') {
                    const { tick } = data;
                    const symbol = getTickSymbol(tick);
                    const id = tick?.id || data.subscription?.id;

                    if (!symbol || !tick) {
                        return;
                    }

                    if (this.ticks.has(symbol)) {
                        this.subscriptions = this.subscriptions.setIn(['tick', symbol], id);
                        this.updateTicksAndCallListeners(symbol, updateTicks(this.ticks.get(symbol), parseTick(tick)));
                    }
                }

                if (data.msg_type === 'ohlc') {
                    const { ohlc } = data;
                    const symbol = getTickSymbol(ohlc);
                    const granularity = ohlc?.granularity;
                    const id = ohlc?.id || data.subscription?.id;

                    if (!symbol || !ohlc) {
                        return;
                    }

                    if (this.candles.hasIn([symbol, Number(granularity)])) {
                        this.subscriptions = this.subscriptions.setIn(['ohlc', symbol, Number(granularity)], id);
                        const address = [symbol, Number(granularity)];
                        this.updateCandlesAndCallListeners(
                            address,
                            updateCandles(this.candles.getIn(address), parseOhlc(ohlc))
                        );
                    }
                }
            });
            api_base.pushSubscription(subscription);
        }
    }

    requestStream(options) {
        const { style } = options;
        const stringified_options = JSON.stringify(options);

        if (style === 'ticks') {
            if (this.ticks_history_promise?.stringified_options !== stringified_options) {
                this.ticks_history_promise = {
                    promise: this.requestPipSizes().then(() => this.requestTicks(options)),
                    stringified_options,
                };
            }

            return this.ticks_history_promise.promise;
        }

        if (style === 'candles') {
            if (!this.candles_promise || this.candles_promise.stringified_options !== stringified_options) {
                this.candles_promise = {
                    promise: this.requestPipSizes().then(() => this.requestTicks(options)),
                    stringified_options,
                };
            }

            return this.candles_promise.promise;
        }

        return [];
    }

    requestTicks(options) {
        const { symbol, granularity, style } = options;
        const request_symbol = symbol === 'na' ? 'R_100' : symbol;
        const request_object = {
            ticks_history: request_symbol,
            subscribe: 1,
            end: 'latest',
            count: 1000,
            granularity: granularity ? Number(granularity) : undefined,
            style,
        };
        return new Promise((resolve, reject) => {
            if (!api_base.api) {
                resolve([]);
                return;
            }

            doUntilDone(() => api_base.api.send(request_object), [], api_base)
                .then(r => {
                    if (r?.error) {
                        if (r.error.code === 'RateLimit' && style === 'ticks') {
                            this.requestLiveTickStreamOnly(request_symbol).then(resolve).catch(reject);
                            return;
                        }
                        reject(r.error);
                        return;
                    }

                    if (style === 'ticks') {
                        if (!r?.history?.times || !r?.history?.prices) {
                            reject(new Error('Deriv did not return tick history for this market yet.'));
                            return;
                        }

                        const ticks = historyToTicks(r.history);

                        this.updateTicksAndCallListeners(symbol, ticks);
                        resolve(ticks);
                    } else {
                        if (!Array.isArray(r?.candles)) {
                            reject(new Error('Deriv did not return candle history for this market yet.'));
                            return;
                        }

                        const candles = parseCandles(r.candles);

                        this.updateCandlesAndCallListeners([symbol, Number(granularity)], candles);

                        resolve(candles);
                    }
                })
                .catch(error => {
                    if (error?.code === 'InvalidSymbol') {
                        clearAuthData();
                    }
                    if (getApiErrorCode(error) === 'RateLimit' && style === 'ticks') {
                        this.requestLiveTickStreamOnly(request_symbol).then(resolve).catch(reject);
                        return;
                    }
                    reject(error);
                });
        });
    }

    requestLiveTickStreamOnly(symbol) {
        return new Promise((resolve, reject) => {
            if (!api_base.api?.send) {
                resolve([]);
                return;
            }

            api_base.api
                .send({
                    ticks: symbol,
                    subscribe: 1,
                })
                .then(response => {
                    if (response?.error) {
                        reject(response.error);
                        return;
                    }

                    const tick = response?.tick;
                    if (!tick) {
                        const current_ticks = this.ticks.get(symbol) || [];
                        this.ticks = this.ticks.set(symbol, current_ticks);
                        resolve(current_ticks);
                        return;
                    }

                    const tick_symbol = getTickSymbol(tick) || symbol;
                    const parsed_tick = parseTick(tick);
                    const existing_ticks = this.ticks.get(tick_symbol) || [];
                    const next_ticks = existing_ticks.length ? updateTicks(existing_ticks, parsed_tick) : [parsed_tick];
                    const id = tick?.id || response?.subscription?.id;

                    if (id) {
                        this.subscriptions = this.subscriptions.setIn(['tick', tick_symbol], id);
                    }

                    this.updateTicksAndCallListeners(tick_symbol, next_ticks);
                    resolve(next_ticks);
                })
                .catch(error => {
                    if (getApiErrorCode(error) === 'RateLimit') {
                        const current_ticks = this.ticks.get(symbol) || [];
                        this.ticks = this.ticks.set(symbol, current_ticks);
                        resolve(current_ticks);
                        return;
                    }
                    reject(error);
                });
        });
    }

    forget = () => {
        return new Promise(resolve => {
            if (api_base?.api) {
                api_base.api
                    .forgetAll('ticks')
                    .then(() => {
                        resolve();
                    })
                    .catch(error => {
                        if (!shouldIgnoreForgetError(error)) {
                            console.warn('[ProfitDock] Tick cleanup skipped:', error?.error?.message || error?.message || error);
                        }
                        resolve();
                    });
            } else {
                resolve();
            }
        });
    };

    forgetCandleSubscription = () => {
        return new Promise(resolve => {
            if (api_base?.api) {
                api_base.api
                    .forgetAll('candles')
                    .then(() => {
                        resolve();
                    })
                    .catch(error => {
                        if (!shouldIgnoreForgetError(error)) {
                            console.warn('[ProfitDock] Candle cleanup skipped:', error?.error?.message || error?.message || error);
                        }
                        resolve();
                    });
            } else {
                resolve();
            }
        });
    };

    unsubscribeFromTicksService() {
        return new Promise((resolve, reject) => {
            this.forget()
                .then(() => {
                    this.forgetCandleSubscription()
                        .then(() => {
                            resolve();
                        })
                        .catch(reject);
                })
                .catch(reject);
            this.ticks_history_promise = null;
        });
    }
}
