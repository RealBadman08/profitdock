/**
 * ProfitDock Deriv Configuration
 * 
 * App ID: 113977
 * OAuth Scopes: Read, Trade, Trading Information
 * OAuth Redirect URL: https://profitdock.site/
 */

export const DERIV_CONFIG = {
  // Your registered Deriv App ID
  APP_ID: "114155",

  // WebSocket endpoints
  WS_URL: "wss://ws.derivws.com/websockets/v3",

  // OAuth configuration
  OAUTH_URL: "https://oauth.deriv.com/oauth2/authorize",
  REDIRECT_URL: process.env.NODE_ENV === "production"
    ? "https://profitdock.site/oauth/callback"
    : "http://localhost:3000/oauth/callback",

  // OAuth scopes
  SCOPES: ["read", "trade", "trading_information"],

  // API endpoints
  API_ENDPOINTS: {
    authorize: "authorize",
    balance: "balance",
    buy: "buy",
    proposal: "proposal",
    portfolio: "portfolio",
    profitTable: "profit_table",
    statement: "statement",
    activeSymbols: "active_symbols",
    ticks: "ticks",
    ticksHistory: "ticks_history",
    tradingTimes: "trading_times",
    assetIndex: "asset_index",
  },

  // Account types
  ACCOUNT_TYPES: {
    DEMO: "demo",
    REAL: "real",
  },
} as const;

export type DerivAccountType = typeof DERIV_CONFIG.ACCOUNT_TYPES[keyof typeof DERIV_CONFIG.ACCOUNT_TYPES];
