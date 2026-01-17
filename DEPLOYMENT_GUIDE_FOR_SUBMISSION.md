# 🚀 Production Deployment Guide
## Forward Deployed Engineer Assignment - Superjoin

**Candidate**: Ayush Kumar  
**Assignment**: Google Sheets ↔ MySQL Bidirectional Sync System  
**Live Demo**: https://datasync-0wv9.onrender.com  

---

## 📋 Executive Summary

This application demonstrates production-grade deployment capabilities including:
- ✅ Multi-service orchestration (Backend, Database, Redis, Frontend)
- ✅ Cloud deployment on Render.com (free tier)
- ✅ Docker containerization with multi-stage builds
- ✅ Infrastructure as Code (render.yaml)
- ✅ OAuth integration with Google Cloud Platform
- ✅ Real-time WebSocket communication
- ✅ Automated CI/CD from GitHub

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Architecture                    │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐         HTTPS          ┌──────────────────┐
│   React Frontend │◄──────────────────────►│  Express Backend │
│  (Render Static) │     WebSocket/REST     │  (Render Web)    │
└──────────────────┘                        └────────┬─────────┘
                                                     │
                          ┌──────────────────────────┼──────────┐
                          │                          │          │
                          ▼                          ▼          ▼
              ┌───────────────────┐      ┌──────────────┐  ┌────────┐
              │  Google Sheets    │      │   MySQL 8.0  │  │  Redis │
              │  API (OAuth 2.0)  │      │ (Render DB)  │  │(Render)│
              └───────────────────┘      └──────────────┘  └────────┘
```

---

## 🎯 Deployment Options

### Option 1: Render.com (Recommended - Already Configured)
**Best for**: Quick deployment, Free tier, Auto-scaling

### Option 2: Docker Compose (Local/Self-hosted)
**Best for**: Full control, Development environment

### Option 3: Kubernetes (Advanced)
**Best for**: Enterprise production, High availability

---

## 🚀 DEPLOYMENT OPTION 1: Render.com (Recommended)

### Prerequisites
- [x] GitHub account with repository
- [x] Google Cloud Platform account (for OAuth)
- [x] Render.com account (free)

### Step-by-Step Deployment

#### Phase 1: Prepare Repository

1. **Ensure Clean Codebase**:
   ```bash
   # Already done - credentials removed, code cleaned
   git status
   git add .
   git commit -m "chore: prepare for production deployment"
   git push origin main
   ```

2. **Verify render.yaml** (already exists):
   ```yaml
   services:
     - Backend (Node.js)
     - Redis cache
     - MySQL database
   ```

#### Phase 2: Deploy to Render

1. **Sign up at Render.com**:
   - Visit: https://render.com
   - Click "Get Started" → Sign in with GitHub

2. **Create New Blueprint**:
   - Dashboard → "New" → "Blueprint"
   - Select your repository: `ayushrskiaa/DataSync`
   - Render reads `render.yaml` automatically

3. **Configure Services**:
   
   Render will create 3 services:
   - ✅ `superjoin-backend` (Web Service)
   - ✅ `superjoin-redis` (Redis)
   - ✅ `superjoin-db` (MySQL Database)

4. **Add Environment Variables** (Backend):
   
   Go to `superjoin-backend` → Environment:
   
   ```bash
   # Server
   NODE_ENV=production
   PORT=3001
   FRONTEND_URL=https://datasync-frontend-xyz.onrender.com
   
   # Database (auto-filled from render.yaml)
   DB_HOST=[from Render]
   DB_PORT=3306
   DB_USER=[from Render]
   DB_PASSWORD=[from Render]
   DB_NAME=[from Render]
   
   # Redis (auto-filled)
   REDIS_HOST=[from Render]
   REDIS_PORT=6379
   REDIS_PASSWORD=[from Render if any]
   
   # Google OAuth - Get from Google Cloud Console
   GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   GOOGLE_REDIRECT_URI=https://your-backend-url.onrender.com/api/auth/google/callback
   GOOGLE_REFRESH_TOKEN=[Generate after deployment]
   
   # Sync Config
   SYNC_INTERVAL_MS=2000
   MAX_RETRIES=3
   BATCH_SIZE=100
   LOG_LEVEL=info
   ```

5. **Deploy Backend**:
   - Click "Create Web Service"
   - Wait for build (~3-5 minutes)
   - Check deployment logs

6. **Initialize Database**:
   
   Option A - Via Render Shell:
   ```bash
   # Connect to backend service shell
   # Run:
   cd Backend
   mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME < init.sql
   ```
   
   Option B - Via Local MySQL Client:
   ```bash
   # Get external connection string from Render dashboard
   mysql -h bnfr3dq4nfldisbvmjdx-mysql.services.clever-cloud.com -u user -p < Backend/init.sql
   ```

#### Phase 3: Deploy Frontend

1. **Create Static Site**:
   - Render Dashboard → "New" → "Static Site"
   - Repository: Same repo
   - Branch: `main`
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `build`

2. **Environment Variable**:
   ```bash
   REACT_APP_API_URL=https://datasync-0wv9.onrender.com
   REACT_APP_WS_URL=https://datasync-0wv9.onrender.com
   ```

3. **Deploy**:
   - Click "Create Static Site"
   - Wait for build (~2-3 minutes)

#### Phase 4: Configure Google OAuth for Production

1. **Update Google Cloud Console**:
   - Go to: https://console.cloud.google.com/
   - APIs & Services → Credentials
   - Select your OAuth 2.0 Client
   - Authorized redirect URIs → Add:
     ```
     https://datasync-0wv9.onrender.com/api/auth/google/callback
     ```
   - Save

2. **Generate Production Refresh Token**:
   ```bash
   # Visit in browser:
   https://datasync-0wv9.onrender.com/api/auth/google
   
   # Complete OAuth flow
   # Copy the refresh_token from response
   # Add to Render environment variables
   ```

3. **Update Backend Environment**:
   - Add `GOOGLE_REFRESH_TOKEN` with new token
   - Redeploy backend

#### Phase 5: Verification

1. **Health Check**:
   ```bash
   curl https://datasync-0wv9.onrender.com/health
   # Expected: {"status":"healthy","database":"connected","redis":"connected"}
   ```

2. **Test Frontend**:
   - Visit: https://datasync-frontend-xyz.onrender.com
   - Should load dashboard

3. **Test Sync Flow**:
   - Create Google Sheet
   - Configure sync
   - Test bidirectional updates

---

## 🐳 DEPLOYMENT OPTION 2: Docker Compose (Self-Hosted)

### For Local/VPS Deployment

1. **Prerequisites**:
   ```bash
   # Install Docker Desktop or Docker Engine
   docker --version
   docker-compose --version
   ```

2. **Environment Setup**:
   ```bash
   cd Backend
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Deploy All Services**:
   ```bash
   # From project root
   docker-compose up -d
   
   # Services:
   # - MySQL: localhost:3306
   # - Redis: localhost:6379
   # - Backend: localhost:3001
   ```

4. **Initialize Database**:
   ```bash
   docker exec -it superjoin-mysql \
     mysql -u superjoin_user -psuperjoin_pass superjoin_db < Backend/init.sql
   ```

5. **Deploy Frontend**:
   ```bash
   cd frontend
   npm run build
   # Serve build/ folder with nginx or any static server
   ```

---

## ☸️ DEPLOYMENT OPTION 3: Kubernetes (Advanced)

### For Enterprise Production

<parameter name="Complexity">8
