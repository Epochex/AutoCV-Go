@echo off
setlocal

cd /d "%~dp0"
set "NO_OPEN="
if /i "%~1"=="--no-open" set "NO_OPEN=1"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [AutoCV Go] Node.js was not found.
  echo Install Node.js 22 LTS from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [AutoCV Go] npm was not found. Reinstall Node.js 22 LTS from https://nodejs.org/.
  pause
  exit /b 1
)

if not exist "%APPDATA%\npm" mkdir "%APPDATA%\npm"

node.exe -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 19) ? 0 : 1)"
if errorlevel 1 goto :use_temporary_runtime

where pnpm.cmd >nul 2>nul
if errorlevel 1 goto :use_temporary_pnpm
set "PNPM=call pnpm.cmd"
goto :pnpm_ready

:use_temporary_runtime
echo [AutoCV Go] The installed Node.js is too old for this project.
echo [AutoCV Go] Using temporary Node.js 22 and pnpm 10 through npm...
set "PNPM=call npm.cmd exec --yes --package=node@22 --package=pnpm@10 -- pnpm"
goto :pnpm_ready

:use_temporary_pnpm
echo [AutoCV Go] pnpm is not installed. Using temporary pnpm 10 through npm...
set "PNPM=call npm.cmd exec --yes --package=pnpm@10 -- pnpm"

:pnpm_ready

%PNPM% --version >nul
if errorlevel 1 goto :failed

echo [AutoCV Go] Installing dependencies...
%PNPM% install
if errorlevel 1 goto :failed

if not exist "node_modules\.bin\wxt.cmd" goto :failed

echo [AutoCV Go] Building the browser extension...
%PNPM% build
if errorlevel 1 goto :failed

set "OUTPUT=%CD%\.output\chrome-mv3"
echo.
echo [AutoCV Go] Build completed:
echo %OUTPUT%
echo.
echo In the extension page, enable Developer mode, choose Load unpacked,
echo and select the folder shown above.

if defined NO_OPEN exit /b 0

start "" explorer.exe "%OUTPUT%"

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "chrome://extensions"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "chrome://extensions"
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "edge://extensions"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "edge://extensions"
)

pause
exit /b 0

:failed
echo.
echo [AutoCV Go] Setup failed. Review the error above and try again.
if defined NO_OPEN exit /b 1
pause
exit /b 1
