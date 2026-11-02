@echo off
title AvenBot Automation Dashboard
color 0B
echo ===================================================
echo             AvenBot Automation Dashboard
echo ===================================================
echo.
cd /d "%~dp0"

echo [1/3] Checking Node.js environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH!
    pause
    exit /b 1
)

echo [2/3] Checking AvenBot server status...
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Server is already running on port 3001.
) else (
    echo Starting server...
    start /min "AvenBot Server" cmd /c "node server/index.js"
    timeout /t 3 /nobreak >nul
)

echo [3/3] Launching dashboard in browser...
start http://localhost:3001

echo.
echo ===================================================
echo  AvenBot is running!
echo  Dashboard: http://localhost:3001
echo.
echo  1. Enter your credentials and details in the dashboard.
echo  2. Click "Start Bot".
echo  3. The visible browser will open and perform all 14 steps live!
echo ===================================================
echo.
echo Press any key to stop the server and close...
pause >nul

echo Stopping AvenBot server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>nul
echo Done!
