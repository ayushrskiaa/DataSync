# Start backend and frontend in development mode

Write-Host "Starting Superjoin Development Environment..." -ForegroundColor Green
Write-Host ""

# Check if Docker is running
$dockerRunning = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Start MySQL and Redis
Write-Host "Starting MySQL and Redis containers..." -ForegroundColor Cyan
Set-Location "Backend\src"
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start Docker containers." -ForegroundColor Red
    exit 1
}

Write-Host "Waiting for MySQL to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check if containers are running
$mysqlRunning = docker ps --filter "name=superjoin-mysql" --filter "status=running" -q
$redisRunning = docker ps --filter "name=superjoin-redis" --filter "status=running" -q

if (-not $mysqlRunning) {
    Write-Host "ERROR: MySQL container failed to start." -ForegroundColor Red
    docker logs superjoin-mysql
    exit 1
}

if (-not $redisRunning) {
    Write-Host "ERROR: Redis container failed to start." -ForegroundColor Red
    docker logs superjoin-redis
    exit 1
}

Write-Host "✓ Docker containers are running" -ForegroundColor Green
Write-Host ""

# Check if node_modules exist
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
    npm install
}

# Start backend in new window
Write-Host "Starting Backend Server (Port 3001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev"

# Wait a bit for backend to start
Start-Sleep -Seconds 3

# Start frontend in new window
Write-Host "Starting Frontend Server (Port 3000)..." -ForegroundColor Cyan
Set-Location "..\..\frontend"

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    npm install
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm start"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "✓ Development environment started successfully!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000 (opening in ~10 seconds)" -ForegroundColor Cyan
Write-Host ""
Write-Host "To view logs:" -ForegroundColor Yellow
Write-Host "  Backend:  Backend\src\logs\combined.log" -ForegroundColor Gray
Write-Host "  MySQL:    docker logs superjoin-mysql" -ForegroundColor Gray
Write-Host "  Redis:    docker logs superjoin-redis" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop all services:" -ForegroundColor Yellow
Write-Host "  docker-compose -f Backend\src\docker-compose.yml down" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to exit this window (services will continue running)" -ForegroundColor DarkGray

# Keep window open
pause
