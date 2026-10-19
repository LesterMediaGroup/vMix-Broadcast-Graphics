@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this PC.
  echo.
  echo Install it from https://nodejs.org - choose the LTS version - then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies for the first time - this only happens once...
  call npm install --omit=dev
  if errorlevel 1 (
    echo.
    echo npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo Starting Broadcast Graphics...
echo Dashboard: http://localhost:4174
echo It restarts by itself when the app's code is updated.
echo Close this window to stop it.
echo.

call npm start

pause
