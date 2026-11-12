@echo off
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel% equ 0 (
  echo Open http://localhost:8000/ in your browser.
  py -3 -m http.server 8000
  goto end
)
where python >nul 2>&1
if %errorlevel% equ 0 (
  echo Open http://localhost:8000/ in your browser.
  python -m http.server 8000
  goto end
)
echo Python 3 was not found. Use GitHub Pages or install Python 3 for local testing.
:end
pause
