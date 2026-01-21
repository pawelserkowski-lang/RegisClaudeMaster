@echo off
chcp 65001 >nul 2>&1
title REGIS - Node.js 25 Dev Server

echo.
echo ========================================
echo    REGIS - Node.js 25 Custom Server
echo ========================================
echo.

node --version
echo.

cd /d "%~dp0"

echo Starting dev server (bypasses Vercel CLI)...
echo.
echo    Frontend: http://localhost:5173
echo    API:      http://localhost:3001
echo.

node dev-server.mjs

pause
