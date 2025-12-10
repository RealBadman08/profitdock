# Netlify Environment Variables - EXACT VALUES

Copy these EXACTLY into Netlify's environment variables section:

## Required for Deriv Trading:

**Variable 1:**
```
Key:   VITE_APP_ID
Value: 114155
```

**Variable 2:**  
```
Key:   VITE_DERIV_ENDPOINT
Value: wss://ws.derivws.com/websockets/v3
```

## Optional (OAuth - if your app uses it for other features):

These are for the general OAuth system in your app (not Deriv-specific). 
**You can skip these for now** and the Deriv trading will still work:

```
Key:   VITE_OAUTH_PORTAL_URL
Value: [SKIP FOR NOW - trading will work without this]
```

---

## How to add these in Netlify:

1. In the build settings page, scroll down to "Environment variables"
2. Click "Add environment variable" 
3. Enter the Key and Value EXACTLY as shown above
4. Click "Add variable"
5. Repeat for each variable

Then click "Deploy site"!

Your Deriv trading features will work with just the APP_ID and WebSocket endpoint.
