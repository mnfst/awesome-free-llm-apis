@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
	echo Node.js 20 or newer is required to run Noah Tool AI.
	echo Opening the official Node.js download page...
	start "" "https://nodejs.org/"
	pause
	exit /b 1
)

for /f "tokens=1 delims=v." %%v in ('node --version') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
	echo Noah Tool AI needs Node.js 20 or newer. Your version is %NODE_MAJOR%.
	echo Download the current version from https://nodejs.org/
	start "" "https://nodejs.org/"
	pause
	exit /b 1
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173/api/catalog' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto open_app

start "Noah Tool AI server" cmd /k node noah-tool-ai\server.js
for /l %%i in (1,1,20) do (
	powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173/api/catalog' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
	if not errorlevel 1 goto open_app
	timeout /t 1 /nobreak >nul
)

echo Noah Tool AI did not start. Check the server window for the error.
pause
exit /b 1

:open_app
start "" "http://127.0.0.1:4173"
endlocal
