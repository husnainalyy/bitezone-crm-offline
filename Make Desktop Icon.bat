@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-desktop-icon.ps1"
if errorlevel 1 (
  echo.
  echo The Desktop icon was not created.
  pause
  exit /b 1
)
echo.
echo Done. On the Desktop, double-click BiteZone Counter.
pause
