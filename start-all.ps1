# SongCraft - Full Startup Script
# Запускает сервер, туннель, устанавливает webhook и кнопку

$ProjectDir = "D:\!!!PROJECTS\ГЕНЕРАТОР ПЕСЕН\.claude\worktrees\focused-goldwasser-53df14"
$BotToken = ((Get-Content "$ProjectDir\.env" -ErrorAction SilentlyContinue | Where-Object { $_ -match '^BOT_TOKEN=' }) -replace '^BOT_TOKEN=', '').Trim()
if (-not $BotToken) { Write-Host "  ERROR: BOT_TOKEN not found in .env" -ForegroundColor Red; exit 1 }
$CloudflaredPath = "D:\npm-global\cloudflared"

Set-Location $ProjectDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SongCraft - Starting all services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Kill old processes on port 3002
$old = netstat -ano | Select-String ":3002.*LISTENING"
if ($old) {
    $pid = ($old -split "\s+")[-1]
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Start Next.js server in background window
Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "cd '$ProjectDir'; `$host.UI.RawUI.WindowTitle='SongCraft | Server :3002'; Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npm run dev -- -p 3002"

Write-Host "  [1/3] Next.js server starting..." -ForegroundColor Green
Start-Sleep -Seconds 18

# Start Cloudflare tunnel and capture URL
$tunnelLog = "$ProjectDir\cloudflare.log"
Remove-Item $tunnelLog -ErrorAction SilentlyContinue
Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "cd '$ProjectDir'; `$host.UI.RawUI.WindowTitle='SongCraft | Cloudflare'; & '$CloudflaredPath' tunnel --url http://localhost:3002 --no-autoupdate 2>&1 | Tee-Object -FilePath '$tunnelLog'"

Write-Host "  [2/3] Cloudflare tunnel starting..." -ForegroundColor Yellow
Start-Sleep -Seconds 12

# Get tunnel URL
$tunnelUrl = ""
$attempt = 0
while (-not $tunnelUrl -and $attempt -lt 20) {
    Start-Sleep -Seconds 2
    $attempt++
    if (Test-Path $tunnelLog) {
        $content = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://([a-z0-9-]+\.trycloudflare\.com)') {
            $tunnelUrl = "https://$($matches[1])"
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "  ERROR: Could not get tunnel URL" -ForegroundColor Red
    exit 1
}

Write-Host "  [3/3] Tunnel URL: $tunnelUrl" -ForegroundColor Green

# Set webhook
$webhookUrl = "$tunnelUrl/api/songcraft/bot"
$webhookBody = @{
    url = $webhookUrl
    allowed_updates = @("message", "callback_query", "pre_checkout_query")
    drop_pending_updates = $true
} | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/setWebhook" -Method POST -Body $webhookBody -ContentType "application/json; charset=utf-8" | Out-Null
Write-Host "  Webhook set: $webhookUrl" -ForegroundColor Green

# Set menu button
$menuBody = @{
    menu_button = @{
        type = "web_app"
        text = "Запустить"
        web_app = @{ url = "$tunnelUrl/songcraft" }
    }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/setChatMenuButton" -Method POST -Body $menuBody -ContentType "application/json; charset=utf-8" | Out-Null
Write-Host "  Menu button set: Запустить -> $tunnelUrl/songcraft" -ForegroundColor Green

# Update .env
(Get-Content "$ProjectDir\.env") -replace "MINI_APP_URL=.*", "MINI_APP_URL=$tunnelUrl/songcraft" | Set-Content "$ProjectDir\.env"
Write-Host "  .env updated" -ForegroundColor Green

Write-Host ""
Write-Host "  Pre-warming routes..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
@("/songcraft", "/songcraft/create", "/songcraft/songs", "/songcraft/pricing") | ForEach-Object {
    try {
        Invoke-WebRequest -Uri "$tunnelUrl$_" -TimeoutSec 90 -UseBasicParsing | Out-Null
        Write-Host "    OK: $_" -ForegroundColor Green
    } catch {
        Write-Host "    WARN: $_ - $_" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SongCraft is READY!" -ForegroundColor Green
Write-Host "  App: $tunnelUrl/songcraft" -ForegroundColor White
Write-Host "  Bot: @v3techtrackbot" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
