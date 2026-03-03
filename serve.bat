@echo off
echo Starting cycling app...
echo Open http://localhost:8080 in your browser
echo Press Ctrl+C to stop
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0proxy.ps1"
pause
