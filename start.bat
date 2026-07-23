@echo off
title SongCraft - Next.js Server :3002
color 0A
cd /d "%~dp0"
echo ================================
echo   SongCraft - Next.js Server
echo   Port: 3002
echo ================================
echo.
npm run dev -- -p 3002
pause
