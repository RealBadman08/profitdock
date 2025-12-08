interface BotConfig {
  xml: string;
  market: string;
  stake: number;
  duration: number;
  contractType: 'CALL' | 'PUT' | 'CALLE' | 'PUTE';
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
  private ws: WebSocket | null = null;
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

  constructor(
    private apiToken: string,
    private appId: string = "113977"
  ) {}

  setCallbacks(
    onStatsUpdate: (stats: typeof this.stats) => void,
    onTradeUpdate: (trade: Trade) => void
  ) {
    this.onStatsUpdate = onStatsUpdate;
    this.onTradeUpdate = onTradeUpdate;
  }

  async start(config: BotConfig) {
    if (this.isRunning) {
      throw new Error("Bot is already running");
    }

    this.config = config;
    this.isRunning = true;

    // Connect to Deriv WebSocket
    await this.connect();
    
    // Start trading loop
    this.runTradingLoop();
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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

  private async connect() {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(
        `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`
      );

      this.ws.onopen = () => {
        // Authorize
        this.ws?.send(
          JSON.stringify({
            authorize: this.apiToken,
          })
        );
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.msg_type === "authorize") {
          if (data.error) {
            reject(new Error(data.error.message));
          } else {
            resolve();
          }
        } else if (data.msg_type === "proposal") {
          this.handleProposal(data.proposal);
        } else if (data.msg_type === "buy") {
          this.handleBuy(data.buy);
        } else if (data.msg_type === "proposal_open_contract") {
          this.handleContractUpdate(data.proposal_open_contract);
        }
      };

      this.ws.onerror = (error) => {
        reject(error);
      };
    });
  }

  private async runTradingLoop() {
    while (this.isRunning && this.config) {
      try {
        // Skip trading if paused
        if (this.isPaused) {
          await this.sleep(1000);
          continue;
        }

        // Check stop-loss and take-profit limits
        const profit = this.stats.totalPayout - this.stats.totalStake;
        if (this.config.stopLoss && this.config.stopLoss > 0 && profit <= -this.config.stopLoss) {
          console.log('Stop-loss limit reached');
          this.stop();
          break;
        }
        if (this.config.takeProfit && this.config.takeProfit > 0 && profit >= this.config.takeProfit) {
          console.log('Take-profit limit reached');
          this.stop();
          break;
        }

        // Get proposal
        await this.getProposal();
        
        // Wait a bit before next trade
        await this.sleep(5000);
      } catch (error) {
        console.error("Trading loop error:", error);
        await this.sleep(10000); // Wait longer on error
      }
    }
  }

  private async getProposal() {
    if (!this.ws || !this.config) return;

    const proposalRequest = {
      proposal: 1,
      amount: this.config.stake,
      basis: "stake",
      contract_type: this.config.contractType,
      currency: "USD",
      duration: this.config.duration,
      duration_unit: "t",
      symbol: this.config.market || "R_100",
    };

    this.ws.send(JSON.stringify(proposalRequest));
  }

  private handleProposal(proposal: any) {
    // Auto-buy if conditions are met
    if (this.isRunning && proposal.id) {
      this.buyContract(proposal.id);
    }
  }

  private buyContract(proposalId: string) {
    if (!this.ws) return;

    const buyRequest = {
      buy: proposalId,
      price: this.config?.stake || 1,
    };

    this.ws.send(JSON.stringify(buyRequest));
  }

  private handleBuy(buyData: any) {
    const trade: Trade = {
      id: buyData.contract_id,
      contractType: buyData.contract_type,
      stake: buyData.buy_price,
      payout: buyData.payout,
      result: 'pending',
      timestamp: Date.now(),
    };

    this.trades.push(trade);
    this.stats.runs++;
    this.stats.totalStake += trade.stake;

    if (this.onTradeUpdate) {
      this.onTradeUpdate(trade);
    }

    // Subscribe to contract updates
    if (this.ws) {
      this.ws.send(
        JSON.stringify({
          proposal_open_contract: 1,
          contract_id: buyData.contract_id,
          subscribe: 1,
        })
      );
    }
  }

  private handleContractUpdate(contract: any) {
    const trade = this.trades.find(t => t.id === contract.contract_id);
    if (!trade) return;

    if (contract.is_sold) {
      const profit = contract.sell_price - trade.stake;
      trade.result = profit > 0 ? 'win' : 'loss';
      trade.payout = contract.sell_price;

      this.stats.totalPayout += contract.sell_price;
      this.stats.profit += profit;

      if (trade.result === 'win') {
        this.stats.won++;
      } else {
        this.stats.lost++;
      }

      if (this.onStatsUpdate) {
        this.onStatsUpdate({ ...this.stats });
      }

      if (this.onTradeUpdate) {
        this.onTradeUpdate(trade);
      }
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return { ...this.stats };
  }

  getTrades() {
    return [...this.trades];
  }
}
