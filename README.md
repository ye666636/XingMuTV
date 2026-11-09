<p align="center">
  <img src="android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png" alt="星幕剧场" width="96" />
</p>

<h1 align="center">星幕剧场</h1>

<p align="center"><strong>把短剧搬上电视大屏 —— 一个遥控器，从发现到追剧。</strong></p>

<p align="center">
  <a href="https://github.com/ye666636/XingMuTV/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/ye666636/XingMuTV?style=flat-square&label=%E6%9C%80%E6%96%B0%E7%89%88" /></a>
  <img alt="Android TV 5.0+" src="https://img.shields.io/badge/Android%20TV-5.0%2B-2ea44f?style=flat-square" />
  <img alt="APK 1.1 MB" src="https://img.shields.io/badge/APK-1.1MB-informational?style=flat-square" />
  <a href="LICENSE"><img alt="GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" /></a>
</p>

---

**为电视而生**：海报墙找剧、遥控器焦点导航、方向键选集、整屏不裁切播放、应用内更新。同一个 APK 也能装在安卓手机上，但一切交互都按大屏遥控器设计。

[下载最新 APK](https://github.com/ye666636/XingMuTV/releases/latest) · [安装说明](#安装) · [从源码构建](#从源码构建)

> 个人二次开发的开源学习项目，**不包含任何影视资源、账号或密钥**；内容来自公开网页，版权归各自权利人所有，请仅在符合当地法律与平台条款的范围内使用。

## 为什么用它

| | |
|---|---|
| **一屏看完** | 分类片单 + 热播榜 + 海报墙，翻页按钮常驻底部，不用一层层钻菜单 |
| **真·遥控器操作** | 方向键移焦点、回车确认、返回键逐级退；不用鼠标、不用触屏 |
| **画面不变形** | 竖屏短剧按原始比例满高显示，16:9 片源铺满整屏，不拉伸不裁切 |
| **自己会更新** | 启动即查 + 每 5 分钟轮询 GitHub，发现新版在应用内下载并安装 |
| **轻量** | 约 1.1 MB，Android 5.0+ 电视盒子即装即用，无第三方 SDK |

## 界面与操作

| 页面 | 内容 |
|---|---|
| 首页 | 分类（真人剧 / 漫剧 / AI 剧 / 四个热播榜）+ 海报墙，翻页按钮常驻底部 |
| 搜索 | 剧名搜索，支持翻页 |
| 观看记录 | 本机观看进度，回车续播 |
| 账号 | 接口预留，暂不支持扫码登录 |
| 设置 | 遥控器说明、版本、检查更新 |
| 播放 | 原生播放器，按视频原始比例完整显示，方向键切集 / 快进快退 |

按键：方向键移动焦点 · 回车确认 · 返回键退上一层（连按两次退出应用）· 空格播放暂停。

## 安装

发行包见 [GitHub Releases](https://github.com/ye666636/XingMuTV/releases)，minSdk 21（Android 5.0+），arm64 / armeabi-v7a 通用，支持电视 Leanback 启动器。

U 盘拷入后用电视的文件管理器打开，或：

```bash
adb connect 电视IP:5555
adb install -r XingMuTV-tv-1.0.1.apk
```

首次安装需在「设置 → 安全」允许未知来源。装好后在电视桌面「我的应用」里就能看到「星幕剧场」横幅。

## 应用内更新

- 启动立即查 GitHub Releases，之后**每 5 分钟**轮询一次，回到前台时补查；设置页还有「检查更新」按钮
- 发现更高版本的正式 Release 会弹出更新卡片，点「下载更新」由应用自己下载新 APK，下载完点「立即安装」调起系统安装器
- 弹窗、进度条、按钮都由遥控器操作；Android 8+ 首次安装需在系统设置里允许「安装未知来源应用」

> GitHub 不会主动推送，所谓"实时"是客户端轮询。你在仓库发一个更高版本号的正式 Release，电视端最多 5 分钟就会提示。

## 从源码构建

需要：Node.js ≥ 22.12、JDK 17、Android SDK 34、Gradle 8.x、Android build-tools 34。

```bash
npm install
node scripts/make-icons.mjs             # 生成应用图标与电视横幅 PNG
node scripts/build-android-assets.mjs   # Vite 构建 WebView 界面 + esbuild 打包桥接脚本
打包APK.bat                             # Windows 一键构建（也可用 gradle assembleRelease）
```

- **工程路径不能含中文**（AGP 限制），打包脚本会自动把工程镜像到 ASCII 路径再交给 Gradle。
- `android/app/keystore/` 不入库；没有自己的 keystore 时自动退回 debug 签名，clone 下来就能出包。
- 架构说明见 [`android/README.md`](android/README.md) 与 `android/app/src/main/java/` 内注释。

## 已知限制

1. **目前只能播每集约 10 秒的预览片**：官网公开通道只放出预览 mp4，完整剧集需要移植 App 片源通道的签名与解密管线（开发中）。播放器界面会明确标注。
2. 暂不支持红果账号扫码登录、APP 观看记录同步、下载/离线缓存、弹幕、画质切换。
3. 预览片源只有 360p。

## 目录结构

```
android/                        Android TV 工程（Java，无第三方依赖）
  app/src/main/java/            MainActivity(WebView) / PlayerActivity / XmBridge / ApkProvider / LocalServer
  app/src/main/res/             图标、电视横幅、主题
  app/src/main/assets/          构建生成：Vite 界面 + bridge.js（不入库）
src/tv/                         TV 界面（React）：外壳、首页、搜索、详情、记录、账号、设置、样式
src/android/parsers.js          官网页面解析器（纯 JS，WebView 侧）
src/android/bridge.js           WebView 侧 window.electronAPI 适配层（网络、播放、更新、记录）
src/components/                 共用 UI 组件（播放器、更新弹窗等）
scripts/                        资源与图标构建脚本
```

## 开源许可与上游

本项目是 **GPL-3.0 开源项目的二次开发版本**，按 GPLv3 第 5(a) 条保留原作者署名与修改声明：

- `LICENSE` — GNU General Public License v3.0 全文
- `NOTICE` — 上游仓库、修改声明、第三方组件说明
- `THIRD-PARTY-NOTICES.md` — 第三方依赖许可证
- `README.original.md` — 上游原始 README 存档（仅用于溯源，不代表本项目形态）

上游项目：`hongguo-downloader`（<https://github.com/327044572/hongguo-downloader>），后续分支见 `NOTICE` 第六节。本项目整体继续以 **GPL-3.0** 授权，不附加额外限制。

主要二次开发内容：合并两套红果短剧 TV 源码为单一「星幕剧场」大屏界面；按 unslop 方法论重做为苹果风（去渐变光晕、单一强调色、白色焦点环、8pt 栅格）；新增分类目录分页、搜索翻页；修复竖屏短剧被拉伸变形；新增整套安卓 TV 工程与应用内更新；移除上游桌面端与推广内容。

## 免责

仓库不含任何账号凭据、签名私钥或代理密码。二进制发行时请按 GPLv3 第 6 条一并提供对应完整源码。
