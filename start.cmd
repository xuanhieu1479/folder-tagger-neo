@echo off
rem Starts Folder Tagger. Double-click this file.
cd /d "%~dp0"
set "BUN=bun"
where bun >nul 2>nul || set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
"%BUN%" scripts\start.ts
if errorlevel 1 pause
