# Quick Deployment to Render.com
# Run this after pushing to GitHub

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "DataSync - Render.com Deployment" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if git repo is clean
Write-Host "[1/6] Checking Git status..." -ForegroundColor Yellow
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "⚠️  You have uncommitted changes!" -ForegroundColor Red
    Write-Host "Please commit and push your changes first:" -ForegroundColor Yellow
    Write-Host "  git add ." -ForegroundColor White
    Write-Host "  git commit -m 'chore: prepare for deployment'" -ForegroundColor White
    Write-Host "  git push origin main" -ForegroundColor White
    exit 1
}
Write-Host "✅ Git repository is clean" -ForegroundColor Green
Write-Host ""

# Check if backend builds
Write-Host "[2/6] Testing backend build..." -ForegroundColor Yellow
Push-Location Backend
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "✅ Backend builds successfully" -ForegroundColor Green
Pop-Location
Write-Host ""

# Check if frontend builds
Write-Host "[3/6] Testing frontend build..." -ForegroundColor Yellow
Push-Location frontend
$env:REACT_APP_API_URL = "https://datasync-0wv9.onrender.com"
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "✅ Frontend builds successfully" -ForegroundColor Green
Pop-Location
Write-Host ""

# Check environment variables
Write-Host "[4/6] Checking environment variables..." -ForegroundColor Yellow
$envFile = "Backend\.env"
$requiredVars = @(
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI"
)

$missing = @()
foreach ($var in $requiredVars) {
    if (!(Select-String -Path $envFile -Pattern "^$var=.+" -Quiet)) {
        $missing += $var
    }
}

if ($missing.Count -gt 0) {
    Write-Host "❌ Missing environment variables:" -ForegroundColor Red
    foreach ($var in $missing) {
        Write-Host "  - $var" -ForegroundColor Yellow
    }
    exit 1
}
Write-Host "✅ All required environment variables present" -ForegroundColor Green
Write-Host ""

# Display deployment URLs
Write-Host "[5/6] Deployment URLs:" -ForegroundColor Yellow
Write-Host ""
Write-Host "🔗 Render Dashboard:" -ForegroundColor Cyan
Write-Host "   https://dashboard.render.com" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Your Repository:" -ForegroundColor Cyan
Write-Host "   https://github.com/ayushrskiaa/DataSync" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Production Backend:" -ForegroundColor Cyan
Write-Host "   https://datasync-0wv9.onrender.com" -ForegroundColor White
Write-Host ""

# Instructions
Write-Host "[6/6] Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Sign in to Render:" -ForegroundColor White
Write-Host "   https://dashboard.render.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Click 'New +' → 'Blueprint'" -ForegroundColor White
Write-Host ""
Write-Host "3. Connect your GitHub repo:" -ForegroundColor White
Write-Host "   ayushrskiaa/DataSync" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. Render will automatically read 'render.yaml'" -ForegroundColor White
Write-Host ""
Write-Host "5. Add these environment variables to backend:" -ForegroundColor White
Write-Host "   GOOGLE_CLIENT_ID=your-client-id" -ForegroundColor Cyan
Write-Host "   GOOGLE_CLIENT_SECRET=your-secret" -ForegroundColor Cyan
Write-Host "   GOOGLE_REDIRECT_URI=https://your-backend.onrender.com/api/auth/google/callback" -ForegroundColor Cyan
Write-Host ""
Write-Host "6. Update Google OAuth redirect URI:" -ForegroundColor White
Write-Host "   https://console.cloud.google.com/apis/credentials" -ForegroundColor Cyan
Write-Host ""
Write-Host "7. Generate production refresh token:" -ForegroundColor White
Write-Host "   Visit: https://your-backend.onrender.com/api/auth/google" -ForegroundColor Cyan
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "✨ Ready for deployment!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
