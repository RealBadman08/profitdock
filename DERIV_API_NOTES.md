# ProfitDock - Deriv API Integration Notes

## WebSocket Connection

**Base Endpoint:**
```
wss://ws.derivws.com/websockets/v3?app_id={app_id}
```

## Key Features

1. **Real-time Communication**: WebSocket-based API for live trading data
2. **Session Timeout**: 2 minutes of inactivity
3. **Keep-Alive**: Use ping or time requests to maintain connection
4. **Rate Limits**: Check via server_status call

## WebSocket Events

- `onopen`: Connection established
- `onmessage`: Data received from server
- `onclose`: Connection closed
- `onerror`: Error occurred

## Required Steps

1. Register app at https://api.deriv.com/dashboard/ to get app_id
2. Get API token for authentication
3. Connect to WebSocket endpoint
4. Implement keep-alive mechanism
5. Handle real-time market data
6. Execute trades via API calls

## Integration Plan for ProfitDock

1. **Frontend**: Connect to Deriv WebSocket from client
2. **Backend**: Store user API tokens securely
3. **Real-time Data**: Stream market prices, account balance
4. **Trading**: Execute buy/sell contracts via API
5. **Analytics**: Process historical data for advanced analysis
6. **Bot Builder**: Automate trading based on user-defined strategies

## API Documentation

- Main docs: https://developers.deriv.com/docs/websockets
- API Explorer: https://api.deriv.com/api-explorer/
- Dashboard: https://api.deriv.com/dashboard/
