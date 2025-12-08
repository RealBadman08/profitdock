import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { DERIV_CONFIG, DerivAccountType } from "@/../../shared/deriv-config";

interface DerivContextType {
  isConnected: boolean;
  isAuthorized: boolean;
  accountInfo: any | null;
  balance: number | null;
  accountType: DerivAccountType | null;
  accounts: any[];
  connect: () => void;
  disconnect: () => void;
  authorize: (token: string) => Promise<void>;
  switchAccount: (loginid: string) => Promise<void>;
  initiateOAuth: () => void;
  getActiveSymbols: () => Promise<any>;
  subscribeToTicks: (symbol: string, callback: (tick: any) => void) => Promise<() => void>;
  buyContract: (params: any) => Promise<any>;
  getProposal: (params: any) => Promise<any>;
}

const DerivContext = createContext<DerivContextType | undefined>(undefined);

export function DerivProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [accountInfo, setAccountInfo] = useState<any | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [accountType, setAccountType] = useState<DerivAccountType | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const requestIdRef = useRef(1);
  const callbacksRef = useRef<Map<number, (response: any) => void>>(new Map());

  const sendRequest = useCallback((request: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const reqId = requestIdRef.current++;
      const requestWithId = { ...request, req_id: reqId };
      
      callbacksRef.current.set(reqId, (response) => {
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response);
        }
      });

      wsRef.current.send(JSON.stringify(requestWithId));
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(`${DERIV_CONFIG.WS_URL}?app_id=${DERIV_CONFIG.APP_ID}`);
      
      ws.onopen = () => {
        setIsConnected(true);
        toast.success("Connected to Deriv");
      };

      ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        
        // Handle subscriptions (balance updates, ticks, etc.)
        if (response.balance) {
          setBalance(response.balance.balance);
        }
        
        // Handle request callbacks
        if (response.req_id && callbacksRef.current.has(response.req_id)) {
          const callback = callbacksRef.current.get(response.req_id);
          if (callback) {
            callback(response);
            // Don't delete subscription callbacks
            if (!response.subscription) {
              callbacksRef.current.delete(response.req_id);
            }
          }
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsAuthorized(false);
        toast.info("Disconnected from Deriv");
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        toast.error("Connection error");
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to connect:", error);
      toast.error("Failed to connect to Deriv");
    }
  }, []);

  const initiateOAuth = useCallback(() => {
    const oauthUrl = `${DERIV_CONFIG.OAUTH_URL}?app_id=${DERIV_CONFIG.APP_ID}&l=en&brand=deriv`;
    window.location.href = oauthUrl;
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
      setIsAuthorized(false);
      setAccountInfo(null);
      setBalance(null);
    }
  }, []);

  const authorize = useCallback(
    async (token: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toast.error("Not connected to Deriv");
        throw new Error("Not connected");
      }

      try {
        const response = await sendRequest({ authorize: token });
        
        if (response.error) {
          throw new Error(response.error.message);
        }

        setIsAuthorized(true);
        setAccountInfo(response.authorize);
        setBalance(response.authorize.balance);
        
        // Determine account type
        const isDemo = response.authorize.loginid?.startsWith('VRT');
        setAccountType(isDemo ? DERIV_CONFIG.ACCOUNT_TYPES.DEMO : DERIV_CONFIG.ACCOUNT_TYPES.REAL);
        
        // Get account list
        const accountListResponse = await sendRequest({ account_list: 1 });
        if (accountListResponse.account_list) {
          setAccounts(accountListResponse.account_list);
        }
        
        toast.success(`Authorized successfully (${isDemo ? 'Demo' : 'Real'} Account)`);

        // Subscribe to balance updates
        await sendRequest({ balance: 1, account: "current", subscribe: 1 });
      } catch (error: any) {
        console.error("Authorization failed:", error);
        toast.error(`Authorization failed: ${error.message}`);
        setIsAuthorized(false);
        throw error;
      }
    },
    [sendRequest]
  );

  const getActiveSymbols = useCallback(async () => {
    const response = await sendRequest({
      active_symbols: "brief",
      product_type: "basic",
    });
    
    return response.active_symbols;
  }, [sendRequest]);

  const subscribeToTicks = useCallback(
    async (symbol: string, callback: (tick: any) => void) => {
      const reqId = requestIdRef.current++;
      
      callbacksRef.current.set(reqId, (response) => {
        if (response.tick) {
          callback(response.tick);
        }
      });

      await sendRequest({ ticks: symbol, subscribe: 1, req_id: reqId });

      // Return unsubscribe function
      return () => {
        sendRequest({ forget: reqId });
        callbacksRef.current.delete(reqId);
      };
    },
    [sendRequest]
  );

  const buyContract = useCallback(
    async (params: any) => {
      if (!isAuthorized) {
        throw new Error("Not authorized");
      }

      const response = await sendRequest({ buy: params.buy, price: params.price });
      
      if (response.error) {
        throw new Error(response.error.message);
      }

      return response;
    },
    [isAuthorized, sendRequest]
  );

  const getProposal = useCallback(
    async (params: any) => {
      const response = await sendRequest({ proposal: 1, ...params });
      
      if (response.error) {
        throw new Error(response.error.message);
      }

      return response.proposal;
    },
    [sendRequest]
  );

  const switchAccount = useCallback(
    async (loginid: string) => {
      if (!isAuthorized) {
        throw new Error("Not authorized");
      }

      try {
        const response = await sendRequest({ account_switch: loginid });
        
        if (response.error) {
          throw new Error(response.error.message);
        }

        setAccountInfo(response.authorize);
        setBalance(response.authorize.balance);
        
        const isDemo = loginid.startsWith('VRT');
        setAccountType(isDemo ? DERIV_CONFIG.ACCOUNT_TYPES.DEMO : DERIV_CONFIG.ACCOUNT_TYPES.REAL);
        
        toast.success(`Switched to ${isDemo ? 'Demo' : 'Real'} account`);
      } catch (error: any) {
        console.error("Account switch failed:", error);
        toast.error(`Failed to switch account: ${error.message}`);
        throw error;
      }
    },
    [isAuthorized, sendRequest]
  );

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  const value: DerivContextType = {
    isConnected,
    isAuthorized,
    accountInfo,
    balance,
    accountType,
    accounts,
    connect,
    disconnect,
    authorize,
    switchAccount,
    initiateOAuth,
    getActiveSymbols,
    subscribeToTicks,
    buyContract,
    getProposal,
  };

  return <DerivContext.Provider value={value}>{children}</DerivContext.Provider>;
}

export function useDeriv() {
  const context = useContext(DerivContext);
  if (!context) {
    throw new Error("useDeriv must be used within DerivProvider");
  }
  return context;
}
