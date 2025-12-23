import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getDerivWS, DerivAccount } from '@/services/derivWebSocket';

const APP_ID = 114155;
const OAUTH_URL = 'https://oauth.deriv.com/oauth2/authorize';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  accounts: DerivAccount[];
  currentAccount: DerivAccount | null;
  balance: number;
  displayBalance: number; // Balance shown to user - frozen during trades
  freezeBalance: () => void; // Call when trade starts
  unfreezeBalance: () => void; // Call when trade ends
  isDemo: boolean;
  login: () => void;
  logout: () => void;
  switchAccount: (loginid: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize state synchronously from localStorage if possible
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!localStorage.getItem('deriv_token'));
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('deriv_token'));
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [currentAccount, setCurrentAccount] = useState<DerivAccount | null>(null);
  const [balance, setBalance] = useState(0);
  const [frozenBalance, setFrozenBalance] = useState<number | null>(null); // Frozen balance during trades
  const [loading, setLoading] = useState(true);

  const derivWS = getDerivWS();

  // Compute display balance - use frozen if set, otherwise real balance
  const displayBalance = frozenBalance !== null ? frozenBalance : balance;

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
          // Merge authoritative balance from authorize response
          const authoritativeAccount = {
            ...current,
            balance: Number(authResponse.authorize.balance)
          };
          setCurrentAccount(authoritativeAccount);
          setBalance(Number(authResponse.authorize.balance));
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
      // Only clear if it was an invalid token error
      if (error instanceof Error && (error.message.includes('InvalidToken') || error.message.includes('expired'))) {
        localStorage.removeItem('deriv_token');
        localStorage.removeItem('selected_account');
        setIsAuthenticated(false);
        setToken(null);
      }
      setLoading(false);
    }
  }

  function login() {
    const redirectUri = `${window.location.origin}/oauth/callback`;
    // Ensure we use the correct app ID and redirect URI
    const oauthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&brand=profitdock`;
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
    // Force reload to clear any in-memory state
    window.location.href = '/login';
  }

  async function switchAccount(loginid: string) {
    try {
      // Get token for target account
      const tokensStr = localStorage.getItem('deriv_tokens');
      let targetToken: string | undefined;

      if (tokensStr) {
        const tokens = JSON.parse(tokensStr);
        targetToken = tokens[loginid];
      }

      if (!targetToken) {
        // Fallback or error if we don't have the token
        console.warn(`No token found for ${loginid}, attempting switch without token (might fail if scopes differ)`);
        // Try old method just in case
        const response = await derivWS.switchAccount(loginid);
        if (response.error) throw new Error(response.error.message);
      } else {
        // Re-authorize with new token is the most reliable way to switch context
        const authResponse = await derivWS.authorize(targetToken);
        if (authResponse.error) throw new Error(authResponse.error.message);

        // Update active token in storage
        localStorage.setItem('deriv_token', targetToken);
        setToken(targetToken);

        // Use authoritative data from response
        if (authResponse.authorize) {
          const authBalance = Number(authResponse.authorize.balance);
          setBalance(authBalance);

          // Update account list but override current account with auth data
          const accountList = await derivWS.getAccountList();
          setAccounts(accountList);

          const current = accountList.find((acc) => acc.loginid === authResponse.authorize.loginid);
          if (current) {
            setCurrentAccount({
              ...current,
              balance: authBalance
            });
          }
          localStorage.setItem('selected_account', loginid);
          return; // Exit early as we handled state
        }
      }

      // Fallback for no-token switch (rare)
      // Update current account state
      const accountList = await derivWS.getAccountList(); // Refresh list to get updated balance
      setAccounts(accountList);

      const account = accountList.find((acc) => acc.loginid === loginid);
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

  function freezeBalance() {
    // Freeze the current balance - it won't update in UI during the trade
    setFrozenBalance(balance);
  }

  function unfreezeBalance() {
    // Unfreeze - UI will now show real-time balance again
    setFrozenBalance(null);
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
        displayBalance,
        freezeBalance,
        unfreezeBalance,
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
