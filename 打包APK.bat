@echo off
chcp 65001 >nul
title 星幕剧场 TV 版 · 打包 APK
cd /d "%~dp0"

rem 允许用环境变量覆盖（换机器时不用改脚本）；未设置时用本机默认值。
if not defined JAVA_HOME set "JAVA_HOME=D:\AndroidBuild\jdk\jdk17"
if not defined ANDROID_HOME set "ANDROID_HOME=D:\AndroidBuild\sdk"
if not defined BUILD_DIR set "BUILD_DIR=D:\AndroidBuild\xmbuild"
if not defined GRADLE set "GRADLE=D:\AndroidBuild\gradle-8.7\bin\gradle.bat"

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [错误] 找不到 JDK：%JAVA_HOME%
  pause
  exit /b 1
)
if not exist "%ANDROID_HOME%\platforms" (
  echo [错误] 找不到 Android SDK：%ANDROID_HOME%
  pause
  exit /b 1
)

echo [1/4] 生成网页资源与桥接脚本
call node scripts\build-android-assets.mjs || goto :err
call node scripts\make-icons.mjs || goto :err

echo [2/4] 镜像到英文路径（AGP 不接受含中文的工程路径）
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
mkdir "%BUILD_DIR%"
copy /y android\settings.gradle "%BUILD_DIR%\" >nul
copy /y android\build.gradle "%BUILD_DIR%\" >nul
copy /y android\gradle.properties "%BUILD_DIR%\" >nul
copy /y android\local.properties "%BUILD_DIR%\" >nul
xcopy /e /i /y android\app "%BUILD_DIR%\app" >nul

echo [3/4] Gradle 构建 release APK
call "%GRADLE%" -p "%BUILD_DIR%" assembleRelease --no-daemon || goto :err

echo [4/4] 导出安装包
copy /y "%BUILD_DIR%\app\build\outputs\apk\release\app-release.apk" "星幕剧场-TV.apk" >nul
echo.
echo 完成： %CD%\星幕剧场-TV.apk
echo 电视上执行：adb install -r 星幕剧场-TV.apk   或拷贝到 U 盘用电视的安装器打开
echo.
pause
exit /b 0

:err
echo.
echo [失败] 构建中断，请查看上面的报错。
pause
exit /b 1
