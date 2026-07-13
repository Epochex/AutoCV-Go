@echo off
setlocal

cd /d "%~dp0"
set "NO_OPEN="
if /i "%~1"=="--no-open" set "NO_OPEN=1"

set "NODE_VERSION=v22.23.1"
set "TOOLS_DIR=%CD%\.autocv-tools"
set "NODE_DIR=%TOOLS_DIR%\node-%NODE_VERSION%-win-x64"
set "NODE_ZIP=%TOOLS_DIR%\node-%NODE_VERSION%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/node-%NODE_VERSION%-win-x64.zip"

if not exist "%NODE_DIR%\npm.cmd" (
  if exist "%NODE_DIR%" rmdir /s /q "%NODE_DIR%"
  if exist "%NODE_ZIP%" del /q "%NODE_ZIP%"
  echo [AutoCV Go] Downloading the private Node.js %NODE_VERSION% runtime...
  if not exist "%TOOLS_DIR%" mkdir "%TOOLS_DIR%"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%'; Expand-Archive -LiteralPath '%NODE_ZIP%' -DestinationPath '%TOOLS_DIR%' -Force"
  if errorlevel 1 goto :failed
  del /q "%NODE_ZIP%" >nul 2>nul
)

if not exist "%NODE_DIR%\npm.cmd" goto :failed

set "PATH=%NODE_DIR%;%PATH%"
set "NPM_CONFIG_UPDATE_NOTIFIER=false"
set "NPM_CONFIG_FUND=false"
if not exist "%APPDATA%\npm" mkdir "%APPDATA%\npm"

echo [AutoCV Go] Using private Node.js %NODE_VERSION% and pnpm 10.
call "%NODE_DIR%\npm.cmd" exec --yes --package=pnpm@10 -- pnpm --version >nul
if errorlevel 1 goto :failed

echo [AutoCV Go] Installing dependencies...
call "%NODE_DIR%\npm.cmd" exec --yes --package=pnpm@10 -- pnpm install
if errorlevel 1 goto :failed

if not exist "node_modules\.bin\wxt.cmd" goto :failed

echo [AutoCV Go] Building the browser extension...
call "%NODE_DIR%\npm.cmd" exec --yes --package=pnpm@10 -- pnpm build
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
