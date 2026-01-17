# Fix Git History - Remove Exposed Credentials

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Fixing Git History" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "This will:" -ForegroundColor Yellow
Write-Host "1. Squash last 2 commits into 1" -ForegroundColor White
Write-Host "2. Remove credentials from git history" -ForegroundColor White
Write-Host "3. Force push clean history" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Continue? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Aborted." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[1/3] Resetting to clean state..." -ForegroundColor Yellow
git reset --soft HEAD~2

Write-Host "[2/3] Creating clean commit..." -ForegroundColor Yellow
git add .
git commit -m "docs: add deployment guides and submission materials

- Added comprehensive deployment guide for Render.com, Docker, and K8s
- Created assignment submission checklist
- Added deployment automation script
- Removed PostgreSQL files (project uses MySQL only)
- Fixed all credential references to use placeholders
- Ready for production deployment"

Write-Host "[3/3] Force pushing to GitHub..." -ForegroundColor Yellow
git push origin gravity --force

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host "✅ Success! Git history cleaned" -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your branch is now clean and pushed!" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "❌ Push failed. Check the error above." -ForegroundColor
Red
    exit 1
}
