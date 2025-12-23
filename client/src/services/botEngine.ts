import { getDerivWS } from './derivWebSocket';
import * as indicators from 'technicalindicators';

interface BotConfig {
  xml?: string;
  market: string;
  stake: number;
  duration: number;
  contractType: 'CALL' | 'PUT' | 'CALLE' | 'PUTE' | 'DIGITMATCH' | 'DIGITDIFF' | 'DIGITODD' | 'DIGITEVEN' | 'DIGITOVER' | 'DIGITUNDER';
  stopLoss?: number;
  takeProfit?: number;
}

interface Trade {
  id: string;
  contractType: string;
  stake: number;
  payout: number;
  result: 'win' | 'loss' | 'pending';
  timestamp: number;
}

export class BotEngine {
  private ws = getDerivWS();
  private isRunning = false;
  private isPaused = false;
  private config: BotConfig | null = null;
  private trades: Trade[] = [];
  private stats = {
    totalStake: 0,
    totalPayout: 0,
    runs: 0,
    won: 0,
    lost: 0,
    profit: 0,
  };
  private onStatsUpdate?: (stats: typeof this.stats) => void;
  private onTradeUpdate?: (trade: Trade) => void;
  private tickHistory: number[] = [];

  constructor(
    private apiToken: string, // Kept for compat, but we use singleton WS mostly now
    private appId: string = "114155"
  ) { }

  setCallbacks(
    onStatsUpdate: (stats: typeof this.stats) => void,
    onTradeUpdate: (trade: Trade) => void
  ) {
    this.onStatsUpdate = onStatsUpdate;
    this.onTradeUpdate = onTradeUpdate;
  }

  async start(config: BotConfig, scriptCode?: string) {
    if (this.isRunning) {
      throw new Error("Bot is already running");
    }

    this.config = config;
    this.isRunning = true;
    this.tickHistory = []; // Reset history

    // Subscribe to ticks for the selected market
    if (config.market) {
      this.ws.subscribeTicks(config.market, (tick) => {
        this.tickHistory.push(tick.quote);
        if (this.tickHistory.length > 1000) this.tickHistory.shift(); // Keep last 1000
      });
    }

    if (scriptCode) {
      console.log("🚀 Executing Custom Bot Script");
      this.runScript(scriptCode);
    } else {
      console.log("🚀 Executing Standard Trading Loop");
      this.runTradingLoop();
    }
  }

  async runScript(code: string) {
    // Create a safe context for the bot to run in
    const context = {
      bot: {
        isRunning: () => this.isRunning,
        isPaused: () => this.isPaused,
        sleep: (ms: number) => this.sleep(ms),
        purchase: (type: string) => this.executePurchase(type),
        getTick: () => this.tickHistory[this.tickHistory.length - 1],
        getTicks: () => [...this.tickHistory], // Return copy
        getLastDigit: () => {
          const lastTick = this.tickHistory[this.tickHistory.length - 1];
          return lastTick ? parseInt(lastTick.toString().slice(-1)) : 0;
        },
        notify: (msg: string) => console.log(`[BOT] ${msg}`),

        // Indicators
        rsi: (period: number) => {
          const values = indicators.RSI.calculate({
            values: this.tickHistory,
            period: period
          });
          return values[values.length - 1];
        },
        sma: (period: number) => {
          const values = indicators.SMA.calculate({
            values: this.tickHistory,
            period: period
          });
          return values[values.length - 1];
        }
      },
      console: { log: console.log, error: console.error }
    };

    try {
      // Create the function from string. 
      // Note: In a real prod env this should be sandboxed (e.g. vm2), 
      // but for this client-side app Function is acceptable as it runs in user's browser.
      const runFn = new Function('context', `
              return (async () => {
                  const { bot } = context;
                  ${code}
              })();
          `);

      await runFn(context);
    } catch (error) {
      console.error("Script execution failed:", error);
      this.stop();
    }
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    if (this.config?.market) {
      this.ws.unsubscribeTicks();
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  getStatus() {
    if (!this.isRunning) return 'stopped';
    if (this.isPaused) return 'paused';
    return 'running';
  }

  private async runTradingLoop() {
    console.log("🤖 Starting Bot Trading Loop...");
    let currentStake = this.config?.stake || 1;

    while (this.isRunning && this.config) {
      try {
        if (this.isPaused) {
          await this.sleep(1000);
          continue;
        }

        console.log(`💰 Placing trade with stake: ${currentStake}`);

        // Get proposal for CALL trade
        const proposal = await this.ws.getProposal({
          amount: currentStake,
          basis: "stake",
          contract_type: this.config.contractType || "CALL",
          currency: "USD",
          duration: this.config.duration,
          duration_unit: "t",
          symbol: this.config.market
        });

        if (proposal && proposal.id) {
          console.log("✅ Got proposal:", proposal.id);

          // Buy the contract
          const buyData = await this.ws.buyContract(proposal.id, proposal.ask_price);

          if (buyData.buy) {
            console.log("🎯 Trade executed!");
            this.handleBuy(buyData.buy, proposal);

            // Wait for contract to complete
            const result = await this.waitForContractResult(buyData.buy.contract_id);

            // Martingale strategy: double stake on loss, reset on win
            if (result === 'loss') {
              currentStake = currentStake * 2;
              console.log(`❌ Lost - Doubling stake to ${currentStake}`);
            } else {
              currentStake = this.config.stake || 1;
              console.log(`✅ Won - Resetting stake to ${currentStake}`);
            }
          }
        }

        // Check stop conditions
        const profit = this.stats.profit;
        if (this.isStopConditionMet(profit)) break;

        await this.sleep(2000); // Wait before next trade

      } catch (error) {
        console.error("Trading loop error:", error);
        await this.sleep(5000);
      }
    }

    console.log("🛑 Bot stopped");
  }

  private isStopConditionMet(profit: number): boolean {
    if (this.config?.stopLoss && this.config.stopLoss > 0 && profit <= -this.config.stopLoss) {
      console.log('Stop-loss limit reached');
      this.stop();
      return true;
    }
    if (this.config?.takeProfit && this.config.takeProfit > 0 && profit >= this.config.takeProfit) {
      console.log('Take-profit limit reached');
      this.stop();
      return true;
    }
    return false;
  }

  private async getProposalAndTrade() {
    if (!this.config) return;

    // Simple default strategy if no XML
    const proposal = await this.ws.getProposal({
      amount: this.config.stake,
      basis: "stake",
      contract_type: this.config.contractType || 'CALL',
      currency: "USD",
      duration: this.config.duration,
      duration_unit: "t",
      symbol: this.config.market
    });

    if (proposal && proposal.id) {
      await this.executePurchaseForProposal(proposal);
    }
  }

  // Common purchase logic
  private async executePurchase(type: string) {
    if (!this.config) return;
    // We need to fetch a fresh proposal for the specific type requested by script
    const proposal = await this.ws.getProposal({
      amount: this.config.stake,
      basis: "stake",
      contract_type: type, // 'CALL', 'PUT' etc
      currency: "USD",
      duration: this.config.duration,
      duration_unit: "t",
      symbol: this.config.market
    });
    if (proposal.id) {
      await this.executePurchaseForProposal(proposal);
    }
  }

  private async executePurchaseForProposal(proposal: any) {
    if (!this.ws) return;

    console.log("💰 Buying contract:", proposal.id);
    const buyData = await this.ws.buyContract(proposal.id, proposal.ask_price);

    if (buyData.buy) {
      this.handleBuy(buyData.buy, proposal);
      await this.waitForContract(buyData.buy.contract_id);
    }
  }

  private handleBuy(buyData: any, proposal: any) {
    const trade: Trade = {
      id: buyData.contract_id,
      contractType: proposal.contract_type || this.config?.contractType || 'Unknown',
      stake: buyData.buy_price,
      payout: buyData.payout, // proposal payout
      result: 'pending',
      timestamp: Date.now(),
    };

    this.trades.unshift(trade);
    this.stats.runs++;
    this.stats.totalStake += trade.stake;

    if (this.onTradeUpdate) this.onTradeUpdate(trade);
    if (this.onStatsUpdate) this.onStatsUpdate({ ...this.stats });
  }

  private async waitForContract(contractId: number) {
    return new Promise<void>((resolve) => {
      this.ws.subscribeProposalOpenContract(contractId, (contract) => {
        if (contract.is_sold) {
          this.handleContractEnded(contract);
          this.ws.unsubscribeProposalOpenContract(contractId);
          resolve();
        }
      });
    });
  }

  private async waitForContractResult(contractId: number): Promise<'win' | 'loss'> {
    return new Promise((resolve) => {
      this.ws.subscribeProposalOpenContract(contractId, (contract) => {
        if (contract.is_sold) {
          const isWin = (contract.profit || 0) > 0;
          this.handleContractEnded(contract);
          this.ws.unsubscribeProposalOpenContract(contractId);
          resolve(isWin ? 'win' : 'loss');
        }
      });
    });
  }

  private handleContractEnded(contract: any) {
    const trade = this.trades.find(t => t.id === contract.contract_id);
    if (!trade) return;

    const profit = contract.profit;
    trade.result = profit > 0 ? 'win' : 'loss';
    trade.payout = contract.payout; // Actual payout

    this.stats.totalPayout += contract.payout; // This wasn't tracking correctly before?
    // Actually total Payout should only increase on win? No, payout is return.
    // Net profit is checked via separate var.

    this.stats.profit += profit;

    if (trade.result === 'win') {
      this.stats.won++;
    } else {
      this.stats.lost++;
    }

    if (this.onStatsUpdate) this.onStatsUpdate({ ...this.stats });
    if (this.onTradeUpdate) this.onTradeUpdate(trade); // Update status
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
