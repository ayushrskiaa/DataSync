# Quick Setup Guide

## Backend Setup

### 1. Install Dependencies
```bash
cd Backend
npm install
```

### 2. Configure Environment
The `.env` file is already created. Update the Google API credentials:
- Get credentials from https://console.cloud.google.com/
- Update `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`

### 3. Start Docker Services (MySQL + Redis)
```bash
docker-compose up -d
```

Wait for services to be ready (~30 seconds), then verify:
```bash
docker ps
```

You should see:
- superjoin-mysql (host port 3307)
- superjoin-redis (port 6379)

### 4. Verify Database Initialization
```bash
docker exec -it superjoin-mysql mysql -usuperjoin_user -psuperjoin_pass superjoin_db -e "SHOW TABLES;"
```

You should see tables: _sync_changelog, _sync_state, _sync_conflicts, users

### 5. Start Backend Server
```bash
npm run dev
```

Backend should start on http://localhost:3001

### Troubleshooting Backend

**Port 3307 already in use:**
```bash
# Stop local MySQL if running
net stop MySQL80

# Or change port mapping in docker-compose.yml
```

**MySQL container won't start:**
```bash
docker-compose down -v
docker-compose up -d
```

**Cannot connect to MySQL:**
Check Docker logs:
```bash
docker logs superjoin-mysql
```

---

## Frontend Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Development Server
```bash
npm start
```

Frontend should open at http://localhost:3000

### Troubleshooting Frontend

**Port 3000 already in use:**
- Kill the process using port 3000
- Or set PORT=3001 in frontend/.env

**Module not found errors:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Cannot connect to backend:**
- Ensure backend is running on http://localhost:3001
- Check REACT_APP_API_URL in frontend/.env (if it exists)

---

## Google Sheets API Setup

### 1. Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Create new project or select existing
3. Enable **Google Sheets API**

### 2. Create OAuth Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: "Superjoin Sync"
5. Authorized redirect URIs: `http://localhost:3001/api/auth/google/callback`
6. Click **Create**
7. Copy **Client ID** and **Client Secret**

### 3. Get Refresh Token
1. Update Backend/.env with Client ID and Secret
2. Start backend server
3. Open browser: http://localhost:3001/api/auth/google
4. Login with Google account
5. Grant permissions
6. Copy the `refresh_token` from the response
7. Add it to Backend/.env as `GOOGLE_REFRESH_TOKEN`
8. Restart backend server

---

## Testing the System

### 1. Create a Test Google Sheet
1. Go to https://sheets.google.com/
2. Create a new sheet
3. Add headers in first row: id, name, email, age
4. Add some sample data
5. Copy the Spreadsheet ID from URL

### 2. Configure Sync
1. Open http://localhost:3000
2. Click "Configure New Sync"
3. Enter:
   - **Sheet ID**: (from Google Sheets URL)
   - **Sheet Name**: Sheet1
   - **Table Name**: users
   - **Conflict Resolution**: last_write_wins
4. Click "Configure Sync"

### 3. Test Bidirectional Sync

**Test Google Sheets → MySQL:**
1. Edit a cell in Google Sheets
2. Wait 2-5 seconds
3. Check MySQL:
```bash
docker exec -it superjoin-mysql mysql -usuperjoin_user -psuperjoin_pass superjoin_db -e "SELECT * FROM users;"
```
4. Verify the change appears

**Test MySQL → Google Sheets:**
1. Update MySQL:
```bash
docker exec -it superjoin-mysql mysql -usuperjoin_user -psuperjoin_pass superjoin_db -e "UPDATE users SET name='Updated Name' WHERE id=1;"
```
2. Check Google Sheets (should update within 2-5 seconds)
3. Check frontend dashboard (should show live update)

---

## Common Issues

### "Google API rate limit exceeded"
- Increase `SYNC_INTERVAL_MS` in .env to 5000 or 10000
- Reduce `BATCH_SIZE` to 50

### "MySQL trigger error"
- Drop and recreate triggers manually
- Check init.sql was executed properly

### "WebSocket connection failed"
- Check CORS settings in backend index.ts
- Ensure `FRONTEND_URL` in backend .env is correct

### "Sync not working"
- Check backend logs in Backend/logs/combined.log
- Verify both MySQL and Redis are running: `docker ps`
- Check sync status in frontend dashboard

---

## Development Workflow

### Backend Development
```bash
cd Backend
npm run dev  # Auto-reloads on file changes
```

### Frontend Development
```bash
cd frontend
npm start  # Auto-reloads on file changes
```

### View Logs
```bash
# Backend logs
tail -f Backend/logs/combined.log

# Docker logs
docker logs -f superjoin-mysql
docker logs -f superjoin-redis
```

### Database Management
```bash
# Connect to MySQL
docker exec -it superjoin-mysql mysql -usuperjoin_user -psuperjoin_pass superjoin_db

# View changelog
SELECT * FROM _sync_changelog ORDER BY timestamp DESC LIMIT 10;

# View conflicts
SELECT * FROM _sync_conflicts WHERE resolution = 'pending';

# Reset sync state
TRUNCATE TABLE _sync_changelog;
DELETE FROM _sync_state;
```

---

## Production Deployment

See individual README files:
- [Backend README](Backend/README.md)
- [Frontend README](frontend/README.md)

---

## Need Help?

1. Check logs: `Backend/logs/combined.log`
2. Check backend health: http://localhost:3001/health
3. Review error messages in browser console (F12)
4. Check Docker containers: `docker ps`
5. Verify environment variables in `.env` files
