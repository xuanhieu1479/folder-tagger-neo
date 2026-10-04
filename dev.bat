@echo off
rem Runs the server and the Vite dev server together, against the fake library in data\dev.
rem Open http://127.0.0.1:5173. Ctrl+C stops both.
cd /d "%~dp0"
set "BUN=bun"
where bun >nul 2>nul || set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
"%BUN%" run dev
if errorlevel 1 pause
