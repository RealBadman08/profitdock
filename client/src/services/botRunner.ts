import { getDerivWS } from './derivWebSocket';

export interface BotConfig {
  symbol: string;
  initialStake: number;
  duration: number;
  durationUnit: 't' | 's' | 'm';
  contractType: 'CALL' | 'PUT' | 'DIGITMATCH' | 'DIGITDIFF' | 'DIGITODD' | 'DIGITEVEN' | 'DIGITOVER' | 'DIGITUNDER';
  strategy: 'martingale' | 'dalembert' | 'oscars_grind' | 'winners_row' | 'compound';
  stopLoss?: number;
  takeProfit?: number;
  currency: string;
  prediction?: number; // For Digit Match/Differs
  martingaleMultiplier?: number;
  maxStake?: number;
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
  private consecutiveWins = 0;

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
      const proposalParams: any = {
        contract_type: this.config.contractType,
        symbol: this.config.symbol,
        duration: this.config.duration,
        duration_unit: this.config.durationUnit,
        basis: 'stake',
        amount: this.currentStake,
        currency: this.config.currency,
      };

      // Add barriers/predictions for digit contracts
      if (this.config.contractType === 'DIGITMATCH' || this.config.contractType === 'DIGITDIFF') {
        proposalParams.barrier = this.config.prediction?.toString() || '0';
      }
      if (this.config.contractType === 'DIGITOVER' || this.config.contractType === 'DIGITUNDER') {
        proposalParams.barrier = this.config.prediction?.toString() || '5';
      }

      const proposal = await this.derivWS.getProposal(proposalParams);

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
        this.consecutiveWins++;

        console.log(`🎉 Win! Profit: $${result.profit.toFixed(2)}`);

        // Strategy Logic for Wins
        this.applyWinStrategy();
      } else {
        // Loss
        this.stats.lost++;
        this.stats.profit += result.profit;
        this.consecutiveLosses++;
        this.consecutiveWins = 0;

        console.log(`😞 Loss: $${Math.abs(result.profit).toFixed(2)}`);

        // Strategy Logic for Losses
        this.applyLossStrategy();
      }

      // Max Stake Safety Check
      if (this.config.maxStake && this.currentStake > this.config.maxStake) {
        this.currentStake = this.config.maxStake;
        console.log(`⚠️ Stake capped at max allowed: $${this.config.maxStake}`);
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

  private applyWinStrategy() {
    switch (this.config.strategy) {
      case 'martingale':
      case 'dalembert':
        this.currentStake = this.config.initialStake; // Reset on win
        break;
      case 'oscars_grind':
        if (this.stats.profit < 0) { // Only increase if recovering
          this.currentStake += this.config.initialStake;
        } else {
          this.currentStake = this.config.initialStake; // Profit target reached
        }
        break;
      case 'winners_row':
        this.currentStake = this.currentStake * 2; // Aggressive compounding
        break;
      case 'compound':
        this.currentStake = this.currentStake + this.config.initialStake; // Add profit to stake
        break;
    }
  }

  private applyLossStrategy() {
    switch (this.config.strategy) {
      case 'martingale':
        const multiplier = this.config.martingaleMultiplier || 2;
        this.currentStake = this.currentStake * multiplier;
        break;
      case 'dalembert':
        this.currentStake += this.config.initialStake;
        break;
      case 'oscars_grind':
        // Keep same stake on loss
        break;
      case 'winners_row':
        this.currentStake = this.config.initialStake; // Reset on loss
        break;
      case 'compound':
        this.currentStake = this.config.initialStake; // Reset on loss
        break;
    }
  }

  private async waitForContractResult(contractId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      console.log(`Waiting for result of contract ${contractId}...`);

      // Subscribe to the contract stream
      this.derivWS.subscribeProposalOpenContract(contractId, (contract) => {
        // Log status for debugging
        // console.log(`Contract Update: ${contract.status}`);

        // Check if contract is sold/ended
        if (contract.is_sold) {
          console.log('Contract sold/ended!', contract);

          // Unsubscribe to clean up
          this.derivWS.unsubscribeProposalOpenContract(contractId);

          // Resolve with the real result
          resolve({
            contractId: contract.contract_id,
            payout: contract.payout,
            profit: contract.profit,
            status: contract.status
          });
        }
      });

      // Fallback/Safety Timeout (e.g. 5 minutes) just in case socket hangs
      setTimeout(() => {
        // If we are here, we verify locally via simple API call one last time
        // But for now, just reject or resolve 0 to prevent eternal hang
        // In production, we'd query `profit_table` to see what happened.
        // For now, we rely on WebSocket.
      }, 300000);
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
