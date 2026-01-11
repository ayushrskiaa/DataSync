# Railway Deployment Guide

## Prerequisites
- Railway account (sign up at https://railway.app)
- GitHub repository (your code should be pushed)

## Step-by-Step Deployment

### 1. Create New Railway Project

1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Connect your GitHub account and select your repository

### 2. Set Up Services

You'll need to create 3 services in Railway:

#### Service 1: MySQL Database

1. Click **"+ New"** → **"Database"** → **"Add MySQL"**
2. Railway will auto-provision MySQL
3. Note the connection details (Railway provides them automatically)

#### Service 2: Redis Database

1. Click **"+ New"** → **"Database"** → **"Add Redis"**
2. Railway will auto-provision Redis

#### Service 3: Backend API

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. Set **Root Directory** to `Backend`
4. Add environment variables:

```
NODE_ENV=production
PORT=${{PORT}}

# Database (Railway provides these automatically via reference)
DB_HOST=${{MySQL.MYSQL_HOST}}
DB_PORT=${{MySQL.MYSQL_PORT}}
DB_USER=${{MySQL.MYSQL_USER}}
DB_PASSWORD=${{MySQL.MYSQL_PASSWORD}}
DB_NAME=${{MySQL.MYSQL_DATABASE}}

# Redis (Railway provides these automatically via reference)
REDIS_HOST=${{Redis.REDIS_HOST}}
REDIS_PORT=${{Redis.REDIS_PORT}}

# Google Sheets API
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REDIRECT_URI=https://<your-backend-url>.railway.app/auth/google/callback
GOOGLE_REFRESH_TOKEN=<your-refresh-token>

# Frontend URL (will be set after deploying frontend)
FRONTEND_URL=https://<your-frontend-url>.railway.app

# Sync Configuration
SYNC_INTERVAL_MS=2000
MAX_RETRIES=3
BATCH_SIZE=100
LOG_LEVEL=info
```

5. **Build Command**: `npm install && npm run build`
6. **Start Command**: `npm run start`

#### Service 4: Frontend

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. Set **Root Directory** to `frontend`
4. Add environment variables:

```
REACT_APP_API_URL=https://<your-backend-url>.railway.app
```

5. **Build Command**: `npm install && npm run build`
6. **Start Command**: Railway will serve the static build folder

OR use a static site host like:
- **Vercel** (recommended for React apps)
- **Netlify**
- **Cloudflare Pages**

### 3. Update Google OAuth Redirect URI

1. Go to Google Cloud Console
2. Update OAuth redirect URI to include:
   - `https://<your-backend-url>.railway.app/auth/google/callback`

### 4. Initialize Database

After backend is deployed, you need to run the init.sql:

**Option A: Via Railway Dashboard**
1. Go to MySQL service
2. Click **"Connect"**
3. Use provided credentials to connect via MySQL client
4. Run the `Backend/init.sql` script

**Option B: Via Backend API**
Add a one-time setup endpoint in your backend to initialize tables.

### 5. Update CORS Settings

Make sure your backend [src/index.ts](Backend/src/index.ts) has the correct CORS for production:

```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
```

### 6. Verify Deployment

1. Check backend health: `https://<your-backend-url>.railway.app/health`
2. Visit frontend: `https://<your-frontend-url>.railway.app`
3. Test Google OAuth flow
4. Test sync configuration

## Alternative: Deploy Frontend to Vercel

For better performance, deploy frontend to Vercel:

1. Go to https://vercel.com
2. Import your GitHub repository
3. Set root directory to `frontend`
4. Add environment variable:
   ```
   REACT_APP_API_URL=https://<your-backend-url>.railway.app
   ```
5. Deploy

## Troubleshooting

### Build Fails
- Check Railway logs
- Ensure `npm run build` works locally
- Verify all dependencies are in package.json

### Connection Errors
- Verify MySQL and Redis are running
- Check environment variable references
- Ensure firewall allows connections

### OAuth Fails
- Update Google redirect URI
- Check GOOGLE_REDIRECT_URI matches deployed URL
- Verify credentials are correct

## Monitoring

Railway provides:
- Real-time logs
- Metrics dashboard
- Auto-scaling (on paid plans)
- Custom domains (on paid plans)

## Cost Estimate

- **Hobby Plan** (Free): 
  - $5 credit/month
  - Good for testing
  
- **Developer Plan** ($5/month per user):
  - $5 credit + pay for usage
  - Production-ready

- **Pro Plan** ($20/month):
  - More resources and priority support

## Next Steps

1. ✅ Push code to GitHub
2. ✅ Create Railway project
3. ✅ Add MySQL and Redis
4. ✅ Deploy backend
5. ✅ Deploy frontend
6. ✅ Update OAuth settings
7. ✅ Initialize database
8. ✅ Test complete flow
