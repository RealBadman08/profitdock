import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Trading from "./pages/Trading";
import DerivTrading from "./pages/DerivTrading";
import Bot from "./pages/Bot";
import BotBuilder from "./pages/BotBuilder";
import FileStorage from "./pages/FileStorage";
import Analytics from "./pages/Analytics";
import History from "./pages/History";
import Leaderboard from "./pages/Leaderboard";
import FreeBots from "./pages/FreeBots";
import Charts from "./pages/Charts";
import Scanner from "./pages/Scanner";
import Journal from "./pages/Journal";
import CopyTrading from "./pages/CopyTrading";
import OAuthCallback from "./pages/OAuthCallback";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/home" />} />
      <Route path="/home" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/oauth/callback" component={OAuthCallback} />
      <Route path="/api/oauth/callback" component={OAuthCallback} />
      <Route path="/dashboard">
        {() => (
          <Layout>
            <Dashboard />
          </Layout>
        )}
      </Route>
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
      <Route path="/deriv-trading">
        {() => (
          <Layout>
            <DerivTrading />
          </Layout>
        )}
      </Route>
      <Route path="/bot">
        {() => (
          <Layout>
            <Bot />
          </Layout>
        )}
      </Route>
      <Route path="/bot-builder">
        {() => (
          <Layout>
            <BotBuilder />
          </Layout>
        )}
      </Route>
      <Route path="/files">
        {() => (
          <Layout>
            <FileStorage />
          </Layout>
        )}
      </Route>
      <Route path="/analytics">
        {() => (
          <Layout>
            <Analytics />
          </Layout>
        )}
      </Route>
      <Route path="/history">
        {() => (
          <Layout>
            <History />
          </Layout>
        )}
      </Route>
      <Route path="/leaderboard">
        {() => (
          <Layout>
            <Leaderboard />
          </Layout>
        )}
      </Route>
      <Route path="/free-bots">
        {() => (
          <Layout>
            <FreeBots />
          </Layout>
        )}
      </Route>
      <Route path="/charts">
        {() => (
          <Layout>
            <Charts />
          </Layout>
        )}
      </Route>
      <Route path="/scanner">
        {() => (
          <Layout>
            <Scanner />
          </Layout>
        )}
      </Route>
      <Route path="/journal">
        {() => (
          <Layout>
            <Journal />
          </Layout>
        )}
      </Route>
      <Route path="/copy-trading">
        {() => (
          <Layout>
            <CopyTrading />
          </Layout>
        )}
      </Route>
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
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
