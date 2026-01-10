# Docker Setup and Troubleshooting Script

Write-Host "Checking Docker Desktop status..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker Desktop is running
$dockerProcess = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue

if (-not $dockerProcess) {
    Write-Host "❌ Docker Desktop is NOT running" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start Docker Desktop:" -ForegroundColor Yellow
    Write-Host "  1. Open Docker Desktop from Start Menu" -ForegroundColor White
    Write-Host "  2. Wait for it to fully start (whale icon in system tray)" -ForegroundColor White
    Write-Host "  3. Run this script again" -ForegroundColor White
    Write-Host ""
    
    $response = Read-Host "Would you like to try to start Docker Desktop automatically? (Y/N)"
    if ($response -eq 'Y' -or $response -eq 'y') {
        Write-Host "Attempting to start Docker Desktop..." -ForegroundColor Cyan
        Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        Write-Host "Waiting for Docker Desktop to start..." -ForegroundColor Yellow
        Write-Host "(This may take 30-60 seconds)" -ForegroundColor Gray
        
        $timeout = 60
        $elapsed = 0
        while ($elapsed -lt $timeout) {
            Start-Sleep -Seconds 5
            $elapsed += 5
            
            $testDocker = docker ps 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host ""
                Write-Host "✅ Docker Desktop started successfully!" -ForegroundColor Green
                break
            }
            Write-Host "." -NoNewline -ForegroundColor Gray
        }
        
        if ($elapsed -ge $timeout) {
            Write-Host ""
            Write-Host "⚠️  Timeout waiting for Docker. Please check Docker Desktop manually." -ForegroundColor Yellow
            exit 1
        }
    } else {
        exit 1
    }
} else {
    Write-Host "✅ Docker Desktop is running" -ForegroundColor Green
}

Write-Host ""
Write-Host "Testing Docker connection..." -ForegroundColor Cyan

$dockerTest = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not responding" -ForegroundColor Red
    Write-Host ""
    Write-Host "Docker Desktop may still be starting up. Please:" -ForegroundColor Yellow
    Write-Host "  1. Check the Docker Desktop app" -ForegroundColor White
    Write-Host "  2. Wait for the whale icon to stop animating" -ForegroundColor White
    Write-Host "  3. Try running: docker ps" -ForegroundColor White
    Write-Host ""
    Write-Host "Error details:" -ForegroundColor Gray
    Write-Host $dockerTest -ForegroundColor DarkGray
    exit 1
}

Write-Host "✅ Docker is responding" -ForegroundColor Green
Write-Host ""

# Check for port conflicts
Write-Host "Checking for port conflicts..." -ForegroundColor Cyan

$portsToCheck = @(
    @{Port=3306; Name="MySQL"},
    @{Port=6379; Name="Redis"},
    @{Port=3000; Name="Frontend"},
    @{Port=3001; Name="Backend"}
)

$conflictsFound = $false
foreach ($portInfo in $portsToCheck) {
    $port = $portInfo.Port
    $name = $portInfo.Name
    
    $connection = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue -ErrorAction SilentlyContinue -InformationLevel Quiet
    
    if ($connection) {
        Write-Host "  ⚠️  Port $port ($name) is already in use" -ForegroundColor Yellow
        
        # Try to find the process
        $processInfo = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($processInfo) {
            $process = Get-Process -Id $processInfo.OwningProcess -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "     Used by: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Gray
            }
        }
        $conflictsFound = $true
    } else {
        Write-Host "  ✅ Port $port ($name) is available" -ForegroundColor Green
    }
}

Write-Host ""

if ($conflictsFound) {
    Write-Host "⚠️  Port conflicts detected!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To fix port 3306 (MySQL) conflict:" -ForegroundColor White
    Write-Host "  Option 1: Stop local MySQL service" -ForegroundColor Gray
    Write-Host "    net stop MySQL80" -ForegroundColor DarkGray
    Write-Host "  Option 2: Change Docker port in docker-compose.yml" -ForegroundColor Gray
    Write-Host "    Change '3306:3306' to '3307:3306'" -ForegroundColor DarkGray
    Write-Host ""
}

# Start Docker containers
Write-Host "Starting Docker containers..." -ForegroundColor Cyan
Set-Location "Backend\src"

docker-compose down 2>&1 | Out-Null
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start containers" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Waiting for containers to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check container status
$containers = docker ps --filter "name=superjoin" --format "{{.Names}}: {{.Status}}"

if ($containers) {
    Write-Host ""
    Write-Host "Container Status:" -ForegroundColor Cyan
    foreach ($container in $containers) {
        if ($container -match "healthy") {
            Write-Host "  ✅ $container" -ForegroundColor Green
        } else {
            Write-Host "  ⏳ $container" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "❌ No containers found" -ForegroundColor Red
    exit 1
}

# Test MySQL connection
Write-Host ""
Write-Host "Testing MySQL connection..." -ForegroundColor Cyan
$mysqlTest = docker exec superjoin-mysql mysqladmin ping -h localhost -usuperjoin_user -psuperjoin_pass 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ MySQL is accessible" -ForegroundColor Green
    
    # Check if tables exist
    $tables = docker exec superjoin-mysql mysql -usuperjoin_user -psuperjoin_pass superjoin_db -e "SHOW TABLES;" 2>&1
    if ($tables -match "_sync_") {
        Write-Host "✅ Database schema initialized" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Database tables not found" -ForegroundColor Yellow
        Write-Host "   Initialization may still be in progress..." -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️  MySQL not ready yet (may still be initializing)" -ForegroundColor Yellow
}

# Test Redis connection
Write-Host ""
Write-Host "Testing Redis connection..." -ForegroundColor Cyan
$redisTest = docker exec superjoin-redis redis-cli ping 2>&1

if ($redisTest -match "PONG") {
    Write-Host "✅ Redis is accessible" -ForegroundColor Green
} else {
    Write-Host "⚠️  Redis not ready yet" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "✅ Docker setup complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Ensure .env file has Google credentials" -ForegroundColor White
Write-Host "  2. Start backend:  cd Backend\src && npm run dev" -ForegroundColor White
Write-Host "  3. Start frontend: cd frontend && npm start" -ForegroundColor White
Write-Host ""
Write-Host "Or use the automated script:" -ForegroundColor Cyan
Write-Host "  .\start-dev.ps1" -ForegroundColor White
Write-Host ""
