# ProfitDock - Deriv Trading Platform User Guide

## Overview

ProfitDock is your personalized Deriv third-party trading application, registered with **App ID: 114155**. It provides full access to Deriv's trading features with advanced analytics and a custom interface.

---

## Getting Started

### 1. Login Methods

#### Option A: OAuth Login (Recommended)
1. Click **"Start Trading"** on the homepage or navigate to `/trade`
2. Click **"Login with Deriv OAuth"** button
3. You'll be redirected to Deriv's authorization page
4. Grant permissions (Read, Trade, Trading Information)
5. You'll be automatically redirected back and logged in

#### Option B: API Token Login
1. Get your API token from [Deriv Dashboard](https://app.deriv.com/account/api-token)
2. Enter the token in the "API Token" field
3. Click "Authorize with Token"

**Note:** OAuth is recommended as it's more secure and handles token refresh automatically.

---

## Features

### Account Management

#### Switching Between Demo and Real Accounts
- After login, you'll see an **Account Switcher** in the header
- Click the dropdown to view all your accounts
- **Demo accounts** start with "VRT" (e.g., VRT12345)
- **Real accounts** have different prefixes (e.g., CR12345, MLT12345)
- Click any account to switch instantly
- Your balance and account type indicator update automatically

### Live Trading

#### Placing Trades

1. **Select Market**
   - Choose from available symbols (R_100, R_50, Volatility indices, etc.)
   - Real-time price updates will stream automatically

2. **Configure Trade**
   - **Contract Type**: Rise (CALL) or Fall (PUT)
   - **Stake Amount**: Enter your desired stake in USD
   - **Duration**: Number of ticks for the contract

3. **Review Proposal**
   - The system automatically fetches real-time pricing
   - View:
     - **Potential Payout**: Total amount you'll receive if you win
     - **Potential Profit**: Net profit after stake
     - **Ask Price**: Current market price for the contract

4. **Execute Trade**
   - Click **"Place Trade"** when ready
   - Confirmation toast will show your Contract ID
   - Balance updates in real-time

### Real-Time Market Data

- **Live Price Chart**: Visual tick history for selected symbol
- **Current Quote**: Latest market price with timestamp
- **Trend Indicator**: Shows if price is rising or falling
- **Tick History**: Last 30 ticks displayed as a mini chart

### Analytics Dashboard

Navigate to **Analytics** to view:

- **Performance Metrics**
  - Net Profit/Loss
  - Win Rate percentage
  - Profit Factor
  - Maximum Drawdown

- **Advanced Charts**
  - Candlestick charts with technical indicators
  - Customizable timeframes
  - Price action analysis

- **Trade History**
  - Recent trades with outcomes
  - Win/Loss breakdown
  - Detailed statistics

- **Risk Management**
  - Risk/Reward ratios
  - Position sizing metrics
  - Daily loss limits
  - Consecutive loss tracking

### File Storage

Store and manage your trading strategies:

1. Navigate to **Files** page
2. Upload strategy files, bot configurations, or trading logs
3. Categorize files (Strategy, Log, Config, Other)
4. Add descriptions for easy reference
5. Download or delete files as needed

---

## Technical Details

### App Configuration

### App Configuration

- **App ID**: 114155
- **OAuth Scopes**: Read, Trade, Trading Information
- **Redirect URL**: https://profitdock.site/
- **WebSocket Endpoint**: wss://ws.derivws.com/websockets/v3

### Supported Contract Types

Currently implemented:
- **CALL** (Rise): Predict price will go up
- **PUT** (Fall): Predict price will go down

Coming soon:
- Higher/Lower
- Touch/No Touch
- Matches/Differs
- Even/Odd
- Over/Under

### Supported Markets

- **Synthetic Indices**: R_10, R_25, R_50, R_75, R_100
- **Volatility Indices**: 1HZ10V, 1HZ25V, 1HZ50V, 1HZ75V, 1HZ100V
- **Crash/Boom**: Crash 300, Crash 500, Boom 300, Boom 500
- **Step Indices**: Step Index

---

## Security & Best Practices

### Token Management
- OAuth tokens are stored securely in localStorage
- Tokens auto-refresh through OAuth flow
- Manual API tokens should be kept private
- Never share your API tokens with anyone

### Trading Safety
1. **Start with Demo**: Test strategies on demo accounts first
2. **Set Limits**: Use the risk management tools
3. **Monitor Balance**: Keep track of your account balance
4. **Diversify**: Don't put all funds in single trades
5. **Stay Informed**: Check market conditions regularly

### Account Security
- Use strong passwords on your Deriv account
- Enable 2FA on your Deriv account
- Regularly review your API token permissions
- Revoke unused tokens from Deriv Dashboard

---

## Troubleshooting

### Connection Issues
- **"Disconnected" status**: Refresh the page to reconnect
- **Authorization failed**: Token may be expired, try OAuth login
- **No markets loading**: Check your internet connection

### Trading Issues
- **"No proposal available"**: Wait a moment for proposal to load
- **Trade failed**: Check your balance and account status
- **Can't switch accounts**: Ensure you have multiple accounts linked

### Common Errors
- **"Not authorized"**: You need to login first
- **"Insufficient balance"**: Reduce stake amount or deposit funds
- **"Invalid token"**: Get a new token from Deriv Dashboard

---

## Support & Resources

### Deriv Resources
- [Deriv API Documentation](https://developers.deriv.com/docs/websockets)
- [Deriv API Explorer](https://api.deriv.com/api-explorer/)
- [Deriv Dashboard](https://api.deriv.com/dashboard/)
- [Deriv Support](https://deriv.com/contact-us/)

### ProfitDock Features
- **Homepage**: Overview and quick access
- **Trading Page**: Live trading interface
- **Analytics**: Performance tracking
- **Files**: Strategy storage
- **Settings**: Account preferences (coming soon)

---

## Roadmap

### Coming Soon
- [ ] Portfolio/Positions tracking
- [ ] Transaction history integration
- [ ] Profit table with detailed breakdown
- [ ] Multiple contract types (Touch/No Touch, Higher/Lower)
- [ ] Market depth and order book
- [ ] Automated bot builder
- [ ] Backtesting functionality
- [ ] Mobile-responsive improvements
- [ ] Push notifications for trades
- [ ] Advanced risk management tools

---

## Notes

- This is a **third-party application** connected to Deriv
- All trades are executed through Deriv's official API
- Your funds are held by Deriv, not by ProfitDock
- ProfitDock provides the interface and analytics layer
- Trading involves risk - only trade what you can afford to lose

---

**Version**: 1.0  
**Last Updated**: December 2, 2024  
**App ID**: 114155  
**Status**: Production Ready
