@echo off
chcp 65001 >nul
title XingMu Theater - Dev Mode
cd /d "%~dp0"
rem Some terminals inject ELECTRON_RUN_AS_NODE=1, which makes Electron run as plain Node.
set ELECTRON_RUN_AS_NODE=

echo ============================================
echo  XingMu Theater - Dev Mode
echo  Vite dev server + Electron window
echo ============================================
echo.

if not exist node_modules (
    echo Installing dependencies for the first run...
    call npm install
)

call npm run dev
