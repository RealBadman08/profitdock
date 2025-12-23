import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import { DerivProvider } from "./contexts/DerivContext";
import Login from "./pages/Login";
import Trading from "./pages/Trading";
import BotBuilder from "./pages/BotBuilder";
import BotSettings from "./pages/BotSettings"; // Maybe keep for bot config
import Reports from "./pages/Reports";
import Cashier from "./pages/Cashier";
import OAuthCallback from "./pages/OAuthCallback";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <Switch>
      {/* Redirect root to Trading (DTrader) */}
      <Route path="/" component={() => <Redirect to="/trading" />} />
      <Route path="/home" component={() => <Redirect to="/trading" />} />

      <Route path="/login" component={Login} />
      <Route path="/oauth/callback" component={OAuthCallback} />
      <Route path="/api/oauth/callback" component={OAuthCallback} />

      {/* DTrader */}
      <Route path="/trading">
        {() => (
          <Layout>
            <Trading />
          </Layout>
        )}
      </Route>
      <Route path="/trade">
        {() => (
          <Layout>
            <Trading />
          </Layout>
        )}
      </Route>

      {/* DBot */}
      <Route path="/bot-builder">
        {() => (
          <Layout>
            <BotBuilder />
          </Layout>
        )}
      </Route>
      <Route path="/bot-settings">
        {() => (
          <Layout>
            <BotSettings />
          </Layout>
        )}
      </Route>

      {/* Core Features */}
      <Route path="/reports">
        {() => (
          <Layout>
            <Reports />
          </Layout>
        )}
      </Route>
      <Route path="/cashier">
        {() => (
          <Layout>
            <Cashier />
          </Layout>
        )}
      </Route>

      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <DerivProvider>
            <AuthProvider>
              <Toaster />
              <Router />
            </AuthProvider>
          </DerivProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
