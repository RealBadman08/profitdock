# ProfitDock Netlify Deployment Guide

This guide provides complete instructions for deploying ProfitDock to Netlify at `profitdoc.netlify.app`.

## 🚨 Important: Backend Hosting

**Netlify only hosts static frontend files.** Your Express.js backend must be hosted separately on platforms like:
- **Railway** (recommended)
- **Render**
- **Heroku**
- **DigitalOcean**
- **AWS/GCP/Azure**

## 📋 Netlify Build Settings

When configuring your Netlify site, use these settings:

### Build Command
```bash
pnpm install && pnpm run build
```

### Publish Directory
```
dist/public
```

### Node Version
```
20
```

### Package Manager
```
pnpm
```

## 🔐 Required Environment Variables

Configure these in your Netlify dashboard under **Site settings → Environment variables**:

### Frontend Variables (VITE_* prefix required for Vite access)

| Variable Name | Description | Example Value | Required |
|--------------|-------------|---------------|----------|
| `VITE_APP_ID` | Application ID for OAuth | `your-app-id` | ✅ Yes |
| `VITE_OAUTH_PORTAL_URL` | OAuth server URL | `https://your-oauth-server.com` | ✅ Yes |
| `VITE_FRONTEND_FORGE_API_KEY` | Google Maps API key | `AIza...` | ⚠️ For Map feature |
| `VITE_FRONTEND_FORGE_API_URL` | Google Maps API URL | `https://maps.googleapis.com/maps/api/js` | ⚠️ For Map feature |
| `VITE_ANALYTICS_ENDPOINT` | Analytics server endpoint | `https://analytics.example.com` | ❌ Optional |
| `VITE_ANALYTICS_WEBSITE_ID` | Analytics website ID | `your-website-id` | ❌ Optional |

### Backend Variables (for your backend server, NOT Netlify)

These should be configured on your backend hosting platform (Railway, Render, etc.):

| Variable Name | Description | Required |
|--------------|-------------|----------|
| `DATABASE_URL` | MySQL database connection string | ✅ Yes |
| `JWT_SECRET` | Secret key for JWT token signing | ✅ Yes |
| `OAUTH_SERVER_URL` | OAuth server URL (backend) | ✅ Yes |
| `OWNER_OPEN_ID` | Owner's OpenID | ✅ Yes |
| `BUILT_IN_FORGE_API_URL` | Backend Forge API URL | ⚠️ If using |
| `BUILT_IN_FORGE_API_KEY` | Backend Forge API key | ⚠️ If using |
| `PORT` | Server port | ❌ Optional (default: 3000) |
| `NODE_ENV` | Environment mode | ✅ Yes (set to "production") |

## 🚀 Deployment Steps

### 1. Prepare Your Repository

Ensure your repository is pushed to GitHub, GitLab, or Bitbucket with the latest changes.

### 2. Connect to Netlify

1. Go to [Netlify](https://app.netlify.com)
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose your Git provider and authenticate
4. Select the **ProfitDock** repository

### 3. Configure Build Settings

On the deployment configuration page, enter:

- **Branch to deploy:** `main` (or your default branch)
- **Build command:** `pnpm install && pnpm run build`
- **Publish directory:** `dist/public`
- **Site name:** `profitdock`

### 4. Set Environment Variables

1. Before deploying, go to **Site settings → Environment variables**
2. Add all required `VITE_*` variables listed above
3. Click **"Save"**

### 5. Deploy

1. Click **"Deploy site"**
2. Wait for the build to complete (usually 2-5 minutes)
3. Your site will be live at `https://profitdoc.netlify.app`

### 6. Configure Custom Domain (Optional)

If you want to use `profitdock.site`:

1. Go to **Site settings → Domain management**
2. Click **"Add custom domain"**
3. Enter `profitdock.site`
4. Follow Netlify's DNS configuration instructions

## 🔧 Connecting Frontend to Backend

After deploying both frontend and backend:

1. Note your backend URL (e.g., `https://your-app.railway.app`)
2. In Netlify, add environment variable:
   ```
   VITE_API_URL = https://your-app.railway.app
   ```
3. Redeploy your Netlify site for changes to take effect

## ✅ Verification Checklist

After deployment, verify:

- [ ] Site loads at `https://profitdoc.netlify.app`
- [ ] Homepage renders correctly
- [ ] Navigation works (click through pages)
- [ ] Page refresh doesn't show 404 (SPA routing works)
- [ ] Browser console shows no critical errors
- [ ] API calls connect to backend (check Network tab)
- [ ] OAuth login redirects work

## 🐛 Troubleshooting

### Build Failed

**Error:** "Command failed with exit code 1"
- Check build logs for specific errors
- Ensure all dependencies are in `package.json`
- Verify Node version compatibility

### Environment Variables Not Working

**Issue:** App shows errors about missing config
- Ensure all `VITE_*` variables are prefixed correctly
- Redeploy after adding environment variables
- Check browser console for actual values (not secrets)

### 404 on Page Refresh

**Issue:** Refreshing a route shows 404
- Verify `netlify.toml` and `_redirects` files exist
- Check publish directory is correct (`dist/public`)

### Can't Connect to Backend

**Issue:** API calls fail
- Verify backend is deployed and running
- Check CORS settings on backend allow Netlify domain
- Ensure backend URL in environment variables is correct

## 📚 Additional Resources

- [Netlify Documentation](https://docs.netlify.com/)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Netlify SPA Routing](https://docs.netlify.com/routing/redirects/rewrites-proxies/#history-pushstate-and-single-page-apps)

## 🔄 Continuous Deployment

Once connected, Netlify automatically:
- Deploys on every push to your connected branch
- Generates deploy previews for pull requests
- Provides deploy logs and rollback options

To disable auto-deploy, go to **Site settings → Build & deploy → Continuous deployment** and pause builds.
