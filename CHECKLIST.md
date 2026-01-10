# Pre-Flight Checklist ✈️

Use this checklist before starting the application.

## ✅ Prerequisites

- [ ] Node.js 18+ installed
  ```powershell
  node --version  # Should show v18.x or higher
  ```

- [ ] npm installed
  ```powershell
  npm --version
  ```

- [ ] Docker Desktop installed and running
  ```powershell
  docker --version
  docker ps  # Should not show errors
  ```

- [ ] Git installed (optional, for version control)
  ```powershell
  git --version
  ```

## ✅ Google Cloud Setup

- [ ] Google Cloud project created
- [ ] Google Sheets API enabled in project
- [ ] OAuth 2.0 credentials created
- [ ] Redirect URI configured: `http://localhost:3001/api/auth/google/callback`
- [ ] Client ID copied to `Backend/.env`
- [ ] Client Secret copied to `Backend/.env`

## ✅ Configuration Files

- [ ] `Backend/.env` exists
- [ ] `Backend/.env` has valid `GOOGLE_CLIENT_ID`
- [ ] `Backend/.env` has valid `GOOGLE_CLIENT_SECRET`
- [ ] `Backend/.env` has `DB_HOST=localhost`
- [ ] `Backend/.env` has `DB_PORT=3307`
- [ ] `Backend/.env` has `REDIS_HOST=localhost`
- [ ] `Backend/.env` has `REDIS_PORT=6379`

## ✅ Port Availability

Check if required ports are free:

```powershell
# Check port 3000 (Frontend)
Test-NetConnection -ComputerName localhost -Port 3000

# Check port 3001 (Backend)
Test-NetConnection -ComputerName localhost -Port 3001

# Check port 3307 (MySQL)
Test-NetConnection -ComputerName localhost -Port 3307

# Check port 6379 (Redis)
Test-NetConnection -ComputerName localhost -Port 6379
```

**If ports are in use:**
- Port 3307: Stop local MySQL service or change port in `docker-compose.yml`
- Port 6379: Stop local Redis or change port in `docker-compose.yml`
- Port 3000/3001: Kill the process or change port in application

## ✅ First-Time Setup

- [ ] Backend dependencies installed
  ```powershell
  cd Backend
  npm install
  ```

- [ ] Frontend dependencies installed
  ```powershell
  cd frontend
  npm install
  ```

- [ ] Docker containers started
  ```powershell
  cd Backend
  docker-compose up -d
  ```

- [ ] MySQL is healthy
  ```powershell
  docker ps  # Should show superjoin-mysql (healthy)
  docker exec -it superjoin-mysql mysql -usuperjoin_user -psuperjoin_pass superjoin_db -e "SHOW TABLES;"
  ```

- [ ] Redis is healthy
  ```powershell
  docker ps  # Should show superjoin-redis (healthy)
  docker exec -it superjoin-redis redis-cli ping  # Should return PONG
  ```

## ✅ Application Running

- [ ] Backend server started
  ```powershell
  cd Backend
  npm run dev
  ```
  - Check console for "Server running on port 3001"
  - Visit http://localhost:3001/health (should return JSON)

- [ ] Frontend server started
  ```powershell
  cd frontend
  npm start
  ```
  - Browser should open automatically
  - Visit http://localhost:3000

## ✅ Google Authentication

- [ ] Visit http://localhost:3001/api/auth/google
- [ ] Google OAuth consent screen appears
- [ ] Login successful
- [ ] Refresh token received
- [ ] Refresh token added to `Backend/.env` as `GOOGLE_REFRESH_TOKEN`
- [ ] Backend server restarted

## ✅ Test Sync

- [ ] Created a test Google Sheet
- [ ] Copied Spreadsheet ID from URL
- [ ] Opened frontend at http://localhost:3000
- [ ] Clicked "Configure New Sync"
- [ ] Entered Sheet ID and selected table
- [ ] Sync created successfully
- [ ] Edited a cell in Google Sheets
- [ ] Change appears in MySQL within 5 seconds
- [ ] Updated MySQL record
- [ ] Change appears in Google Sheets within 5 seconds
- [ ] Live update shown in frontend dashboard

## 🔧 Troubleshooting

If any item fails, see [SETUP.md](SETUP.md) for detailed troubleshooting steps.

### Quick Fixes

**Docker not running:**
```powershell
# Start Docker Desktop from Start Menu
```

**Port conflicts:**
```powershell
# Find process using port 3307
netstat -ano | findstr :3307
# Kill it
taskkill /PID <PID> /F
```

**Containers not starting:**
```powershell
cd Backend
docker-compose down -v
docker-compose up -d
```

**Node modules issues:**
```powershell
# Backend
cd Backend
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install

# Frontend
cd frontend
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

**Backend errors:**
```powershell
# Check logs
Get-Content Backend/logs/combined.log -Tail 50
```

**Frontend errors:**
```powershell
# Clear cache and restart
cd frontend
Remove-Item -Recurse -Force node_modules/.cache
npm start
```

---

## ✅ All Checks Passed?

You're ready to go! 🚀

Run the application:
```powershell
.\start-dev.ps1
```

Or manually:
```powershell
# Terminal 1: Start Docker
cd Backend
docker-compose up -d

# Terminal 2: Start Backend
cd Backend
npm run dev

# Terminal 3: Start Frontend
cd frontend
npm start
```

Then visit http://localhost:3000 to start using the application!
