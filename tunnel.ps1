$host.UI.RawUI.WindowTitle = "SongCraft | Cloudflare Tunnel"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cf = Join-Path $dir "cloudflared.exe"
$log = Join-Path $dir "tunnel.log"
$token = ((Get-Content (Join-Path $dir ".env") -ErrorAction SilentlyContinue | Where-Object { $_ -match '^BOT_TOKEN=' }) -replace '^BOT_TOKEN=', '').Trim()

while ($true) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting Cloudflare tunnel..." -ForegroundColor Cyan

    & $cf tunnel --url http://localhost:3002 2>&1 | Tee-Object -FilePath $log | ForEach-Object {
        Write-Host $_
        if ($_ -match 'https://([a-z0-9-]+\.trycloudflare\.com)') {
            $url = "https://$($Matches[1])"
            $url | Out-File (Join-Path $dir "tunnel_url.txt") -Encoding utf8
            Write-Host "  URL: $url" -ForegroundColor Green

            # Auto-update webhook
            try {
                $body = "{""url"":""$url/api/songcraft/bot"",""drop_pending_updates"":true,""allowed_updates"":[""message"",""callback_query"",""pre_checkout_query""]}"
                Invoke-RestMethod "https://api.telegram.org/bot$token/setWebhook" -Method POST -Body $body -ContentType "application/json" | Out-Null
                Write-Host "  Webhook updated!" -ForegroundColor Green
            } catch {
                Write-Host "  Webhook error: $_" -ForegroundColor Yellow
            }
        }
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tunnel died. Restarting in 3s..." -ForegroundColor Yellow
    Start-Sleep 3
}
