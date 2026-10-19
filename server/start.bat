@echo off
REM Start the YuMai full-stack service (thin wrapper, all logic in start.ps1).
REM Double-click to start; window closes on success, stays open on error.
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1" %*
if errorlevel 1 (
    echo.
    echo Startup failed. Check the messages above or runtime.log.
    pause
)
endlocal
