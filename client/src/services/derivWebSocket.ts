/**
 * Deriv WebSocket Service
 * Complete implementation of Deriv API WebSocket calls
 * Documentation: https://api.deriv.com/api-explorer/
 */

const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3';
const APP_ID = 113977;

export interface DerivAccount {
  loginid: string;
  currency: string;
  is_virtual: number;
  balance: number;
}

export interface ActiveSymbol {
  symbol: string;
  display_name: string;
  market: string;
  market_display_name: string;
  submarket: string;
  submarket_display_name: string;
}

export interface Tick {
  symbol: string;
  quote: number;
  epoch: number;
}

export interface Proposal {
  id: string;
  ask_price: number;
  payout: number;
  spot: number;
  display_value: string;
}

export interface Contract {
  contract_id: number;
  longcode: string;
  buy_price: number;
  payout: number;
  profit: number;
  is_sold: number;
  sell_price?: number;
}

type MessageCallback = (data: any) => void;

export class DerivWebSocket {
  private ws: WebSocket | null = null;
  private messageCallbacks: Map<string, MessageCallback> = new Map();
  private requestId = 1;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  constructor() {
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket(`${DERIV_WS_URL}?app_id=${APP_ID}`);

      this.ws.onopen = () => {
        console.log('✅ Connected to Deriv WebSocket');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 Received:', data);

        // Handle subscription updates
        if (data.msg_type) {
          const callback = this.messageCallbacks.get(data.msg_type);
          if (callback) {
            callback(data);
          }
        }

        // Handle request responses
        if (data.req_id) {
          const callback = this.messageCallbacks.get(`req_${data.req_id}`);
          if (callback) {
            callback(data);
            this.messageCallbacks.delete(`req_${data.req_id}`);
          }
        }

        // Handle errors
        if (data.error) {
          console.error('❌ Deriv API Error:', data.error);
          const errorCallback = this.messageCallbacks.get('error');
          if (errorCallback) {
            errorCallback(data.error);
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('🔌 Disconnected from Deriv WebSocket');
        this.handleReconnect();
      };
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      this.handleReconnect();
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnecting... Attempt ${this.reconnectAttempts}`);
      setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
    }
  }

  private send(request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'));
        return;
      }

      const reqId = this.requestId++;
      request.req_id = reqId;

      this.messageCallbacks.set(`req_${reqId}`, (data) => {
        if (data.error) {
          reject(data.error);
        } else {
          resolve(data);
        }
      });

      console.log('📤 Sending:', request);
      this.ws.send(JSON.stringify(request));
    });
  }

  // Authentication
  async authorize(token: string): Promise<any> {
    return this.send({ authorize: token });
  }

  async logout(): Promise<any> {
    return this.send({ logout: 1 });
  }

  // Account Management
  async getAccountList(): Promise<DerivAccount[]> {
    const response = await this.send({ account_list: 1 });
    return response.account_list || [];
  }

  async switchAccount(loginid: string): Promise<any> {
    return this.send({ account_switch: loginid });
  }

  // Market Data
  async getActiveSymbols(): Promise<ActiveSymbol[]> {
    const response = await this.send({
      active_symbols: 'brief',
      product_type: 'basic',
    });
    return response.active_symbols || [];
  }

  subscribeTicks(symbol: string, callback: (tick: Tick) => void): void {
    this.send({ ticks: symbol, subscribe: 1 });
    this.messageCallbacks.set('tick', (data) => {
      if (data.tick) {
        callback({
          symbol: data.tick.symbol,
          quote: data.tick.quote,
          epoch: data.tick.epoch,
        });
      }
    });
  }

  unsubscribeTicks(): void {
    this.send({ forget_all: 'ticks' });
    this.messageCallbacks.delete('tick');
  }

  subscribeCandles(
    symbol: string,
    interval: number,
    callback: (candle: any) => void
  ): void {
    this.send({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 50,
      end: 'latest',
      start: 1,
      style: 'candles',
      granularity: interval,
      subscribe: 1,
    });

    this.messageCallbacks.set('candles', (data) => {
      if (data.candles) {
        callback(data.candles);
      }
      if (data.ohlc) {
        callback(data.ohlc);
      }
    });
  }

  unsubscribeCandles(): void {
    this.send({ forget_all: 'candles' });
    this.messageCallbacks.delete('candles');
  }

  // Balance
  subscribeBalance(callback: (balance: number) => void): void {
    this.send({ balance: 1, subscribe: 1 });
    this.messageCallbacks.set('balance', (data) => {
      if (data.balance) {
        callback(parseFloat(data.balance.balance));
      }
    });
  }

  // Trading
  async getProposal(params: {
    contract_type: string;
    symbol: string;
    duration: number;
    duration_unit: string;
    basis: string;
    amount: number;
    currency: string;
  }): Promise<Proposal> {
    const response = await this.send({
      proposal: 1,
      ...params,
    });

    if (response.proposal) {
      return {
        id: response.proposal.id,
        ask_price: response.proposal.ask_price,
        payout: response.proposal.payout,
        spot: response.proposal.spot,
        display_value: response.proposal.display_value,
      };
    }

    throw new Error('Failed to get proposal');
  }

  async buyContract(proposalId: string, price: number): Promise<any> {
    return this.send({
      buy: proposalId,
      price: price,
    });
  }

  async sellContract(contractId: number, price: number): Promise<any> {
    return this.send({
      sell: contractId,
      price: price,
    });
  }

  // Portfolio
  subscribePortfolio(callback: (contracts: Contract[]) => void): void {
    this.send({ portfolio: 1, subscribe: 1 });
    this.messageCallbacks.set('portfolio', (data) => {
      if (data.portfolio && data.portfolio.contracts) {
        callback(data.portfolio.contracts);
      }
    });
  }

  unsubscribePortfolio(): void {
    this.send({ forget_all: 'portfolio' });
    this.messageCallbacks.delete('portfolio');
  }

  // Transactions
  async getTransactions(limit: number = 50): Promise<any> {
    return this.send({
      statement: 1,
      description: 1,
      limit: limit,
    });
  }

  // Utility
  onError(callback: (error: any) => void): void {
    this.messageCallbacks.set('error', callback);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageCallbacks.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let derivWS: DerivWebSocket | null = null;

export function getDerivWS(): DerivWebSocket {
  if (!derivWS) {
    derivWS = new DerivWebSocket();
  }
  return derivWS;
}
