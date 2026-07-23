@echo off
title SongCraft - Cloudflare Tunnel
color 0B
echo ================================
echo   SongCraft - Cloudflare Tunnel
echo ================================
echo.
echo Tunnel URL will appear below...
echo After tunnel starts, webhook auto-sets.
echo.
cd /d "D:\!!!PROJECTS\ГЕНЕРАТОР ПЕСЕН\.claude\worktrees\focused-goldwasser-53df14"

:: Start tunnel and capture URL
set LOG_FILE=%TEMP%\songcraft_tunnel.log
"D:\npm-global\cloudflared" tunnel --url http://localhost:3002 --no-autoupdate 2>&1 | tee "%LOG_FILE%"
pause
