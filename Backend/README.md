# Google Sheets ↔ MySQL Sync - Backend

Production-grade bidirectional synchronization system between Google Sheets and MySQL database with real-time change detection, conflict resolution, and multiplayer support.

## Architecture

- **Node.js/TypeScript** - Type-safe backend
- **Express** - REST API server
- **Socket.io** - Real-time WebSocket communication
- **MySQL** - Primary database with triggers for change detection
- **Redis** - Distributed locking and caching
- **Google Sheets API v4** - Sheet operations
- **Bull Queue** - Async job processing

## Features

- ✅ Schema-agnostic table synchronization
- ✅ Real-time bidirectional sync
- ✅ Conflict resolution with vector clocks
- ✅ Multiplayer support with operational transforms
- ✅ MySQL triggers for instant change detection
- ✅ Automatic retry with exponential backoff
- ✅ Rate limiting compliance
- ✅ Comprehensive error handling
- ✅ Horizontal scalability

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- Google Cloud Project with Sheets API enabled
- Google OAuth 2.0 credentials

## Setup

### 1. Install Dependencies

```bash
cd Backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# MySQL
DB_HOST=localhost
DB_PORT=3307
DB_USER=superjoin_user
DB_PASSWORD=superjoin_pass
DB_NAME=superjoin_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Sync Configuration
SYNC_INTERVAL_MS=2000
BATCH_SIZE=100
MAX_RETRIES=3

# Logging
LOG_LEVEL=info
```

### 3. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Sheets API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs: `http://localhost:3001/api/auth/google/callback`
7. Download credentials and add to `.env`

### 4. Start Infrastructure

Start MySQL and Redis using Docker Compose:

```bash
docker-compose up -d
```

This will:
- Start MySQL on port 3306 with sync triggers
- Start Redis on port 6379
- Initialize database schema from `init.sql`

### 5. Run Backend Server

Development mode with hot reload:

```bash
npm run dev
```

Production mode:

```bash
npm run build
npm start
```

The server will start on `http://localhost:3001`

## API Endpoints

### Authentication

- `GET /api/auth/google` - Initiate Google OAuth flow
- `GET /api/auth/callback` - OAuth callback
- `GET /api/auth/status` - Check auth status
- `POST /api/auth/logout` - Logout

### Sync Configuration

- `POST /api/sync/configure` - Create new sync configuration
  ```json
  {
    "spreadsheetId": "1abc...",
    "sheetName": "Sheet1",
    "tableName": "users",
    "syncMode": "bidirectional"
  }
  ```

- `GET /api/sync/configurations` - List all sync configs
- `GET /api/sync/configurations/:id` - Get specific config
- `POST /api/sync/configurations/:id/start` - Start sync
- `POST /api/sync/configurations/:id/stop` - Stop sync
- `DELETE /api/sync/configurations/:id` - Delete config

### Table Operations

- `GET /api/tables` - List all MySQL tables
- `GET /api/tables/:name` - Get table schema
- `POST /api/tables` - Create new table
- `GET /api/tables/:name/data` - Get table data

### Sync Status

- `GET /api/sync/status/:id` - Get real-time sync status
- `GET /api/sync/conflicts/:id` - Get unresolved conflicts
- `POST /api/sync/conflicts/:id/resolve` - Resolve conflict

## WebSocket Events

Connect to `ws://localhost:3001` for real-time updates:

### Client → Server

- `subscribe:sync` - Subscribe to sync status
  ```json
  { "configId": "123" }
  ```

### Server → Client

- `sync:started` - Sync initiated
- `sync:progress` - Progress update
  ```json
  {
    "configId": "123",
    "progress": 75,
    "processed": 750,
    "total": 1000
  }
  ```
- `sync:completed` - Sync finished
- `sync:error` - Error occurred
- `conflict:detected` - Conflict needs resolution

## Database Schema

### Core Tables

**sync_configurations** - Sync settings
```sql
CREATE TABLE sync_configurations (
  id VARCHAR(36) PRIMARY KEY,
  spreadsheet_id VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(255) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  sync_mode ENUM('bidirectional', 'sheets_to_mysql', 'mysql_to_sheets'),
  status ENUM('active', 'paused', 'error'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**sync_changelog** - Change tracking
```sql
CREATE TABLE sync_changelog (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(255) NOT NULL,
  operation ENUM('INSERT', 'UPDATE', 'DELETE'),
  row_id VARCHAR(255),
  old_data JSON,
  new_data JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT FALSE,
  INDEX idx_synced (synced, timestamp)
);
```

**conflict_log** - Conflict tracking
```sql
CREATE TABLE conflict_log (
  id VARCHAR(36) PRIMARY KEY,
  config_id VARCHAR(36),
  row_identifier VARCHAR(255),
  sheets_data JSON,
  mysql_data JSON,
  sheets_timestamp BIGINT,
  mysql_timestamp BIGINT,
  resolved BOOLEAN DEFAULT FALSE,
  resolution_strategy VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### MySQL Triggers

Automatically created for each synced table:

```sql
-- Example for 'users' table
CREATE TRIGGER users_after_insert
AFTER INSERT ON users FOR EACH ROW
BEGIN
  INSERT INTO sync_changelog (table_name, operation, row_id, new_data)
  VALUES ('users', 'INSERT', NEW.id, JSON_OBJECT(...));
END;
```

## Architecture Details

### Sync Flow

**MySQL → Sheets:**
1. MySQL trigger writes to `sync_changelog`
2. `MySQLToSheetsWorker` polls changelog
3. Batch changes and apply to Google Sheets
4. Handle rate limits and retries
5. Update vector clocks

**Sheets → MySQL:**
1. `GoogleSheetsService` polls sheet every 5s
2. Diff current vs previous snapshot
3. Detect cell-level changes
4. Apply to MySQL with conflict detection
5. Update vector clocks

### Conflict Resolution

When both sources change the same row:

1. **Detect**: Compare vector clocks
2. **Strategy**:
   - `last-write-wins` - Newest change wins
   - `manual` - User chooses via UI
   - `merge` - Combine changes (numeric fields use MAX)
3. **Apply**: Winner syncs to loser
4. **Log**: Store in `conflict_log`

### Multiplayer Optimization

For concurrent Google Sheets edits:

- Operational Transform (OT) algorithm
- User metadata tracking
- Change coalescing (merge sequential edits)
- Optimistic locking with Redis

### Scalability

- **Horizontal scaling**: Multiple workers via Redis pub/sub
- **Job queue**: Bull for async processing
- **Connection pooling**: MySQL pool size based on load
- **Caching**: Redis for sheet snapshots
- **Rate limiting**: Token bucket for Google API

## Testing

Run the test suite:

```bash
npm test
```

Load testing:

```bash
npm run test:load
```

## Monitoring

Logs are written to:
- Console (development)
- `logs/app.log` (production)
- `logs/error.log` (errors only)

Metrics exposed at `/metrics` (Prometheus format):
- Sync latency
- Conflict rate
- API throughput
- Error rate

## Troubleshooting

### "Google API rate limit exceeded"

- Increase `SYNC_POLL_INTERVAL` in `.env`
- Reduce `BATCH_SIZE`
- Implement request batching

### "MySQL connection pool exhausted"

- Increase pool size in `DatabaseManager.ts`
- Check for connection leaks
- Scale MySQL instance

### "Redis connection failed"

```bash
docker-compose restart redis
```

### "Sync stuck in 'processing'"

- Check worker processes: `pm2 list`
- Review logs: `tail -f logs/app.log`
- Restart sync: `POST /api/sync/configurations/:id/stop` then start

## Production Deployment

### Docker

Build and run:

```bash
docker build -t sheets-mysql-sync-backend .
docker run -p 3001:3001 --env-file .env sheets-mysql-sync-backend
```

### PM2

```bash
npm run build
pm2 start dist/index.js --name sync-backend -i max
```

### Environment Considerations

- Use managed MySQL (AWS RDS, Google Cloud SQL)
- Use managed Redis (ElastiCache, Redis Cloud)
- Set up SSL/TLS for all connections
- Enable Google Cloud Logging
- Configure auto-scaling policies
- Set up health checks (`/health` endpoint)

## Security

- OAuth tokens encrypted at rest
- SQL injection prevention via parameterized queries
- Rate limiting on all endpoints
- CORS configured for frontend origin only
- Input validation with Joi schemas
- Helmet.js security headers

## Contributing

1. Follow TypeScript strict mode
2. Add tests for new features
3. Update API documentation
4. Follow conventional commits

## License

MIT
