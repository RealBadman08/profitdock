import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to the trading page
    setLocation("/trading");
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="flex items-center gap-2 mb-8">
          <h1 className="text-4xl font-bold">
            <span className="text-cyan-400">PROFIT</span>
            <span className="text-fuchsia-600">DOCK</span>
          </h1>
        </div>
        <p className="text-muted-foreground">Redirecting to trader...</p>
      </div>
    </div>
  );
}
