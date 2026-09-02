/**
 * VirtualTradingEngine
 *
 * Hybrid virtual trading engine:
 *  - PROPOSAL is fetched from the REAL Deriv API (via caller, see virtual-trade.ts)
 *  - BUY is intercepted locally — no real trade placed on Deriv
 *  - Settlement tracked via REAL live tick stream
 *  - Balance managed via local dummy_balance
 *
 * NOTE: No imports from api-base.ts to avoid circular dependencies.
 * The real API is accessed lazily via window._profitdockApiBase.
 */

import { normalizeApiMessage } from '@/features/deriv-live/api';

// Lazy accessor — api_base is exposed on window after it initializes
const getApiBase = () => (window as any)._profitdockApiBase;

interface FakeContract {
    contract_id: number;
    buy_price: number;
    payout: number;
    contract_type: string;
    symbol: string;
    duration: number;
    duration_unit: string;
    growth_rate?: number;
    barrier?: string;
    entry_spot?: number;
    entry_tick_display_value?: string;
    entry_tick_time?: number;
    high_barrier?: string;
    low_barrier?: string;
    current_spot?: number;
    current_spot_display_value?: string;
    current_spot_time?: number;
    exit_spot?: number;
    exit_tick_display_value?: string;
    exit_tick_time?: number;
    status: 'open' | 'won' | 'lost';
    profit?: number;
    ticks_seen: number;
    is_sold: number;
    is_expired: number;
    sell_price?: number;
    sell_time?: number;
    shortcode: string;
    longcode: string;
    purchase_time: number;
    date_start: number;
    underlying: string;
    display_name: string;
    pip_size?: number;
    [key: string]: any;
}

class VirtualTradingEngine {
    private contracts = new Map<number, FakeContract>();
    private proposalStore = new Map<string, any>();
    private eventSubscribers = new Set<(msg: any) => void>();
    private lastSpots = new Map<string, number>();
    private subscribedSymbols = new Set<string>();
    private tickListenerAttached = false;

    private nextContractId = 2000000000;

    constructor() {
        if (typeof window !== 'undefined') {
            // Defer tick listener attachment until api_base is available
            this._scheduleTickAttach();
        }
    }

    private _scheduleTickAttach() {
        const tryAttach = () => {
            const apiBase = getApiBase();
            if (!apiBase?.api?.onMessage) return false;

            if (this.tickListenerAttached) return true;
            this.tickListenerAttached = true;

            apiBase.api.onMessage().subscribe((raw: any) => {
                const msg = raw?.data ? raw.data : raw;
                if (msg?.msg_type === 'tick' && msg.tick) {
                    const { symbol, quote, epoch, pip_size } = msg.tick;
                    this.lastSpots.set(symbol, Number(quote));
                    this._processTick(symbol, Number(quote), Number(epoch), Number(pip_size) || 2);
                }
            });

            // Subscribe for any symbols that were queued before api was ready
            this.subscribedSymbols.forEach(sym => {
                apiBase.api?.send({ ticks: sym, subscribe: 1 })?.catch?.(() => {});
            });

            return true;
        };

        if (!tryAttach()) {
            const interval = setInterval(() => {
                if (tryAttach()) clearInterval(interval);
            }, 300);
        }
    }

    _requestTicks(symbol: string) {
        if (this.subscribedSymbols.has(symbol)) return;
        this.subscribedSymbols.add(symbol);
        const apiBase = getApiBase();
        if (apiBase?.api) {
            apiBase.api.send({ ticks: symbol, subscribe: 1 })?.catch?.(() => {});
        }
        // If api not ready yet, _scheduleTickAttach will send it once ready
    }

    private _getLastDigit(spot: number, pipSize: number): number {
        const rounded = spot.toFixed(pipSize);
        return parseInt(rounded[rounded.length - 1]);
    }

    private _isWin(contract: FakeContract, currentSpot: number): boolean {
        const entry = contract.entry_spot ?? currentSpot;
        const type = contract.contract_type.toUpperCase();
        const pipSize = contract.pip_size ?? 2;
        const lastDigit = this._getLastDigit(currentSpot, pipSize);
        const barrierDigit = parseInt(contract.barrier ?? '0');

        switch (type) {
            case 'CALL':
                return contract.barrier ? currentSpot > entry + Number(contract.barrier) : currentSpot > entry;
            case 'PUT':
                return contract.barrier ? currentSpot < entry + Number(contract.barrier) : currentSpot < entry;
            case 'CALLE':
                return currentSpot >= entry;
            case 'PUTE':
                return currentSpot <= entry;
            case 'ONETOUCH':
                // In a real engine, ONETOUCH wins instantly if touched. Here we evaluate at expiry for simplicity,
                // but ideally it should check if the spot ever touched the barrier.
                // We can approximate by checking if the barrier is between entry and exit, but since it's just virtual,
                // a simple check if it crossed or touched is better.
                return contract.barrier && Number(contract.barrier) > 0
                    ? currentSpot >= entry + Number(contract.barrier)
                    : currentSpot <= entry + Number(contract.barrier);
            case 'NOTOUCH':
                return contract.barrier && Number(contract.barrier) > 0
                    ? currentSpot < entry + Number(contract.barrier)
                    : currentSpot > entry + Number(contract.barrier);
            case 'RUNHIGH': // Only Ups
                // Real Only Ups requires every tick to be strictly higher than the previous.
                // For virtual approximation, we just ensure the exit is higher than entry.
                return currentSpot > entry;
            case 'RUNLOW': // Only Downs
                return currentSpot < entry;
            case 'DIGITEVEN':
                return lastDigit % 2 === 0;
            case 'DIGITODD':
                return lastDigit % 2 !== 0;
            case 'DIGITMATCH':
                return lastDigit === barrierDigit;
            case 'DIGITDIFF':
                return lastDigit !== barrierDigit;
            case 'DIGITOVER':
                return lastDigit > barrierDigit;
            case 'DIGITUNDER':
                return lastDigit < barrierDigit;
            case 'ASIANU':
                return currentSpot > entry;
            case 'ASIAND':
                return currentSpot < entry;
            case 'EXPIRYMISS':
            case 'UPORDOWN':
                if (contract.high_barrier && contract.low_barrier) {
                    return currentSpot > Number(contract.high_barrier) || currentSpot < Number(contract.low_barrier);
                }
                return false;
            case 'RANGE':
            case 'EXPIRYRANGE':
                if (contract.high_barrier && contract.low_barrier) {
                    return currentSpot < Number(contract.high_barrier) && currentSpot > Number(contract.low_barrier);
                }
                return false;
            default:
                return currentSpot > entry;
        }
    }

    private _processTick(symbol: string, spot: number, epoch: number, pipSize: number) {
        for (const contract of this.contracts.values()) {
            if (contract.symbol !== symbol || contract.is_sold) continue;

            const fmt = spot.toFixed(pipSize);

            if (contract.entry_spot == null) {
                // First tick = entry
                contract.entry_spot = spot;
                contract.entry_tick_display_value = fmt;
                contract.entry_tick_time = epoch;
                contract.ticks_seen = 1;

                const resolveBarrier = (b?: string) => {
                    if (!b) return b;
                    if (b.startsWith('+')) return String(spot + Number(b.substring(1)));
                    if (b.startsWith('-')) return String(spot - Number(b.substring(1)));
                    return b;
                };
                contract.high_barrier = resolveBarrier(contract.high_barrier);
                contract.low_barrier = resolveBarrier(contract.low_barrier);
            } else {
                contract.ticks_seen++;
            }

            contract.current_spot = spot;
            contract.current_spot_display_value = fmt;
            contract.current_spot_time = epoch;
            contract.pip_size = pipSize;

            const winning = this._isWin(contract, spot);
            contract.profit = winning ? +(contract.payout - contract.buy_price).toFixed(2) : -contract.buy_price;

            this._emit({
                msg_type: 'proposal_open_contract',
                proposal_open_contract: this._contractPayload(contract),
            });

            // For accumulators, update profit per tick and do not auto-settle by duration
            if (contract.contract_type === 'ACCU') {
                const rate = Number(contract.growth_rate) || 0.01; // fallback to 1% if missing
                if (contract.ticks_seen > 0) {
                    const accumulatedPayout = contract.buy_price * Math.pow(1 + rate, contract.ticks_seen);
                    contract.profit = +(accumulatedPayout - contract.buy_price).toFixed(2);

                    this._emit({
                        msg_type: 'proposal_open_contract',
                        proposal_open_contract: this._contractPayload(contract),
                    });
                }
                return; // Accumulators only settle on sell or barrier cross
            }

            // Settle when duration expires
            const durUnit = contract.duration_unit;
            const elapsed = epoch - (contract.date_start ?? epoch);

            if (durUnit === 't' && contract.ticks_seen >= contract.duration) {
                this._settle(contract, spot, epoch, pipSize);
            } else if (durUnit === 's' && elapsed >= contract.duration) {
                this._settle(contract, spot, epoch, pipSize);
            } else if (durUnit === 'm' && elapsed >= contract.duration * 60) {
                this._settle(contract, spot, epoch, pipSize);
            } else if (durUnit === 'h' && elapsed >= contract.duration * 3600) {
                this._settle(contract, spot, epoch, pipSize);
            }
        }
    }

    private _settle(contract: FakeContract, spot: number, epoch: number, pipSize: number) {
        if (contract.is_sold) return; // Prevent double-settlement
        const fmt = spot.toFixed(pipSize);
        const won = this._isWin(contract, spot);

        contract.is_sold = 1;
        contract.is_expired = 1;
        contract.exit_spot = spot;
        contract.exit_tick_display_value = fmt;
        contract.exit_tick_time = epoch;
        contract.status = won ? 'won' : 'lost';
        contract.sell_price = won ? contract.payout : 0;
        contract.sell_time = epoch;
        contract.profit = won ? +(contract.payout - contract.buy_price).toFixed(2) : -contract.buy_price;

        // Update virtual balance
        const store = (window as any)._clientStore;
        if (store && won) {
            store.setDummyBalance(store.dummy_balance + contract.buy_price + (contract.profit ?? 0));
        }

        // Notify virtual CR accounts
        window.dispatchEvent(
            new CustomEvent('profitdock:trade-result', {
                detail: { profit: contract.profit ?? 0, stake: contract.buy_price },
            })
        );

        this._emit({
            msg_type: 'proposal_open_contract',
            proposal_open_contract: this._contractPayload(contract),
        });
    }

    private _contractPayload(contract: FakeContract) {
        const store = (window as any)._clientStore;
        return {
            ...contract,
            entry_tick: contract.entry_spot,
            entry_tick_time: contract.entry_tick_time,
            exit_tick: contract.exit_spot,
            exit_tick_time: contract.exit_tick_time,
            current_spot: contract.current_spot,
            current_spot_time: contract.current_spot_time,
            current_spot_display_value: contract.current_spot_display_value,
            high_barrier:
                contract.contract_type === 'ACCU' && contract.current_spot
                    ? String(contract.current_spot * 1.001)
                    : undefined,
            low_barrier:
                contract.contract_type === 'ACCU' && contract.current_spot
                    ? String(contract.current_spot * 0.999)
                    : undefined,
            status: contract.status,
            profit: contract.profit,
            is_valid_to_sell: contract.is_sold ? 0 : 1,
            is_sold: contract.is_sold,
            is_expired: contract.is_expired,
            growth_rate: contract.growth_rate,
            sell_price: contract.is_sold ? contract.sell_price : undefined,
            bid_price: contract.buy_price,
            currency: store?.currency || 'USD',
            transaction_ids: {
                buy: contract.contract_id,
                sell: contract.is_sold ? contract.contract_id + 1 : undefined,
            },
            audit_details: { all_ticks: [] },
        };
    }

    // -------- Proposal store (populated by callers with real Deriv proposal data) --------

    storeProposal(proposalId: string, proposalData: any) {
        this.proposalStore.set(proposalId, proposalData);
    }

    // -------- Public request handler --------

    async handleRequest(req: Record<string, any>): Promise<any> {
        // ---- PROPOSAL: fetch REAL payout from Deriv (bypasses interceptor via _vrtc_skip) ----
        if (req.proposal) {
            const apiBase = getApiBase();
            if (!apiBase?.api) {
                return { error: { code: 'ApiNotReady', message: 'API not initialized yet' } };
            }
            try {
                // _vrtc_skip tells the interceptor to pass this through to real Deriv
                const rawRes = await apiBase.api.send({ ...req, passthrough: { _vrtc_skip: true } });
                const res = normalizeApiMessage<any>(rawRes);

                if (res?.proposal?.id) {
                    const resolvedSymbol = req.symbol || req.underlying_symbol;
                    this.proposalStore.set(res.proposal.id, {
                        payout: res.proposal.payout,
                        ask_price: res.proposal.ask_price,
                        longcode: res.proposal.longcode,
                        symbol: resolvedSymbol,
                        contract_type: req.contract_type,
                        duration: req.duration,
                        duration_unit: req.duration_unit || 't',
                        growth_rate: req.growth_rate,
                        barrier: res.proposal.barrier || req.barrier,
                        high_barrier: res.proposal.high_barrier || req.barrier,
                        low_barrier: res.proposal.low_barrier || req.barrier2,
                        display_name: res.proposal.display_name,
                    });
                    if (resolvedSymbol) this._requestTicks(resolvedSymbol);
                }
                return rawRes;
            } catch (e: any) {
                return { error: { message: e?.message ?? String(e) } };
            }
        }

        // ---- BUY: intercept locally, create fake contract ----
        if (req.buy) {
            const propId = String(req.buy);
            const price = Number(req.price);
            let prop = this.proposalStore.get(propId);

            // If propId wasn't found (e.g. buy: 1 with parameters), use parameters
            if (!prop && req.parameters) {
                prop = {
                    contract_type: req.parameters.contract_type || 'CALL',
                    symbol: req.parameters.symbol || req.parameters.underlying_symbol || 'R_100',
                    duration: req.parameters.duration || 5,
                    duration_unit: req.parameters.duration_unit || 't',
                    growth_rate: req.parameters.growth_rate,
                    barrier: req.parameters.barrier,
                    payout: price * 1.95, // mock payout for direct buy
                    longcode: 'Virtual Contract',
                    ask_price: price,
                    display_name: 'Virtual',
                };
            }

            // Fallback if neither exists
            prop = prop ?? {
                contract_type: 'CALL',
                symbol: 'R_100',
                duration: 5,
                duration_unit: 't',
                payout: price * 1.95,
                longcode: 'Virtual Contract',
            };

            const store = (window as any)._clientStore;
            if (store) {
                if (price > store.dummy_balance) {
                    return {
                        error: {
                            code: 'InsufficientBalance',
                            message: 'Insufficient balance.',
                        },
                    };
                }
                store.setDummyBalance(store.dummy_balance - price);
            }

            const contractId = this.nextContractId++;
            const now = Math.floor(Date.now() / 1000);

            const contract: FakeContract = {
                contract_id: contractId,
                buy_price: price,
                payout: prop.payout ?? price * 1.95,
                contract_type: (prop.contract_type ?? 'CALL').toUpperCase(),
                symbol: prop.symbol ?? 'R_100',
                duration: Number(prop.duration) || 5,
                duration_unit: prop.duration_unit || 't',
                growth_rate: prop.growth_rate,
                barrier: prop.barrier != null ? String(prop.barrier) : undefined,
                high_barrier: prop.high_barrier != null ? String(prop.high_barrier) : undefined,
                low_barrier: prop.low_barrier != null ? String(prop.low_barrier) : undefined,
                status: 'open',
                profit: undefined,
                ticks_seen: 0,
                is_sold: 0,
                is_expired: 0,
                shortcode: `VRTC_${prop.contract_type}_${contractId}`,
                longcode: prop.longcode ?? `Virtual ${prop.contract_type} ${contractId}`,
                purchase_time: now,
                date_start: now,
                underlying: prop.symbol ?? 'R_100',
                display_name: prop.display_name ?? prop.symbol ?? 'Virtual',
            };

            this.contracts.set(contractId, contract);
            this._requestTicks(contract.symbol);

            // Emit immediate open event so callers know the contract started
            setTimeout(() => {
                this._emit({
                    msg_type: 'proposal_open_contract',
                    proposal_open_contract: this._contractPayload(contract),
                });
            }, 50);

            return {
                msg_type: 'buy',
                buy: {
                    balance_after: store?.dummy_balance ?? 0,
                    buy_price: price,
                    contract_id: contractId,
                    longcode: contract.longcode,
                    payout: contract.payout,
                    purchase_time: now,
                    shortcode: contract.shortcode,
                    start_time: now,
                    transaction_id: contractId,
                },
                echo_req: req,
            };
        }

        // ---- SELL: close early at current spot ----
        if (req.sell) {
            const contractId = Number(req.sell);
            const contract = this.contracts.get(contractId);
            if (contract && !contract.is_sold) {
                const spot = this.lastSpots.get(contract.symbol) ?? contract.current_spot ?? 0;
                this._settle(contract, spot, Math.floor(Date.now() / 1000), contract.pip_size ?? 2);
                const store = (window as any)._clientStore;
                return {
                    msg_type: 'sell',
                    sell: {
                        balance_after: store?.dummy_balance ?? 0,
                        contract_id: contractId,
                        reference_id: contractId,
                        sold_for: Math.max(0, contract.buy_price + (contract.profit ?? 0)),
                        transaction_id: contractId,
                    },
                    echo_req: req,
                };
            }
            return { error: { code: 'ContractNotFound', message: 'Cannot sell virtual contract' } };
        }

        // ---- PROPOSAL_OPEN_CONTRACT: polling fallback ----
        if (req.proposal_open_contract !== undefined) {
            // API sends { proposal_open_contract: 1, contract_id: 12345 }
            const contractId = Number(
                req.contract_id || (req.proposal_open_contract !== 1 ? req.proposal_open_contract : undefined)
            );
            if (contractId) {
                const contract = this.contracts.get(contractId);
                if (contract) {
                    return {
                        msg_type: 'proposal_open_contract',
                        proposal_open_contract: this._contractPayload(contract),
                        subscription: req.subscribe ? { id: `vrtc_sub_${contractId}` } : undefined,
                        echo_req: req,
                    };
                }
            }
            return { error: { code: 'ContractNotFound', message: 'Virtual contract not found' } };
        }

        return null;
    }

    subscribe(callback: (msg: any) => void): () => void {
        this.eventSubscribers.add(callback);
        return () => this.eventSubscribers.delete(callback);
    }

    private _emit(msg: any) {
        this.eventSubscribers.forEach(cb => {
            try {
                cb(msg);
            } catch {
                /* ignore */
            }
        });
    }
}

export const virtualEngine = new VirtualTradingEngine();
