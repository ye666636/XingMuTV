# 星幕剧场

**只做安卓 APK** —— 一个安装包，电视和手机都能装。TV 大屏界面 + 遥控器操作，手机上也可以直接点。

> 个人二次开发的开源学习项目，**不包含任何影视资源、账号或密钥**。内容来自公开网页，版权归各自权利人所有；请仅在符合当地法律与平台条款的范围内使用。
>
> 本项目**没有 Windows / macOS / Linux 桌面版**，也没有独立的「电脑版 / 手机版」界面：整个应用只有一套 TV 界面，由安卓 APK 里的 WebView 承载。

## 界面与操作

| 页面 | 内容 |
|---|---|
| 首页 | 分类（真人剧 / 漫剧 / AI 剧 / 四个热播榜）+ 海报墙，翻页按钮常驻底部 |
| 搜索 | 剧名搜索，支持翻页 |
| 观看记录 | 本机观看进度，回车续播 |
| 账号 | 接口预留，电视版暂不支持扫码登录 |
| 设置 | 遥控器说明、版本、检查更新 |
| 播放 | 原生播放器，按视频原始比例完整显示，方向键切集 / 快进快退 |

遥控器：方向键移动焦点 · 回车确认 · 返回键退上一层（连按两次退出应用）。手机上直接触摸点击即可。

## 安装

发行包见 [GitHub Releases](https://github.com/ye666636/XingMuTV/releases)，minSdk 21（Android 5.0+），arm64 / armeabi-v7a 通用，支持电视 Leanback 启动器，也支持普通手机桌面。

**电视**：U 盘拷入后用电视的文件管理器打开，或 `adb connect 电视IP:5555 && adb install -r XingMuTV-tv-1.0.1.apk`。首次安装需在「设置 → 安全」允许未知来源。

**手机**：把 APK 传到手机直接点开安装即可；竖屏下界面会自动收窄（2 列海报、图标导航）。

## 应用内更新

- 启动立即查 GitHub Releases，之后**每 5 分钟**轮询一次，回到前台时补查；设置页还有「检查更新」按钮
- 发现更高版本的正式 Release 会弹出更新卡片，点「下载更新」由应用自己下载新 APK，下载完点「立即安装」调起系统安装器
- 弹窗、进度条、按钮都由遥控器操作；Android 8+ 首次安装需在系统设置里允许「安装未知来源应用」

> GitHub 不会主动推送，所谓"实时"是客户端轮询。你在仓库发一个更高版本号的正式 Release，设备端最多 5 分钟就会提示。

## 从源码构建

需要：Node.js ≥ 22.12、JDK 17、Android SDK 34、Gradle 8.7（或任意可用的 Gradle 8.x）、Android build-tools 34。

```bash
npm install
node scripts/make-icons.mjs             # 生成桌面图标与电视横幅 PNG
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
android/                        Android TV/手机工程（Java，无第三方依赖）
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
- `NOTICE` — 上游仓库、修改声明、第三方组件与二进制源码说明
- `THIRD-PARTY-NOTICES.md` — 第三方依赖许可证
- `README.original.md` — 上游原始 README 存档（仅用于溯源，不代表本项目形态）

上游项目：`hongguo-downloader`（<https://github.com/327044572/hongguo-downloader>），后续分支见 `NOTICE` 第六节。本项目整体继续以 **GPL-3.0** 授权，不附加额外限制。

主要二次开发内容：合并两套红果短剧 TV 源码为单一「星幕剧场」TV 界面；按 unslop 方法论重做为苹果风（去渐变光晕、单一强调色、白色焦点环、8pt 栅格）；新增分类目录分页、搜索翻页；修复竖屏短剧被拉伸变形；新增整套安卓 APK 工程与应用内更新；移除上游的桌面端、电脑版/手机版界面、自动更新与公告检查、推广内容与品牌标识。

## 免责

仓库不含任何账号凭据、签名私钥或代理密码。二进制发行时请按 GPLv3 第 6 条一并提供对应完整源码。
