@echo off
rem Run the Finance Dashboard as an app on Windows: double-click this file.
rem It serves the app on your own computer and opens it in its own window. Close the window to stop it. Nothing is sent anywhere.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org, then double-click this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing what the app needs. This takes a minute or two...
  call npm install
  if errorlevel 1 ( echo Install failed. & pause & exit /b 1 )
)
node scripts\run-as-app.mjs %*
if errorlevel 1 pause
