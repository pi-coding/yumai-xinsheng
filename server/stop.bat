@echo off
REM Stop the YuMai full-stack service (thin wrapper, all logic in start.ps1).
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1" -Stop
echo.
pause
endlocal
