# 🚀 Quick Reference: Netlify Deployment Settings

## Netlify Build Configuration

```
Build command:     pnpm install && pnpm run build
Publish directory: dist/public
Node version:      20
Package manager:   pnpm
```

## Required Environment Variables (Netlify Dashboard)

```bash
VITE_APP_ID=your-app-id-here
VITE_OAUTH_PORTAL_URL=https://your-oauth-server.com
```

## Optional Environment Variables

```bash
# Google Maps
VITE_FRONTEND_FORGE_API_KEY=your-google-maps-api-key
VITE_FRONTEND_FORGE_API_URL=https://maps.googleapis.com/maps/api/js

# Analytics
VITE_ANALYTICS_ENDPOINT=https://analytics.example.com
VITE_ANALYTICS_WEBSITE_ID=your-website-id
```

## Deployment URL

```
https://profitdoc.netlify.app
```

## ⚠️ Backend Required

The backend must be deployed separately (Railway, Render, etc.) with these variables:

```bash
DATABASE_URL=mysql://user:password@host:port/database
JWT_SECRET=your-super-secret-jwt-key
OAUTH_SERVER_URL=https://your-oauth-server.com
OWNER_OPEN_ID=your-owner-openid
NODE_ENV=production
```

---

📖 **Full guide:** See [NETLIFY_DEPLOY.md](./NETLIFY_DEPLOY.md)
