declare module "@deriv/deriv-api" {
  export interface DerivAPIOptions {
    connection: WebSocket;
    endpoint?: string;
    app_id?: string;
    lang?: string;
    brand?: string;
  }

  export default class DerivAPI {
    constructor(options: DerivAPIOptions);
    
    authorize(params: { authorize: string }): Promise<any>;
    subscribe(params: any): Promise<any>;
    activeSymbols(params: any): Promise<any>;
    buy(params: any): Promise<any>;
    proposal(params: any): Promise<any>;
    balance(params: any): Promise<any>;
    statement(params: any): Promise<any>;
    profitTable(params: any): Promise<any>;
    
    connection: WebSocket;
  }
}
