# Render.com Deployment Guide

## 🆓 100% Free Deployment

Render offers a generous free tier perfect for this project!

## Step-by-Step Deployment

### 1. Sign Up for Render

1. Go to https://render.com
2. Click **"Get Started"** and sign up with GitHub
3. Authorize Render to access your repositories

### 2. Deploy PostgreSQL Database (Free)

1. From Render dashboard, click **"New +"** → **"PostgreSQL"**
2. Name: `superjoin-db`
3. Database: `superjoin_db`
4. User: (auto-generated)
5. Region: Choose closest to you
6. Plan: **Free**
7. Click **"Create Database"**
8. **Save the connection details** (Internal Database URL)

### 3. Deploy Redis (Free)

1. Click **"New +"** → **"Redis"**
2. Name: `superjoin-redis`
3. Plan: **Free** (25MB)
4. Click **"Create Redis"**
5. **Save the connection URL**

### 4. Deploy Backend API

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `superjoin-backend`
   - **Region**: Same as database
   - **Branch**: `main`
   - **Root Directory**: `Backend`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Plan**: Free

4. Click **"Advanced"** and add Environment Variables:

```bash
NODE_ENV=production

# Database (Get from PostgreSQL service)
DB_HOST=<from-postgres-internal-url>
DB_PORT=5432
DB_USER=<from-postgres-internal-url>
DB_PASSWORD=<from-postgres-internal-url>
DB_NAME=superjoin_db

# Redis (Get from Redis service)
REDIS_HOST=<from-redis-internal-url>
REDIS_PORT=6379

# Google Sheets API (Get from Google Cloud Console)
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=https://superjoin-backend.onrender.com/auth/google/callback
GOOGLE_REFRESH_TOKEN=<your-google-refresh-token>

# Frontend URL (will be Render URL)
FRONTEND_URL=https://superjoin-frontend.onrender.com

# Sync Configuration
SYNC_INTERVAL_MS=2000
MAX_RETRIES=3
BATCH_SIZE=100
LOG_LEVEL=info
```

5. Click **"Create Web Service"**

**Note:** Render will auto-deploy from GitHub on every push!

### 5. Initialize Database

After backend deploys successfully, you need to run the initialization SQL.

**Option A: Using Render Dashboard**
1. Go to your PostgreSQL service
2. Click **"Connect"** → **"External Connection"**
3. Use any PostgreSQL client (DBeaver, pgAdmin, or online tool)
4. Run the modified `init.sql` (see below for PostgreSQL version)

**Option B: Using psql command line**
```bash
# Get connection string from Render dashboard
psql <external-database-url> < Backend/init-postgres.sql
```

### 6. Deploy Frontend to Render (Static Site)

1. Click **"New +"** → **"Static Site"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `superjoin-frontend`
   - **Branch**: `main`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `build`
   - **Plan**: Free

4. Add Environment Variable:
```
REACT_APP_API_URL=https://superjoin-backend.onrender.com
```

5. Click **"Create Static Site"**

### 7. Update Google OAuth Settings

1. Go to Google Cloud Console
2. Navigate to APIs & Services → Credentials
3. Update Authorized redirect URIs:
   - Add: `https://superjoin-backend.onrender.com/auth/google/callback`

### 8. Test Your Deployment

1. Visit: `https://superjoin-backend.onrender.com/health`
   - Should return: `{"status":"healthy"}`

2. Visit: `https://superjoin-frontend.onrender.com`
   - Your app should load!

3. Test the sync flow:
   - Create a Google Sheet
   - Configure sync
   - Test bidirectional updates

## 🎯 PostgreSQL Migration

Render's free tier uses PostgreSQL instead of MySQL. The code needs minor adjustments:

### Changes needed:

1. **Install PostgreSQL driver** (already compatible with mysql2)
2. **Update a few queries** - see `POSTGRES_MIGRATION.md`

I can help you make these changes if needed!

## 📊 Free Tier Limits

- **Web Services**: 750 hours/month (enough for 1 service 24/7)
- **PostgreSQL**: 1GB storage
- **Redis**: 25MB storage
- **Bandwidth**: 100GB/month
- **Note**: Services sleep after 15 min of inactivity (cold starts ~30s)

## 🚀 Advantages

✅ Free SSL certificates
✅ Auto-deploy on git push
✅ Easy rollbacks
✅ Health checks
✅ View logs in real-time
✅ No credit card required

## 🔧 Troubleshooting

**Service won't start:**
- Check logs in Render dashboard
- Verify all environment variables are set
- Ensure build completed successfully

**Database connection fails:**
- Use Internal Database URL (not external)
- Check DB credentials in environment variables

**Cold starts slow:**
- Free tier services sleep after 15 min
- First request after sleep takes ~30s
- Consider upgrading to paid plan ($7/mo) for always-on

## 💡 Pro Tips

1. **Keep services in same region** for faster connections
2. **Use Internal URLs** for service-to-service communication
3. **Monitor logs** during first deploy
4. **Set up health checks** for auto-restart

## Next Steps

Ready to deploy? Here's the checklist:

- [ ] Sign up for Render
- [ ] Create PostgreSQL database
- [ ] Create Redis instance
- [ ] Deploy backend service
- [ ] Initialize database
- [ ] Deploy frontend
- [ ] Update Google OAuth
- [ ] Test complete flow

Need help with PostgreSQL migration? Just ask!
