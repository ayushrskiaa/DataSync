# Fly.io Docker Deployment Guide

Deploy your Superjoin app to Fly.io with full MySQL + Redis + Backend in Docker containers.

## Prerequisites

1. **Install Fly.io CLI:**
   ```powershell
   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Sign up for Fly.io:**
   ```powershell
   fly auth signup
   # OR if you have account
   fly auth login
   ```

## Step 1: Deploy MySQL Database

Fly.io doesn't provide managed MySQL, so we'll use Clever Cloud MySQL or deploy our own.

**Option A: Keep using Clever Cloud MySQL** (Recommended - already set up)
- Use your existing Clever Cloud MySQL credentials
- Skip to Step 2

**Option B: Use Render PostgreSQL** (Free)
- Keep using Render's free PostgreSQL
- Convert code to PostgreSQL (I can help)

## Step 2: Deploy Redis on Upstash (Free)

Fly.io charges for Redis, so use free Upstash instead:

1. Go to https://upstash.com
2. Sign up (free)
3. Create Redis database
4. Get connection details:
   - Endpoint
   - Port
   - Password

## Step 3: Configure Secrets

Set environment variables in Fly.io:

```powershell
# Navigate to project root
cd "C:\Users\ayush\Desktop\coding\Internship Assignments\Superjoin"

# Database (Clever Cloud MySQL)
fly secrets set DB_HOST=<your-clever-cloud-mysql-host>
fly secrets set DB_PORT=3306
fly secrets set DB_USER=<your-mysql-user>
fly secrets set DB_PASSWORD=<your-mysql-password>
fly secrets set DB_NAME=<your-database-name>

# Redis (Upstash)
fly secrets set REDIS_HOST=<upstash-redis-host>
fly secrets set REDIS_PORT=<upstash-redis-port>
fly secrets set REDIS_PASSWORD=<upstash-password>

# Google Sheets
fly secrets set GOOGLE_CLIENT_ID=<your-client-id>
fly secrets set GOOGLE_CLIENT_SECRET=<your-client-secret>
fly secrets set GOOGLE_REDIRECT_URI=https://superjoin-backend.fly.dev/auth/google/callback
fly secrets set GOOGLE_REFRESH_TOKEN=<your-refresh-token>

# Frontend URL (set after deploying frontend)
fly secrets set FRONTEND_URL=https://your-frontend-url.vercel.app
```

## Step 4: Deploy Backend

```powershell
# Launch the app (first time)
fly launch

# Answer prompts:
# - App name: superjoin-backend (or choose your own)
# - Region: Choose closest to you
# - Set up PostgreSQL: No
# - Set up Redis: No
# - Deploy now: Yes

# The app will build and deploy!
```

## Step 5: Check Deployment

```powershell
# View logs
fly logs

# Check status
fly status

# Open in browser
fly open

# Visit health endpoint
# https://superjoin-backend.fly.dev/health
```

## Step 6: Deploy Frontend to Vercel (Free & Easy)

1. Go to https://vercel.com
2. Sign in with GitHub
3. Import your repository
4. Configure:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`
   - **Framework Preset**: Create React App
5. Add environment variable:
   ```
   REACT_APP_API_URL=https://superjoin-backend.fly.dev
   ```
6. Click **Deploy**

## Step 7: Update Google OAuth

Update redirect URI in Google Cloud Console:
```
https://superjoin-backend.fly.dev/auth/google/callback
```

## Step 8: Update Frontend URL Secret

```powershell
fly secrets set FRONTEND_URL=https://your-app.vercel.app
```

## Useful Commands

```powershell
# View all secrets
fly secrets list

# Update a secret
fly secrets set KEY=VALUE

# Restart app
fly apps restart superjoin-backend

# Scale resources (if needed)
fly scale memory 512

# View metrics
fly dashboard

# SSH into container
fly ssh console
```

## Troubleshooting

### Build Fails
```powershell
# Check build logs
fly logs

# Try building locally
cd Backend
docker build -t test-build .
```

### App Won't Start
```powershell
# Check logs
fly logs

# Verify secrets are set
fly secrets list

# Check app status
fly status
```

### Database Connection Issues
- Verify DB_HOST, DB_PORT, DB_USER, DB_PASSWORD are correct
- Ensure Clever Cloud MySQL is accessible from external IPs
- Check firewall rules

## Cost Estimate

- **Fly.io Backend**: FREE (within free tier limits)
- **Clever Cloud MySQL**: FREE (256MB)
- **Upstash Redis**: FREE (10K commands/day)
- **Vercel Frontend**: FREE (unlimited)

**Total: $0/month!** 🎉

## Updating Your App

```powershell
# After making code changes
git add .
git commit -m "Your changes"
git push origin main

# Deploy to Fly.io
fly deploy
```

## Next Steps

1. ✅ Install Fly CLI
2. ✅ Create Upstash Redis
3. ✅ Deploy to Fly.io
4. ✅ Deploy frontend to Vercel
5. ✅ Update Google OAuth
6. ✅ Test the complete flow!
