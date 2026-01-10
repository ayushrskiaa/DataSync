# Stop all Superjoin services

Write-Host "Stopping Superjoin services..." -ForegroundColor Yellow
Write-Host ""

# Stop Docker containers
Set-Location "Backend\src"
Write-Host "Stopping Docker containers..." -ForegroundColor Cyan
docker-compose down

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Docker containers stopped" -ForegroundColor Green
} else {
    Write-Host "! No Docker containers to stop" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Note: Backend and Frontend processes in other windows need to be closed manually (Ctrl+C)" -ForegroundColor Yellow
Write-Host ""
Write-Host "To completely remove data volumes:" -ForegroundColor DarkGray
Write-Host "  docker-compose down -v" -ForegroundColor Gray
Write-Host ""

pause
