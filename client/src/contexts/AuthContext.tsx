import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getDerivWS, DerivAccount } from '@/services/derivWebSocket';

const APP_ID = 113977;
const OAUTH_URL = 'https://oauth.deriv.com/oauth2/authorize';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  accounts: DerivAccount[];
  currentAccount: DerivAccount | null;
  balance: number;
  isDemo: boolean;
  login: () => void;
  logout: () => void;
  switchAccount: (loginid: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [currentAccount, setCurrentAccount] = useState<DerivAccount | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const derivWS = getDerivWS();

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('deriv_token');
    if (storedToken) {
      authenticateWithToken(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  // Subscribe to balance updates
  useEffect(() => {
    if (isAuthenticated) {
      derivWS.subscribeBalance((newBalance) => {
        setBalance(newBalance);
      });
    }
  }, [isAuthenticated]);

  async function authenticateWithToken(authToken: string) {
    try {
      setLoading(true);
      
      // Authorize with Deriv
      const authResponse = await derivWS.authorize(authToken);
      
      if (authResponse.error) {
        throw new Error(authResponse.error.message);
      }

      // Store token
      localStorage.setItem('deriv_token', authToken);
      setToken(authToken);
      setIsAuthenticated(true);

      // Get account list
      const accountList = await derivWS.getAccountList();
      setAccounts(accountList);

      // Set current account from authorize response
      if (authResponse.authorize) {
        const current = accountList.find(
          (acc) => acc.loginid === authResponse.authorize.loginid
        );
        if (current) {
          setCurrentAccount(current);
          setBalance(current.balance);
        }
      }

      // Load saved account preference
      const savedLoginid = localStorage.getItem('selected_account');
      if (savedLoginid && savedLoginid !== authResponse.authorize.loginid) {
        await switchAccount(savedLoginid);
      }

      setLoading(false);
    } catch (error) {
      console.error('Authentication failed:', error);
      localStorage.removeItem('deriv_token');
      localStorage.removeItem('selected_account');
      setIsAuthenticated(false);
      setToken(null);
      setLoading(false);
    }
  }

  function login() {
    const redirectUri = `${window.location.origin}/oauth/callback`;
    const oauthUrl = `${OAUTH_URL}?app_id=${APP_ID}&l=EN&brand=deriv`;
    window.location.href = oauthUrl;
  }

  async function logout() {
    try {
      await derivWS.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }

    localStorage.removeItem('deriv_token');
    localStorage.removeItem('selected_account');
    setIsAuthenticated(false);
    setToken(null);
    setAccounts([]);
    setCurrentAccount(null);
    setBalance(0);
  }

  async function switchAccount(loginid: string) {
    try {
      const response = await derivWS.switchAccount(loginid);
      
      if (response.error) {
        throw new Error(response.error.message);
      }

      // Update current account
      const account = accounts.find((acc) => acc.loginid === loginid);
      if (account) {
        setCurrentAccount(account);
        setBalance(account.balance);
        localStorage.setItem('selected_account', loginid);
      }
    } catch (error) {
      console.error('Account switch failed:', error);
      throw error;
    }
  }

  const isDemo = currentAccount?.is_virtual === 1;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        token,
        accounts,
        currentAccount,
        balance,
        isDemo,
        login,
        logout,
        switchAccount,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
