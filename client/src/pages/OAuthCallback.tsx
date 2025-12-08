import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function OAuthCallback() {
  const [, setLocation] = useLocation();
  const auth = useAuth();

  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Get the OAuth token from URL parameters
      const params = new URLSearchParams(window.location.search);
      const token1 = params.get("token1");
      const acct1 = params.get("acct1");

      if (token1) {
        try {
          // Store token in localStorage for future use
          localStorage.setItem("deriv_token", token1);
          if (acct1) {
            localStorage.setItem("deriv_account", acct1);
          }

          // Token will be picked up by AuthContext on reload

          // Redirect to dashboard
          setLocation("/dashboard");
        } catch (error) {
          console.error("OAuth authorization failed:", error);
          setLocation("/?error=auth_failed");
        }
      } else {
        // No token found, redirect to home
        setLocation("/?error=no_token");
      }
    };

    handleOAuthCallback();
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-accent mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Connecting to Deriv...</h2>
        <p className="text-muted-foreground">Please wait while we authorize your account</p>
      </div>
    </div>
  );
}
