@echo off
title Offline Billing System Setup and Runner
color 0b
echo =======================================================================
echo               OFFLINE BILLING SYSTEM - PC RUNNER AND SETUP
echo =======================================================================
echo.
echo Is Billing App ko aapke PC par setup karne me aapka swagat hai!
echo [Welcome to the PC application startup and setup wizard!]
echo.
echo =======================================================================
echo STEP 1: Node.js Check kijiye...
echo =======================================================================
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Aapke PC par Node.js installed nahi mila!
    echo [ERROR: Node.js was not found on your system!]
    echo.
    echo Kripya pehle Node.js install kijiye. LTS Version download karein:
    echo [Please install Node.js first. Select LTS Version:]
    echo Website Link: https://nodejs.org/
    echo.
    echo Node.js download page ko browser me khola ja raha hai...
    start https://nodejs.org/
    echo.
    echo Node.js install karne ke baad, is file ko fir se double-click karke chalayein.
    echo [After installing Node.js, run this file again.]
    pause
    exit
)

echo [OK] Node.js is installed! Version:
node -v
echo.

echo =======================================================================
echo STEP 2: Dependencies setup ki ja rahi hain (Pehli baar thoda samay lagega)...
echo        [Installing dependencies. This might take a minute...]
echo =======================================================================
if not exist "node_modules\" (
    echo Modules folder nahi mila, ise install kiya ja raha hai...
    call npm install
) else (
    echo Dependencies are already loaded. Slower checks skipped.
)

if not exist ".env" (
    if exist ".env.example" (
        echo Creating default .env configuration file from .env.example...
        copy /Y ".env.example" ".env" >nul
    )
)

echo.
echo =======================================================================
echo STEP 3: Server start kiya ja raha hai (1 PC + 2nd PC LAN Ready)...
echo        [Starting local host server on Port 3000...]
echo =======================================================================
echo.
echo App aapke default web browser me abhi khul jayegi:
echo   PC 1 (This PC): http://localhost:3000
echo.
echo   PC 2 (Dusre PC par same Wi-Fi/LAN me niche diye IP ke aage :3000 lagayein):
ipconfig | findstr /i "IPv4"
echo   Example on 2nd PC: http://192.168.1.X:3000
echo.
echo To stop the app: Close this dark terminal window.
echo [Is window ko stop karne ke liye ise cancel/close karein.]
echo.

:: Start a background process to open browser after 3 seconds so the server has time to start
start "" cmd /c "timeout /t 3 >nul && start http://localhost:3000"

:: Start the application in development mode
call npm run dev

pause
