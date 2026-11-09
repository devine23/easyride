@echo off
title EasyRide — Ride-Hailing Platform

echo.
echo  ============================================
echo   EASYRIDE  ^|  Quality Service Excellence
echo  ============================================
echo.

:: ── Check Node.js ──────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERROR: Node.js is not installed.
  echo  Download it from https://nodejs.org
  pause
  exit /b 1
)

:: ── Check MongoDB ───────────────────────────────────────────────────────────
echo  Checking MongoDB...
sc query MongoDB >nul 2>&1
if %errorlevel% equ 0 (
  sc start MongoDB >nul 2>&1
  echo  MongoDB service started.
) else (
  :: Try mongod directly (MongoDB installed but not as service)
  where mongod >nul 2>&1
  if %errorlevel% equ 0 (
    echo  Starting MongoDB...
    start /min "" mongod --dbpath "%USERPROFILE%\data\db" --quiet
    timeout /t 2 /nobreak >nul
  ) else (
    echo.
    echo  WARNING: MongoDB not found. Make sure it is running.
    echo  Download: https://www.mongodb.com/try/download/community
    echo.
    pause
  )
)

:: ── Start EasyRide server ───────────────────────────────────────────────────
echo  Starting EasyRide server...
cd /d "%~dp0server"
start "EasyRide Server" /min cmd /c "node src/index.js"

:: ── Wait for server to boot then open browser ──────────────────────────────
echo  Waiting for server...
timeout /t 3 /nobreak >nul

echo  Opening EasyRide in your browser...
start "" "http://localhost:5000"

echo.
echo  EasyRide is running at http://localhost:5000
echo  Close this window to keep the server running in the background.
echo.
