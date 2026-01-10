# Quick Fix Guide

## Issue: Docker Compose Failed

**Error:** `unable to get image 'redis:7-alpine': error during connect`

**Cause:** Docker Desktop is not running

## Solution

### Option 1: Use the Setup Script (Recommended)
```powershell
.\setup-docker.ps1
```
This script will:
- Check if Docker Desktop is running
- Offer to start it automatically
- Wait for Docker to be ready
- Start MySQL and Redis containers
- Verify everything is working

### Option 2: Manual Fix

1. **Start Docker Desktop**
   - Open Docker Desktop from Start Menu
   - Wait for the whale icon to appear in system tray
   - Wait for icon to stop animating (fully started)

2. **Verify Docker is Running**
   ```powershell
   docker ps
   ```
   Should show running containers or empty table (not error)

3. **Start Containers**
   ```powershell
   cd Backend\src
   docker-compose up -d
   ```

4. **Check Container Status**
   ```powershell
   docker ps
   ```
   Should show:
   - superjoin-mysql
   - superjoin-redis

5. **Wait for MySQL to Initialize** (~30 seconds)
   ```powershell
   docker logs superjoin-mysql
   ```
   Look for: "ready for connections"

6. **Verify Database**
   ```powershell
   docker exec -it superjoin-mysql mysql -usuperjoin_user -psuperjoin_pass superjoin_db -e "SHOW TABLES;"
   ```
   Should show: _sync_changelog, _sync_state, _sync_conflicts, users

## Common Issues

### "Port 3306 already in use"
Local MySQL is running. Stop it:
```powershell
net stop MySQL80
```

Or change Docker port in `docker-compose.yml`:
```yaml
ports:
  - "3307:3306"  # Change left number only
```

### "Port 6379 already in use"
Local Redis is running. Stop it or change port:
```yaml
ports:
  - "6380:6379"  # Change left number only
```

### "Cannot start service mysql"
Remove old volumes and try again:
```powershell
docker-compose down -v
docker-compose up -d
```

### Docker Desktop Won't Start
1. Restart computer
2. Reinstall Docker Desktop
3. Check Windows Subsystem for Linux (WSL) is installed

## Next Steps After Docker is Running

1. **Configure Google Credentials**
   - Edit `Backend/.env`
   - Add your Google OAuth credentials

2. **Start Backend**
   ```powershell
   cd Backend
   npm run dev
   ```

3. **Start Frontend**
   ```powershell
   cd frontend
   npm start
   ```

Or use the automated script:
```powershell
.\start-dev.ps1
```
