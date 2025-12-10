import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OAuthCallback() {
  const [, setLocation] = useLocation();
  const auth = useAuth();
  const [status, setStatus] = useState("Initializing...");
  const [debugInfo, setDebugInfo] = useState("");

  useEffect(() => {
    const handleOAuthCallback = async () => {
      setStatus("Parsing URL parameters...");
      // Get the OAuth token from URL parameters
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");

      setDebugInfo(`Params: ${window.location.search}`);

      if (error) {
        setStatus(`Error returned from Deriv: ${error}`);
        return;
      }

      // Parse all accounts and tokens
      const accounts: Record<string, string> = {};
      let firstAccount = "";

      // Loop through parameters to find all acct/token pairs
      // Deriv returns acct1, token1, cur1, acct2, token2, cur2...
      let i = 1;
      while (params.get(`acct${i}`)) {
        const acct = params.get(`acct${i}`);
        const token = params.get(`token${i}`);
        if (acct && token) {
          accounts[acct] = token;
          if (i === 1) firstAccount = acct;
        }
        i++;
      }

      const accountKeys = Object.keys(accounts);

      if (accountKeys.length > 0) {
        try {
          setStatus(`Found ${accountKeys.length} accounts. Saving...`);

          // Store all tokens map
          localStorage.setItem("deriv_tokens", JSON.stringify(accounts));

          // Store active token (default to first one)
          const activeToken = accounts[firstAccount];
          localStorage.setItem("deriv_token", activeToken);
          localStorage.setItem("deriv_account", firstAccount);
          localStorage.setItem("selected_account", firstAccount);

          setStatus("Tokens saved.");
          setDebugInfo(prev => prev + `\nSaved tokens for: ${accountKeys.join(", ")}`);

          // Force a hard reload to ensure AuthContext picks it up fresh
          setTimeout(() => {
            setStatus("Redirecting to Trading...");
            window.location.href = "/trading";
          }, 1500);

        } catch (error: any) {
          console.error("OAuth authorization failed:", error);
          setStatus(`Error saving token: ${error.message}`);
        }
      } else {
        // No token found
        setStatus("No accounts found in URL.");
      }
    };

    handleOAuthCallback();
  }, []);

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center p-4">
      <div className="text-center max-w-md w-full bg-[#2A2A2A] p-8 rounded-xl border border-gray-800">
        <Loader2 className="w-12 h-12 animate-spin text-[#C026D3] mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-4">{status}</h2>
        <p className="text-gray-400 mb-6 text-sm">
          Please wait while we complete the secure login process.
        </p>

        {/* Debug Info Area */}
        <div className="bg-black/50 p-4 rounded text-left text-xs font-mono text-gray-500 overflow-auto max-h-40 mb-4">
          {debugInfo}
        </div>

        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => window.location.href = '/login'}>
            Return to Login
          </Button>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
