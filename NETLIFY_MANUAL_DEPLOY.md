# Netlify Manual Deployment - Simple Steps

Since your code isn't on GitHub yet, use this quick manual deployment:

## Step 1: Close the current deployment page

Exit the "import from Git" flow in Netlify.

## Step 2: Manual Deploy

1. Go to: https://app.netlify.com/drop
2. **Drag and drop** this folder into the Netlify window:
   ```
   C:\Users\user\Desktop\ProfitDock\dist\public
   ```
3. Wait for upload to complete
4. Your site will be live!

## Step 3: Configure Your Site

After deployment:

1. Go to **Site settings** → **General** → **Site details**
2. Click **"Change site name"**
3. Enter: `profitdock`
4. Save

## Step 4: Add Environment Variables

1. Go to **Site settings** → **Environment variables**
2. Add these:

```
VITE_APP_ID = 114155
VITE_DERIV_ENDPOINT = wss://ws.derivws.com/websockets/v3
```

3. After adding variables, **redeploy**:
   - Go to **Deploys** tab
   - Click **"Trigger deploy"** → **"Deploy site"**

---

## Alternative: Push to GitHub First (For Continuous Deployment)

If you want auto-deployment when code changes:

```bash
# Create GitHub repo first, then:
git remote add origin https://github.com/YOUR_USERNAME/ProfitDock.git
git add .
git commit -m "Initial commit"
git push -u origin master
```

Then import from Git in Netlify.

---

**Quick Option:** Use the drag-and-drop method above! ⬆️
