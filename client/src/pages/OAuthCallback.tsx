import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OAuthCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState("Initializing secure connection...");
  const [error, setError] = useState("");

  useEffect(() => {
    const processLogin = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const err = params.get("error");

        if (err) {
          setError(err);
          setStatus("Login failed.");
          return;
        }

        // 1. Scrape tokens from URL
        const accounts: Record<string, string> = {};
        let firstAccount = "";
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

        if (!firstAccount) {
          setError("No accounts found in response.");
          setStatus("Login failed.");
          return;
        }

        // 2. Clear old state to prevent conflicts
        localStorage.removeItem('deriv_token');
        localStorage.removeItem('deriv_tokens');
        localStorage.removeItem('selected_account');

        // 3. Save new state
        localStorage.setItem("deriv_tokens", JSON.stringify(accounts));
        localStorage.setItem("deriv_token", accounts[firstAccount]);
        localStorage.setItem("selected_account", firstAccount);

        setStatus("Login successful! Redirecting...");

        // 4. Hard Redirect
        setTimeout(() => {
          window.location.replace('/trading');
        }, 500);

      } catch (e: any) {
        console.error("Login processing error", e);
        setError(e.message || "Unknown error");
        setStatus("System error during login.");
      }
    };

    processLogin();
  }, []);

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex flex-col items-center justify-center p-4 font-sans text-white">
      <div className="text-center max-w-md w-full bg-[#151717] p-8 rounded-lg border border-[#333] shadow-2xl">
        {error ? (
          <>
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Login Failed</h2>
            <p className="text-red-400 mb-6">{error}</p>
            <Button onClick={() => window.location.href = '/login'} className="w-full bg-[#ff444f] hover:bg-[#d43e47]">
              Try Again
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-[#ff444f] mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-4">{status}</h2>
            <p className="text-gray-400 mb-6 text-xs">
              Authenticating with Deriv servers...
            </p>
            <Button
              variant="outline"
              className="mt-4 border-gray-700 hover:bg-[#222]"
              onClick={() => window.location.replace('/trading')}
            >
              Click if not redirected
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
