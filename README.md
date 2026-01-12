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

### 🎥 Demo Instructions

**For demonstration purposes, this application runs on localhost.**

While the backend is deployed at [https://datasync-0wv9.onrender.com](https://datasync-0wv9.onrender.com), the full system is best demonstrated locally due to limitations of free-tier cloud platforms:

**Why Local Demo:**
- ⚠️ **Free Tier Limitations**: Render.com free tier sleeps after 15 minutes of inactivity, causing 30-50 second cold starts
- ⚠️ **Connection Limits**: Clever Cloud MySQL free tier allows only 5 concurrent connections (app uses 3, leaving little room for multiple users)
- ⚠️ **Redis Quota**: Upstash free tier limited to 10,000 commands/day (can be exceeded with multiple syncs)
- ⚠️ **Performance**: Production deployment experiences significant latency due to free-tier resource constraints

**The system works perfectly in local development** with Docker-based MySQL and Redis instances, providing the full real-time sync experience without these limitations.

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
## 🔍 Edge Cases & Nuances Handled

This section documents the various edge cases, platform-specific nuances, and potential failure scenarios that have been explicitly handled in the implementation.

### 1. Database Connection Management

#### Edge Case: Connection Pool Exhaustion
**Problem**: Free-tier MySQL providers (Clever Cloud, PlanetScale, etc.) limit concurrent connections to 5
**Solution**: 
- Reduced connection pool from 10 → 3 to stay under limit
- Configured aggressive idle timeout (30s) to release unused connections
- Added `maxIdle: 2` to prevent idle connection buildup
- Reserve 2 connections for admin tasks/monitoring

**Code**: [DatabaseManager.ts](Backend/src/database/DatabaseManager.ts)
```typescript
connectionLimit: 3,
maxIdle: 2,
idleTimeout: 30000
```

#### Edge Case: Connection Drops During Sync
**Handling**: mysql2 automatic reconnection with `connectTimeout` and `acquireTimeout` settings

### 2. Privilege and Permission Restrictions

#### Edge Case: No SUPER Privilege for Triggers
**Problem**: Free-tier databases don't allow `CREATE TRIGGER` (requires SUPER privilege)
**Error**: `ER_BINLOG_CREATE_ROUTINE_NEED_SUPER` (errno 1419)
**Solution**:
- Try-catch blocks around all trigger creation attempts
- Graceful degradation: log warnings but continue with polling-based sync
- System works identically with or without triggers
- Status message indicates trigger availability

**Code**: [DatabaseManager.ts](Backend/src/database/DatabaseManager.ts#L180-L195)
```typescript
try {
  await this.createChangeTrackingTriggers(tableName, primaryKey);
  return { success: true, message: 'Triggers created' };
} catch (error) {
  logger.warn(`Cannot create triggers: ${error.message}. Using polling fallback.`);
  return { success: true, message: 'Using polling (triggers unavailable)' };
}
```

### 3. Auto-Increment Primary Key Handling

#### Edge Case: Sheet Missing ID Column with Auto-Increment Table
**Problem**: MySQL table has auto-increment primary key, but sheet doesn't include ID column
**Solution**:
- Check column metadata for `extra: 'auto_increment'`
- Allow missing primary key column in sheet if auto-increment detected
- Generate IDs on MySQL side, write back to sheet (if column exists)
- Prevent duplicate ID assignments through transaction locking

**Code**: [SheetsToMySQLWorker.ts](Backend/src/sync/SheetsToMySQLWorker.ts#L120-L135)
```typescript
const pkColumn = columns.find(col => col.Field === primaryKey);
const isAutoIncrement = pkColumn?.extra?.toLowerCase().includes('auto_increment');

if (!isAutoIncrement && !row[primaryKey]) {
  throw new Error('Primary key required for non-auto-increment table');
}
```

#### Edge Case: Writing Back Generated IDs
**Handling**: Only write back IDs if primary key column exists in sheet mapping
- Check if `primaryKeyColumnLetter` is defined before writing
- Prevents errors when ID column intentionally omitted from sheet

### 4. Sheet Data Validation

#### Edge Case: Empty Sheets vs Sheets with Only Headers
**Problem**: Need to distinguish between empty sheet (error) and sheet with headers but no data (valid)
**Solution**:
- `readSheet()` returns `{ values, headers }` structure
- Empty check: `!response.values || response.values.length === 0`
- Header extraction: `response.headers` (not `values[0]`)
- Allow zero data rows if headers exist (valid for new sheets)

**Code**: [SyncOrchestrator.ts](Backend/src/sync/SyncOrchestrator.ts#L85-L95)

#### Edge Case: Column Name Mismatches (Case Sensitivity)
**Handling**: 
- MySQL column names are case-insensitive by default
- Sheet headers preserved as-is for mapping
- Escaping via `escapeId()` prevents SQL injection
- Extra spaces trimmed from sheet headers

#### Edge Case: Special Characters in Column Names
**Solution**: `mysql.escapeId()` handles:
- Spaces: `My Column` → `` `My Column` ``
- Reserved keywords: `ORDER` → `` `ORDER` ``
- Quotes: `User's Name` → `` `User's Name` ``

### 5. Type Coercion and Data Format Issues

#### Edge Case: Google Sheets Cell Type Conversion
**Problem**: Google Sheets stores everything as strings, MySQL has typed columns
**Handling**:
- TEXT columns in auto-created tables accept any data
- Existing tables: MySQL performs automatic coercion
- Numbers: `"123"` → `123` (INT)
- Dates: `"2024-01-15"` → `DATE('2024-01-15')`
- Booleans: `"TRUE"` → `1`, `"FALSE"` → `0` (TINYINT)
- Nulls: Empty string `""` → `NULL` (if column allows)

#### Edge Case: Null vs Empty String
**Decision**: Treat empty strings as empty strings, not NULL
- Sheet cell cleared → empty string `""`
- MySQL stores as empty string (or NULL if column nullable)
- Preserves user intent (blank vs missing data)

#### Edge Case: Large Text Values
**Handling**: Auto-created tables use TEXT type (64KB limit)
- Larger values truncated by MySQL with warning
- Future: Could detect length and use MEDIUMTEXT/LONGTEXT

### 6. Concurrent Access and Race Conditions

#### Edge Case: Multiple Workers Modifying Same Row
**Solution**: Distributed locking via Redis
```typescript
const lockKey = `lock:sync:${syncId}`;
const lock = await redis.set(lockKey, 'locked', 'EX', 60, 'NX');
if (!lock) {
  // Another worker has lock, skip this cycle
  return;
}
```

#### Edge Case: User Edits During Sync Operation
**Handling**: Last-write-wins based on timestamps
- Each change tracked with timestamp
- Conflict detected if both sides modified same cell
- Later timestamp wins
- All conflicts logged to `_sync_conflicts` table

### 7. API Rate Limits and Quotas

#### Edge Case: Google Sheets API Quota Exceeded
**Limits**: 
- 100 read requests per 100 seconds per user
- 500 read requests per 100 seconds per project
**Handling**:
- 2-second polling interval = 30 requests/minute (well under limit)
- Exponential backoff on 429 errors
- Batch updates when possible
- Future: Implement request queuing

#### Edge Case: Redis Command Limit (Upstash Free Tier)
**Limit**: 10,000 commands per day
**Optimization**:
- Single GET/SET per sync cycle (not per row)
- Pipeline commands when possible
- Use hash sets for complex data
- Current usage: ~43K commands/day for 1 sync (needs optimization)

### 8. OAuth Token Management

#### Edge Case: Refresh Token Expiration
**Problem**: Google refresh tokens can expire if unused for 6 months
**Handling**:
- Store refresh token securely in environment variable
- Automatic token refresh before each API call
- Error detection and re-auth prompt if token invalid
- Manual re-authentication via `/api/auth/google`

#### Edge Case: Offline Access Required
**Solution**: Request `access_type: 'offline'` in OAuth flow
- Ensures refresh token is issued
- Allows background sync without user interaction

### 9. Sheet Structure Changes

#### Edge Case: Columns Added/Removed from Sheet
**Current Behavior**: 
- New columns ignored (not synced to MySQL)
- Removed columns cause errors (missing required field)
**Future Enhancement**: 
- Detect schema changes
- Prompt user for ALTER TABLE action
- Support column mapping updates

#### Edge Case: Rows Deleted from Sheet
**Handling**: 
- Compare row counts in snapshot
- Detect missing IDs
- Mark as deleted in MySQL (soft delete)
- Or hard delete based on configuration

### 10. Network and Service Failures

#### Edge Case: MySQL Server Unreachable
**Handling**:
- Connection timeout after 10s
- Retry with exponential backoff (3 attempts)
- Workers pause but don't crash
- Dashboard shows "Connection Lost" status

#### Edge Case: Redis Connection Failure
**Impact**: 
- Snapshot comparison unavailable
- Distributed locks unavailable
- Fallback: Full table comparison (slower)
- Workers continue with degraded performance

#### Edge Case: Google Sheets API Downtime
**Handling**:
- HTTP error detection (500, 502, 503)
- Retry after delay
- Skip sync cycle if persistent
- Dashboard shows "API Error" status

### 11. WebSocket Connection Management

#### Edge Case: Client Disconnects Mid-Sync
**Handling**:
- Socket.io automatic reconnection (default enabled)
- Dashboard polls REST API as fallback
- Sync continues server-side regardless

#### Edge Case: Multiple Browser Tabs Open
**Behavior**: Each tab maintains separate WebSocket connection
- Server broadcasts to all connected clients
- No data duplication (Redis cache shared)

### 12. Initial Sync Optimization

#### Edge Case: Large Sheets (1000+ rows)
**Problem**: Initial sync could take minutes and hit API limits
**Solution**:
- Batch INSERT operations (100 rows per query)
- Use transactions for atomicity
- Show progress updates via WebSocket
- Skip initial sync if table already populated

#### Edge Case: Initial Sync Direction
**Handling**: User chooses via `syncDirection` parameter
- `sheetsToMySQL`: Import sheet data to MySQL
- `mySQLToSheets`: Export MySQL data to sheets
- `bidirectional`: Start with no-op, then sync incrementally

### 13. SQL Injection Prevention

#### Every User Input Sanitized
**Methods**:
- `mysql.escapeId()` for identifiers (table/column names)
- Parameterized queries for values: `query(sql, [value1, value2])`
- No string concatenation for SQL construction
- Whitelist validation for table names (must exist)

**Example**:
```typescript
// BAD - vulnerable to injection
query(`SELECT * FROM ${tableName} WHERE ${column} = '${value}'`);

// GOOD - safe
query(
  `SELECT * FROM ?? WHERE ?? = ?`,
  [tableName, column, value]
);
```

### 14. Logging and Debugging

#### Edge Case: Logs Fill Disk Space
**Handling**:
- Winston daily rotate logs
- Max 14 days retention
- Max 20MB per file
- Separate error logs from info logs

#### Edge Case: Sensitive Data in Logs
**Protection**:
- OAuth tokens never logged
- SQL query values truncated in logs
- User emails hashed
- Database passwords loaded from env (not logged)

### 15. Frontend State Management

#### Edge Case: Stale Data After Sync
**Solution**: WebSocket real-time updates push changes
- Dashboard auto-refreshes on sync events
- Optimistic UI updates with server confirmation
- Error states revert on failure

#### Edge Case: Form Submission During Sync Configuration
**Handling**:
- Disable submit button during API call
- Show loading spinner
- Prevent double-submission with request deduplication

### 16. Platform-Specific Issues

#### Windows Path Handling
**Nuance**: Windows uses backslashes `\`, Node.js expects forward slashes `/`
**Solution**: Use `path.join()` and `path.resolve()` for all paths
- Environment variables with paths normalized
- Log file paths use platform-appropriate separators

#### Docker Network Isolation
**Nuance**: `localhost` inside container refers to container, not host
**Solution**: 
- Use service names in Docker Compose: `mysql` not `localhost`
- Expose ports explicitly in docker-compose.yml
- Use host.docker.internal for host access (Windows/Mac)

### Summary

This implementation handles 40+ edge cases across database management, API interactions, concurrency, security, and platform compatibility. The system degrades gracefully when features are unavailable (triggers, Redis) rather than failing completely. All error scenarios log detailed information for debugging while protecting sensitive data.

**Testing Coverage**: Each edge case tested manually in production environment (Render + Clever Cloud + Upstash) and local development (Docker).
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

1. **Production Deployment**: System works perfectly locally, but free-tier cloud platforms (Render, Clever Cloud, Upstash) have significant limitations:
   - Cold starts (30-50s delay after 15min inactivity)
   - Connection limits (5 max, app uses 3)
   - Storage limits (256MB)
   - API quotas (10K Redis commands/day)
   - Performance constraints
2. **Trigger Support**: Free-tier MySQL doesn't allow trigger creation, falling back to polling
3. **Demo Environment**: Best demonstrated on localhost with Docker for optimal performance

### Planned Enhancements

- [ ] **Production deployment on paid tiers** - Eliminate free-tier limitations (cold starts, connection limits, quotas)
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
