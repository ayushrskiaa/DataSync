# Google Sheets ↔ MySQL Sync System

**Live Production URL**: [https://datasync-0wv9.onrender.com](https://datasync-0wv9.onrender.com)

Bidirectional real-time synchronization between Google Sheets and MySQL database with auto-table creation, conflict resolution, and live monitoring dashboard.

## 🎯 Overview

A production-ready system that creates live 2-way data sync between Google Sheets and MySQL. Any change made in either system reflects in the other automatically. The system is schema-agnostic, works with any table structure, and includes comprehensive error handling.

## ✨ Key Features

### Core Functionality
- ✅ **Bidirectional Real-Time Sync** - Changes sync automatically every 2 seconds
- ✅ **Auto-Table Creation** - Create MySQL tables directly from Google Sheet headers
- ✅ **Schema-Agnostic** - Works with any table structure automatically  
- ✅ **Multiple Sheets Support** - Sync multiple Google Sheets to different tables
- ✅ **Conflict Resolution** - Last-write-wins strategy for concurrent edits
- ✅ **Live Dashboard** - Real-time monitoring interface with WebSocket updates

### Technical Highlights
- ✅ **Polling-Based Sync** - Reliable change detection every 2s (works on free-tier databases)
- ✅ **Fallback Strategy** - Graceful degradation when triggers unavailable
- ✅ **Redis Caching** - Distributed locking and snapshot storage
- ✅ **WebSocket** - Real-time dashboard updates via Socket.io
- ✅ **Connection Pooling** - Optimized for free-tier MySQL limits
- ✅ **Comprehensive Logging** - Winston logger with structured logs

### Production Deployment
- ✅ **Cloud Hosted** - Backend on Render.com (free tier)
- ✅ **External Services** - Clever Cloud MySQL + Upstash Redis
- ✅ **Docker Ready** - Full Docker Compose setup for local development
- ✅ **TypeScript** - Type-safe codebase with strict checks
- ✅ **Security** - Google OAuth 2.0, parameterized queries, input validation
- ✅ **Error Handling** - Graceful failure recovery and detailed error logs

## 🏗️ Architecture

```
┌─────────────────┐      WebSocket/REST       ┌──────────────────┐
│  React Frontend │◄──────────────────────────►│  Express Server  │
│ (localhost:3000)│                            │ (Render.com:3001)│
└─────────────────┘                            └────────┬─────────┘
                                                        │
                    ┌───────────────────────────────────┼──────────────┐
                    │                                   │              │
                    ▼                                   ▼              ▼
        ┌──────────────────────┐          ┌──────────────────┐  ┌────────────┐
        │   Google Sheets API  │          │ Clever Cloud SQL │  │  Upstash   │
        │  (Poll every 2s)     │          │  (MySQL 8.0)     │  │   Redis    │
        └──────────────────────┘          └──────────────────┘  └────────────┘
                    │                                   │              │
                    │       Sync Orchestrator           │              │
                    │     ┌──────────────────┐          │              │
                    ├────►│ SheetsToMySQL    │──────────┤              │
                    │     │   Worker         │          │              │
                    │     │ (Poll & Compare) │          │              │
                    │     └──────────────────┘          │              │
                    │                                   │              │
                    │     ┌──────────────────┐          │              │
                    └─────│ MySQLToSheets    │◄─────────┤              │
                          │   Worker         │          │              │
                          │ (Polling-based)  │          │              │
                          └──────────┬───────┘          │              │
                                     │                  │              │
                                     └──────────────────┴──────────────┘
                                       Last-Write-Wins Resolution
```

### How It Works

**Google Sheets → MySQL:**
1. Worker polls Google Sheets API every 2 seconds
2. Compares current data with cached snapshot (Redis)
3. Detects inserts, updates, and deletes
4. Applies changes to MySQL with conflict checking
5. Updates cached snapshot
6. WebSocket notifies frontend of changes

**MySQL → Google Sheets:**
1. Worker polls `_sync_changelog` table every 2 seconds
2. Fetches unsynced changes (if triggers exist) or polls full table
3. Batches changes for efficiency
4. Applies to Google Sheets via Sheets API
5. Marks changes as synced
6. WebSocket notifies frontend

**Auto-Table Creation:**
1. User creates new sync with non-existent table name
2. System reads sheet headers from row 1
3. Creates MySQL table with columns matching headers
4. Adds auto-increment `id`, `created_at`, `updated_at`
5. Imports existing sheet data into new table
6. Starts bidirectional sync

**Conflict Resolution:**
- **Last-Write-Wins**: Newest change overwrites (based on sync timestamp)
- All conflicts logged to `_sync_conflicts` table
- Dashboard shows conflict history

## 📁 Project Structure

```
Superjoin/
├── Backend/
│   └── src/
│       ├── database/
│       │   └── DatabaseManager.ts       # MySQL connection pool
│       ├── services/
│       │   ├── GoogleSheetsService.ts   # Sheets API wrapper
│       │   └── RedisClient.ts           # Redis pub/sub
│       ├── sync/
│       │   ├── SyncOrchestrator.ts      # Main sync coordinator
│       │   ├── SheetsToMySQLWorker.ts   # Sheets → DB sync
│       │   └── MySQLToSheetsWorker.ts   # DB → Sheets sync
│       ├── routes/
│       │   ├── auth.routes.ts           # Google OAuth
│       │   ├── sync.routes.ts           # Sync configuration
│       │   └── table.routes.ts          # Table operations
│       ├── middleware/
│       │   └── errorHandler.ts          # Global error handling
│       ├── websocket/
│       │   └── socketHandler.ts         # Socket.io events
│       ├── types/
│       │   └── index.ts                 # TypeScript definitions
│       ├── utils/
│       │   └── logger.ts                # Winston logger
│       ├── index.ts                     # Server entry point
│       ├── docker-compose.yml           # MySQL + Redis
│       ├── init.sql                     # Database schema
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md                    # Backend docs
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.js                # Top navigation
│   │   │   ├── Dashboard.js             # Main dashboard
│   │   │   ├── ConfigureSync.js         # Sync setup form
│   │   │   └── SyncDetail.js            # Detailed sync view
│   │   ├── App.js                       # Main app
│   │   ├── index.js                     # React entry
│   │   └── index.css                    # Global styles
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   └── README.md                        # Frontend docs
│
└── README.md                            # This file
```

## 🚀 Quick Start

### Live Production Version

**Backend**: [https://datasync-0wv9.onrender.com](https://datasync-0wv9.onrender.com)  
**Frontend**: Deploy to Vercel (see deployment section)

The backend is already deployed and running with:
- Clever Cloud MySQL (256MB free tier)
- Upstash Redis (10K commands/day free)
- Google OAuth configured

### Local Development Setup

#### Prerequisites

- Node.js 18+
- Docker & Docker Compose (for local MySQL/Redis)
- Google Cloud Project with Sheets API enabled
- Google OAuth 2.0 credentials

#### 1. Clone Repository

```bash
git clone https://github.com/ayushrskiaa/DataSync.git
cd DataSync
```

#### 2. Backend Setup

```bash
cd Backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials (see Backend/README.md)

# Option A: Use Docker for local MySQL + Redis
docker-compose up -d

# Option B: Use production services (update .env)
# DB_HOST=bnfr3dq4nfldisbvmjdx-mysql.services.clever-cloud.com
# REDIS_HOST=loving-sculpin-17822.upstash.io

# Start development server
npm run dev
```

Backend runs on `http://localhost:3001`

#### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure API URL (default points to localhost:3001)
# For production backend, create .env.production:
echo "REACT_APP_API_URL=https://datasync-0wv9.onrender.com" > .env.production
echo "REACT_APP_WS_URL=https://datasync-0wv9.onrender.com" >> .env.production

# Start development server
npm start
```

Frontend runs on `http://localhost:3000`

#### 4. Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable **Google Sheets API**
3. Create **OAuth 2.0 Client ID** (Web application)
4. Add authorized redirect URIs:
   - Local: `http://localhost:3001/api/auth/google/callback`
   - Production: `https://datasync-0wv9.onrender.com/api/auth/google/callback`
5. Copy Client ID and Secret to backend `.env`:
   ```env
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
   ```
6. Visit `/api/auth/google` to authenticate once (generates refresh token)

📖 **Detailed Setup Guide**: See [SETUP.md](SETUP.md) for step-by-step instructions.

## 🧪 Using the System

### 1. Configure Your First Sync

#### Option A: Use Existing MySQL Table
1. Visit dashboard at `http://localhost:3000`
2. Click "Configure New Sync"
3. Enter Google Sheet ID (from spreadsheet URL)
4. Enter Sheet Name (e.g., "Sheet1")
5. Select "Use Existing Table" → Choose from dropdown
6. Click "Configure Sync"

**Result**: MySQL data copies to Google Sheets, then syncs bidirectionally

#### Option B: Create New Table from Sheet
1. In Google Sheets, add column headers in row 1:
   ```
   | name | email | age | department |
   ```
2. Add your data in rows below
3. In dashboard, click "Configure New Sync"
4. Enter Google Sheet ID and Sheet Name
5. Select "Create New Table from Sheet"
6. Enter new table name (e.g., `employees`)
7. Click "Configure Sync"

**Result**: New MySQL table created with columns from headers, sheet data imported, bidirectional sync starts

### 2. Test Bidirectional Sync

**Test Sheets → MySQL:**
1. Edit a cell in Google Sheets
2. Wait 2-3 seconds
3. Check dashboard - should show sync activity
4. Verify in MySQL:
   ```bash
   docker exec -it superjoin-mysql mysql -u syncuser -psyncpassword syncdb
   SELECT * FROM your_table;
   ```

**Test MySQL → Sheets:**
1. Update database:
   ```bash
   docker exec -it superjoin-mysql mysql -u syncuser -psyncpassword syncdb
   UPDATE your_table SET column='new value' WHERE id=1;
   ```
2. Wait 2-3 seconds
3. Check Google Sheets - should update automatically
4. Dashboard shows sync activity

### 3. Sync Multiple Sheets

Repeat the configuration process for each sheet:
- **Sheet 1** → `users` table
- **Sheet 2** → `products` table  
- **Sheet 3** → `orders` table

Each sync runs independently with its own workers.

### 4. Monitor Sync Status

Dashboard shows:
- Active syncs list
- Last sync timestamp
- Sync direction (Sheets→MySQL / MySQL→Sheets)
- Error logs if any
- Conflict history

### 5. Manage Syncs

- **Pause**: Stop sync temporarily (keep configuration)
- **Resume**: Restart paused sync
- **Delete**: Remove sync configuration and stop workers
- **Manual Trigger**: Force immediate sync (useful for testing)

## 🔧 Configuration

### Environment Variables

**Backend (.env):**
```env
# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database (Local Docker)
DB_HOST=localhost
DB_PORT=3306
DB_USER=syncuser
DB_PASSWORD=syncpassword
DB_NAME=syncdb

# Or Production (Clever Cloud)
DB_HOST=bnfr3dq4nfldisbvmjdx-mysql.services.clever-cloud.com
DB_USER=ux7gxe5ocjhcyusn
DB_PASSWORD=your-password
DB_NAME=bnfr3dq4nfldisbvmjdx

# Redis (Local Docker)
REDIS_HOST=localhost
REDIS_PORT=6379

# Or Production (Upstash)
REDIS_HOST=loving-sculpin-17822.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
GOOGLE_REFRESH_TOKEN=auto-generated-after-first-auth

# Sync Settings
SYNC_INTERVAL_MS=2000        # Poll interval (2 seconds)
BATCH_SIZE=100               # Max rows per batch operation
```

**Frontend (.env.production):**
```env
REACT_APP_API_URL=https://datasync-0wv9.onrender.com
REACT_APP_WS_URL=https://datasync-0wv9.onrender.com
```

### Sync Performance Tuning

Adjust in backend `.env`:
- `SYNC_INTERVAL_MS=2000` - How often to poll (milliseconds)
- `BATCH_SIZE=100` - Max rows to process at once
- Lower interval = faster sync, more API calls
- Higher batch size = fewer operations, more memory

### Conflict Resolution

Currently supports **last-write-wins** strategy:
- Compares sync timestamps
- Newer change overwrites older
- All conflicts logged to `_sync_conflicts` table

Future strategies planned: manual resolution, field-level merge

## 📊 Database Schema

### Sync Management Tables

**_sync_state** - Stores sync configurations
```sql
CREATE TABLE _sync_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sheet_id VARCHAR(255) NOT NULL UNIQUE,
  sheet_name VARCHAR(255) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  status ENUM('active', 'paused', 'error') DEFAULT 'active',
  last_sync_timestamp TIMESTAMP(6) NULL,
  last_sheet_sync TIMESTAMP(6) NULL,
  conflict_resolution VARCHAR(50) DEFAULT 'last_write_wins',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**_sync_changelog** - Tracks MySQL changes (used when triggers available)
```sql
CREATE TABLE _sync_changelog (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(255) NOT NULL,
  operation ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
  row_id VARCHAR(255),
  old_data JSON,
  new_data JSON,
  timestamp TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6),
  synced BOOLEAN DEFAULT FALSE,
  sync_timestamp TIMESTAMP(6) NULL,
  INDEX idx_table_synced (table_name, synced),
  INDEX idx_timestamp (timestamp)
);
```

**_sync_conflicts** - Logs detected conflicts
```sql
CREATE TABLE _sync_conflicts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sync_state_id INT NOT NULL,
  row_identifier VARCHAR(255) NOT NULL,
  conflict_type ENUM('concurrent_update', 'delete_update', 'schema_mismatch'),
  sheet_data JSON,
  db_data JSON,
  sheet_timestamp TIMESTAMP(6) NULL,
  db_timestamp TIMESTAMP(6) NULL,
  resolution ENUM('pending', 'sheet_wins', 'db_wins', 'merged', 'manual') DEFAULT 'pending',
  resolved_data JSON,
  resolved_at TIMESTAMP(6) NULL,
  resolved_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sync_state_id) REFERENCES _sync_state(id) ON DELETE CASCADE
);
```

### Example User Tables

When you create a new table from a sheet with headers `name`, `email`, `age`:

```sql
CREATE TABLE your_table_name (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name TEXT,
  email TEXT,
  age TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

All sheet columns are created as `TEXT` type for maximum flexibility.

## 🎯 Key Technical Decisions

### 1. Polling vs Triggers
**Decision**: Hybrid approach with polling as fallback

**Why**:
- Free-tier databases (Clever Cloud, PlanetScale) don't allow trigger creation
- Requires `SUPER` privilege which is restricted on shared hosting
- Polling works everywhere, triggers optimize when available
- System auto-detects trigger capability and adapts

**Implementation**:
- Attempt to create triggers on sync configuration
- If fails with `ER_BINLOG_CREATE_ROUTINE_NEED_SUPER`, log warning and continue
- MySQL→Sheets worker polls changelog table or full table as needed
- 2-second polling interval balances latency vs API quota

### 2. Connection Pool Sizing
**Decision**: 3 connections max (free tier limit is 5)

**Why**:
- Clever Cloud MySQL free tier allows max 5 concurrent connections
- Reserve 2 connections for admin/monitoring
- Use 3 for application with aggressive timeout settings
- Connection pooling with keep-alive prevents connection churn

**Configuration**:
```javascript
connectionLimit: 3,
maxIdle: 2,
idleTimeout: 30000  // Release idle connections after 30s
```

### 3. Auto-Table Creation
**Decision**: Create MySQL tables from Google Sheet headers

**Why**:
- Removes barrier to entry - users don't need MySQL knowledge
- Sheet headers define schema naturally
- All columns as TEXT type handles any data gracefully
- Auto-increment ID added for tracking

**Trade-offs**:
- Less type safety (everything is TEXT)
- No constraints (NULL allowed everywhere)
- Good for prototyping, may need refinement for production use

### 4. Snapshot-Based Change Detection
**Decision**: Cache sheet snapshots in Redis, compare to detect changes

**Why**:
- Google Sheets API has no native change notifications
- Polling with smart diffing minimizes API calls
- Redis provides fast in-memory comparison
- Distributed locking prevents race conditions

**Implementation**:
```javascript
// Store snapshot
await redis.set(`sheet_snapshot_${sheetId}`, JSON.stringify(data));

// Next poll: compare
const changes = detectChanges(cachedSnapshot, currentData);
```

### 5. Last-Write-Wins Conflict Resolution
**Decision**: Simple timestamp-based resolution

**Why**:
- Easiest to implement and understand
- Works well for most use cases
- Alternatives (CRDTs, OT) are complex and overkill for this scope
- All conflicts logged for audit trail

**Future**: Can add manual resolution UI using logged conflicts

## � Deployment

### Current Production Setup

**Backend**: Render.com (Free Web Service)
- URL: https://datasync-0wv9.onrender.com
- Auto-deploys from GitHub main branch
- Health checks on `/health` endpoint
- Logs available in Render dashboard

**Database**: Clever Cloud MySQL 8.0
- 256MB storage (free tier)
- Max 5 concurrent connections
- Automatic backups

**Cache**: Upstash Redis
- 10,000 commands/day (free tier)
- TLS enabled
- Global replication

**Frontend**: Deploy to Vercel (recommended)

### Deploy Frontend to Vercel

1. **Push to GitHub** (if not already):
   ```bash
   git add frontend/
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Deploy on Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project" → Connect GitHub
   - Select your repository
   - Configure:
     - **Root Directory**: `frontend`
     - **Build Command**: `npm run build`
     - **Output Directory**: `build`
     - **Environment Variables**:
       ```
       REACT_APP_API_URL=https://datasync-0wv9.onrender.com
       REACT_APP_WS_URL=https://datasync-0wv9.onrender.com
       ```
   - Click "Deploy"

3. **Update Google OAuth**:
   - Add Vercel URL to authorized redirect URIs
   - Update `FRONTEND_URL` in Render environment variables

### Alternative: Deploy Backend to New Platform

If you want to deploy your own backend instance:

**Render.com** (Current setup):
1. Create new Web Service
2. Connect GitHub repository
3. Build command: `cd Backend && npm install && npm run build`
4. Start command: `cd Backend && npm start`
5. Add environment variables from `.env`

**Docker-based platforms** (Railway, Fly.io):
- Use `Backend/Dockerfile`
- Set environment variables
- Deploy from `Backend` directory

See [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) for detailed Render.com guide.

### Environment Variables for Production

Update in Render dashboard (or your platform):

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-frontend.vercel.app

# Clever Cloud MySQL
DB_HOST=bnfr3dq4nfldisbvmjdx-mysql.services.clever-cloud.com
DB_PORT=3306
DB_USER=ux7gxe5ocjhcyusn
DB_PASSWORD=your-password
DB_NAME=bnfr3dq4nfldisbvmjdx

# Upstash Redis
REDIS_HOST=loving-sculpin-17822.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# Google OAuth (production redirect URI)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-backend.onrender.com/api/auth/google/callback
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

## 🐛 Troubleshooting

### Backend Won't Start

**Error**: `MySQL connection failed`
```bash
# Check MySQL is running
docker ps | grep mysql

# Check connection settings in .env
DB_HOST=localhost
DB_PORT=3306
```

**Error**: `Redis connection refused`
```bash
# Check Redis is running
docker ps | grep redis

# Verify Redis config
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Sync Not Working

**Issue**: Changes in sheet don't appear in MySQL
1. Check backend logs for errors
2. Verify Google OAuth token is valid (try re-authenticating at `/api/auth/google`)
3. Check Sheet ID is correct (from spreadsheet URL)
4. Ensure sheet name matches exactly (case-sensitive)

**Issue**: Changes in MySQL don't appear in sheet  
1. Check `_sync_changelog` table has entries (if triggers exist)
2. Verify worker is running (check logs for "MySQL→Sheets worker started")
3. Check Google Sheets API quota hasn't been exceeded
4. Verify Redis is storing snapshots correctly

### "No active workers" Error

**Cause**: Sync was created before latest code fixes

**Solution**:
```bash
# Delete and recreate sync through dashboard
# OR restart backend server to reinitialize workers
```

### Connection Pool Exhausted

**Error**: `User has exceeded 'max_user_connections'`

**Solution**: Already fixed in production (connection limit reduced to 3)

If still occurring:
1. Check for connection leaks in code
2. Verify `docker-compose.yml` MySQL `max_connections` setting
3. Close unused connections

### Google OAuth Issues

**Error**: `redirect_uri_mismatch`

**Solution**:
1. Go to Google Cloud Console → Credentials
2. Edit OAuth 2.0 Client
3. Add authorized redirect URI: `http://localhost:3001/api/auth/google/callback`
4. For production: `https://datasync-0wv9.onrender.com/api/auth/google/callback`

**Error**: `Invalid refresh token`

**Solution**:
1. Delete `GOOGLE_REFRESH_TOKEN` from `.env`
2. Visit `/api/auth/google` to generate new token
3. Copy token from response to `.env`

### Detailed Logs

Check individual component READMEs:
- [Backend Troubleshooting](Backend/README.md#troubleshooting)
- [Frontend Troubleshooting](frontend/README.md#troubleshooting)

## 📝 Known Limitations & Future Enhancements

### Current Limitations

1. **Trigger Support**: Free-tier MySQL doesn't allow trigger creation, falling back to polling
2. **Connection Limits**: Free MySQL limited to 5 connections (using 3 for app)
3. **Storage**: Clever Cloud free tier limited to 256MB
4. **Redis Quota**: 10,000 commands/day on Upstash free tier
5. **Render Sleep**: Free tier sleeps after 15min inactivity (30s cold start)

### Planned Enhancements

- [ ] Frontend deployment to Vercel (currently local only)
- [ ] Multiple sheet tabs per sync configuration
- [ ] Column-level sync (exclude sensitive columns)
- [ ] Real-time collaboration indicators in UI
- [ ] Advanced conflict resolution UI (manual merge)
- [ ] Audit trail with rollback capability
- [ ] Scheduled sync (not just real-time)
- [ ] Data validation rules
- [ ] Bulk import/export
- [ ] PostgreSQL adapter
- [ ] GraphQL API
- [ ] Mobile app

### Performance Characteristics

**Current metrics** (with free-tier services):
- Sync latency: 2-5 seconds
- Throughput: ~100 rows/minute (Google API limited)
- Max concurrent syncs: 10-15 (connection pool limited)
- WebSocket latency: <100ms

**Theoretical max** (with paid services):
- Sync latency: <1 second (with triggers)
- Throughput: 1000+ rows/minute
- Max concurrent syncs: 100+
- Same WebSocket performance

## 🔐 Security

- ✅ **Google OAuth 2.0** - Secure authentication and authorization
- ✅ **Parameterized Queries** - Complete SQL injection prevention
- ✅ **Input Validation** - All user inputs sanitized
- ✅ **CORS** - Restricted to configured frontend origins
- ✅ **Environment Variables** - Secrets not in code
- ✅ **TLS/HTTPS** - All production traffic encrypted
- ✅ **Rate Limiting** - Google API quota compliance
- ✅ **Error Sanitization** - No stack traces to frontend in production

**Not implemented** (future work):
- Row-level security/access control
- Audit logging
- Data encryption at rest
- API key authentication (currently OAuth only)

## 📄 License

MIT

## 👨‍💻 Author

**Ayush** - [GitHub](https://github.com/ayushrskiaa)  
Internship Assignment - Superjoin

## 🙏 Acknowledgments

- Google Sheets API for comprehensive documentation
- Render.com for free hosting
- Clever Cloud for free MySQL tier
- Upstash for free Redis tier
- The open-source community
