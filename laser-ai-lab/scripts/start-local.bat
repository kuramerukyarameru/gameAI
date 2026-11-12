@echo off
cd /d "%~dp0\.."
echo LASER / AI LAB - local server
echo Open http://localhost:8000 in your browser.
echo Keep this window open. Press Ctrl+C to stop.
where py >nul 2>&1
if %errorlevel% equ 0 (
  py -m http.server 8000 --bind 127.0.0.1
) else (
  python -m http.server 8000 --bind 127.0.0.1
)
pause
