@echo off
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo BiteZone is not ready on this computer yet.
  echo The person who sets it up runs the install once.
  echo After that, double-click this file.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "%~dp0."
