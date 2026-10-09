@echo off
cd /d "%~dp0"
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\make-desktop-icon.ps1" -Root "%ROOT%"
if errorlevel 1 (
  echo.
  echo The Desktop icon was not created.
  pause
  exit /b 1
)
echo.
echo Done. On the Desktop, double-click BiteZone Counter.
pause
