@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "dist\win-unpacked\星幕剧场.exe" (
  start "" "dist\win-unpacked\星幕剧场.exe"
  exit /b 0
)
for %%F in ("dist\星幕剧场-*-便携版.exe") do (
  start "" "%%~fF"
  exit /b 0
)
for %%F in ("dist\xingmu-theater-*-win-x64-setup.exe") do (
  start "" "%%~fF"
  exit /b 0
)
echo Build not found. Run: npm run build   (or double-click 开发模式.bat)
pause
