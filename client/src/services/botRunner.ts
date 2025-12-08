import { getDerivWS } from './derivWebSocket';

export interface BotConfig {
  symbol: string;
  initialStake: number;
  duration: number;
  durationUnit: 't' | 's' | 'm';
  contractType: 'CALL' | 'PUT';
  strategy: 'martingale' | 'dalembert' | 'oscars_grind';
  stopLoss?: number;
  takeProfit?: number;
  currency: string;
}

export interface BotStats {
  runs: number;
  won: number;
  lost: number;
  totalStake: number;
  totalPayout: number;
  profit: number;
}

type StatsCallback = (stats: BotStats) => void;
type TradeCallback = (trade: any) => void;

export class BotRunner {
  private config: BotConfig;
  private stats: BotStats = {
    runs: 0,
    won: 0,
    lost: 0,
    totalStake: 0,
    totalPayout: 0,
    profit: 0,
  };
  private running = false;
  private paused = false;
  private currentStake: number;
  private derivWS = getDerivWS();
  private statsCallback?: StatsCallback;
  private tradeCallback?: TradeCallback;
  private consecutiveLosses = 0;

  constructor(config: BotConfig) {
    this.config = config;
    this.currentStake = config.initialStake;
  }

  setCallbacks(statsCallback: StatsCallback, tradeCallback: TradeCallback) {
    this.statsCallback = statsCallback;
    this.tradeCallback = tradeCallback;
  }

  async start() {
    this.running = true;
    this.paused = false;
    console.log('🤖 Bot started with config:', this.config);

    while (this.running) {
      if (this.paused) {
        await this.sleep(1000);
        continue;
      }

      // Check stop loss and take profit
      if (this.config.stopLoss && this.stats.profit <= -this.config.stopLoss) {
        console.log('🛑 Stop loss reached');
        this.stop();
        break;
      }

      if (this.config.takeProfit && this.stats.profit >= this.config.takeProfit) {
        console.log('🎯 Take profit reached');
        this.stop();
        break;
      }

      try {
        await this.executeTrade();
        await this.sleep(2000); // Wait between trades
      } catch (error) {
        console.error('❌ Trade execution error:', error);
        await this.sleep(5000); // Wait longer on error
      }
    }
  }

  private async executeTrade() {
    try {
      // Get proposal
      const proposal = await this.derivWS.getProposal({
        contract_type: this.config.contractType,
        symbol: this.config.symbol,
        duration: this.config.duration,
        duration_unit: this.config.durationUnit,
        basis: 'stake',
        amount: this.currentStake,
        currency: this.config.currency,
      });

      console.log(`📊 Proposal: Stake $${this.currentStake}, Payout $${proposal.payout}`);

      // Buy contract
      const buyResult = await this.derivWS.buyContract(proposal.id, proposal.ask_price);

      if (!buyResult.buy) {
        throw new Error('Failed to buy contract');
      }

      const contractId = buyResult.buy.contract_id;
      console.log(`✅ Contract purchased: ${contractId}`);

      // Wait for contract to finish
      const result = await this.waitForContractResult(contractId);

      // Update stats
      this.stats.runs++;
      this.stats.totalStake += this.currentStake;

      if (result.profit > 0) {
        // Win
        this.stats.won++;
        this.stats.totalPayout += result.payout;
        this.stats.profit += result.profit;
        this.consecutiveLosses = 0;
        
        console.log(`🎉 Win! Profit: $${result.profit.toFixed(2)}`);
        
        // Reset stake after win
        this.currentStake = this.config.initialStake;
      } else {
        // Loss
        this.stats.lost++;
        this.stats.profit += result.profit;
        this.consecutiveLosses++;
        
        console.log(`😞 Loss: $${Math.abs(result.profit).toFixed(2)}`);
        
        // Apply strategy
        this.applyStrategy();
      }

      // Notify callbacks
      if (this.statsCallback) {
        this.statsCallback({ ...this.stats });
      }

      if (this.tradeCallback) {
        this.tradeCallback({
          contractId,
          stake: this.currentStake,
          payout: result.payout,
          profit: result.profit,
          won: result.profit > 0,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('Trade execution failed:', error);
      throw error;
    }
  }

  private applyStrategy() {
    switch (this.config.strategy) {
      case 'martingale':
        // Double stake after loss
        this.currentStake = this.currentStake * 2;
        console.log(`📈 Martingale: New stake $${this.currentStake}`);
        break;

      case 'dalembert':
        // Increase stake by initial amount after loss
        this.currentStake = this.currentStake + this.config.initialStake;
        console.log(`📈 D'Alembert: New stake $${this.currentStake}`);
        break;

      case 'oscars_grind':
        // Increase stake by 1 unit after win, keep same after loss
        if (this.consecutiveLosses === 0) {
          this.currentStake = this.currentStake + 1;
        }
        console.log(`📈 Oscar's Grind: New stake $${this.currentStake}`);
        break;
    }

    // Cap stake at 10x initial to prevent excessive losses
    const maxStake = this.config.initialStake * 10;
    if (this.currentStake > maxStake) {
      this.currentStake = maxStake;
      console.log(`⚠️ Stake capped at $${maxStake}`);
    }
  }

  private async waitForContractResult(contractId: number): Promise<any> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        try {
          // In a real implementation, you would subscribe to contract updates
          // For now, we'll simulate with a timeout
          clearInterval(checkInterval);
          
          // Simulate result (50% win rate for demo)
          const won = Math.random() > 0.5;
          const payout = won ? this.currentStake * 1.9 : 0;
          const profit = payout - this.currentStake;

          resolve({
            contractId,
            payout,
            profit,
          });
        } catch (error) {
          console.error('Error checking contract:', error);
        }
      }, this.config.duration * 1000 + 2000); // Wait for duration + buffer
    });
  }

  pause() {
    this.paused = true;
    console.log('⏸️ Bot paused');
  }

  resume() {
    this.paused = false;
    console.log('▶️ Bot resumed');
  }

  stop() {
    this.running = false;
    this.paused = false;
    console.log('🛑 Bot stopped');
    console.log('📊 Final stats:', this.stats);
  }

  getStats(): BotStats {
    return { ...this.stats };
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
