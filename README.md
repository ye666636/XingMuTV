# 星幕剧场

家庭大屏短剧播放器。单一 TV 版界面，遥控器操作；同时提供可侧载到安卓电视 / 电视盒子的 APK。

> 这是个人二次开发的开源学习项目，**不包含任何影视资源、账号或密钥**。内容来自公开网页，版权归各自权利人所有；请仅在符合当地法律与平台条款的范围内使用。

## 界面与操作

| 页面 | 内容 |
|---|---|
| 首页 | 分类（真人剧 / 漫剧 / AI 剧 / 漫画 / 四个热播榜）+ 海报墙，翻页按钮常驻底部 |
| 搜索 | 剧名搜索 + 热门词，支持翻页 |
| 观看记录 | 本机观看进度，回车续播 |
| 账号 | 扫码登录红果账号，同步手机 APP 观看记录（桌面版） |
| 设置 | 遥控器说明与版本 |
| 播放 | 按视频原始比例完整显示，方向键切集 / 快进快退 |

按键：方向键移动焦点 · 回车确认 · 返回键（Backspace / 遥控器返回）退上一层 · 空格播放暂停。

## 账号与同步（桌面版）

「账号」页可获取红果登录二维码：手机红果 App 扫码确认后，电视端会读取手机上的 APP 观看记录（最近 50 部），可直接续播；本机观看进度独立保存，不会被账号记录覆盖。手机提示二维码无效时可用「官网登录」走官网当前提供的登录方式。

## 开发与构建（桌面版，Electron）

```bash
npm install            # 依赖（Node.js >= 22.12）
npm run dev            # 开发模式：Vite + Electron 热更新
npm run build:react    # 只构建前端资源到 dist-react/
npm run build          # Windows x64 安装包（输出 dist/）
npm run build:portable # Windows 便携版
```

开发模式下若终端注入了 `ELECTRON_RUN_AS_NODE=1`（部分 IDE / 终端会），需先清除，否则 Electron 会以 Node 方式运行：

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

## 安卓电视版（APK）

`android/` 是独立的 Android TV 工程：全屏 WebView 复用上面的 TV 界面，原生层负责网络请求、遥控器和播放（系统 MediaPlayer）。**minSdk 21（Android 5.0+）**，兼容老电视盒子，支持 Leanback 启动器。

```bash
node scripts/build-android-assets.mjs   # 生成网页资源 + 桥接脚本
node scripts/make-icons.mjs             # 生成图标与电视横幅
打包APK.bat                             # Windows 一键构建（需 JDK17 + Android SDK34 + Gradle 8.7）
```

工程路径不能包含中文，打包脚本会自动把工程镜像到 ASCII 路径再交给 Gradle。签名私钥不入库，请自行 `keytool` 生成并修改 `android/app/build.gradle` 的签名配置；缺少 keystore 时会自动退回 debug 签名，保证 clone 后能直接出包。详见 [`android/README.md`](android/README.md) 与 `android/app/src/main/java/` 内注释。

**已知限制**：安卓版当前走官网公开通道，只能播每集约 10 秒的预览片；完整剧集需要移植 App 片源通道的签名与解密管线（桌面版已实现，安卓侧尚未完成）。播放器界面上会明确标注。

## 目录结构

```
main.js                         主进程：窗口、播放、下载、账号、数据持久化
preload.js                      渲染层接口白名单（window.electronAPI）
src/Root.jsx                    入口：启动即进入 TV 版
src/tv/TVApp.jsx                TV 外壳：左侧导航 + 内容区 + 全局返回键
src/tv/TVHome.jsx               首页海报墙（方向键焦点网格、分页）
src/tv/TVSearch.jsx             搜索与翻页
src/tv/TVHistory.jsx            观看记录
src/tv/TVAccount.jsx            红果账号（扫码登录 / APP 观看记录同步）
src/tv/TVSettings.jsx           设置
src/tv/TVDetail.jsx             剧集详情（简介 / 选集 / 播放）
src/tv/focusGuard.js            键盘与鼠标焦点协调
src/tv/tv.css                   TV 版设计系统（苹果风：深石墨底 + 白色焦点环 + 8pt 栅格）
src/android/parsers.js          安卓版：官网页面解析器（纯 JS）
src/android/bridge.js           安卓版：WebView 侧 electronAPI 适配层
android/                        Android TV 原生工程（Java，无第三方依赖）
src/legacy/App.pc-and-mobile.jsx 早期电脑版 / 手机版界面，已不参与构建，仅存档
```

## 开源许可与上游

本项目是 **GPL-3.0 开源项目的二次开发版本**，按 GPLv3 第 5(a) 条保留原作者署名与修改声明，完整的上游来源、修改历史和第三方组件清单见：

- `LICENSE` — GNU General Public License v3.0 全文
- `NOTICE` — 上游仓库、修改声明、第三方组件与二进制源码说明
- `THIRD-PARTY-NOTICES.md` — 第三方依赖许可证
- `README.original.md` — 上游原始说明

上游项目：`hongguo-downloader`（<https://github.com/327044572/hongguo-downloader>），后续分支与 Mac 移植见 `NOTICE` 第六节。本项目整体继续以 **GPL-3.0** 授权，不附加任何额外限制。

主要二次开发内容：

- 合并两套红果短剧 TV 源码为单一「星幕剧场」TV 版，移除电脑版 / 手机版入口
- 按 unslop 方法论重做为苹果风 TV 界面（去渐变光晕、单一强调色、白色焦点环、8pt 栅格）
- 新增红果账号扫码登录与 APP 观看记录同步、分类目录 web 通道分页、搜索翻页
- 修复竖屏短剧被 16:9 舞台裁切 / 拉伸变形的问题
- 新增 `android/` 安卓电视工程，输出可侧载 APK（兼容 Android 5.0+）
- 移除原项目的 GitHub 自动更新与公告检查、推广内容与品牌标识

## 品牌与合规

- 品牌入口：`main.js` 的 `APP_TITLE`，`package.json` 的 `productName` / `appId` / `artifactName`，图标 `build/icon.png`。
- 内容来源与平台账号属于对应平台，本应用不提供付费分集解锁，不绕过任何访问控制。
- 仓库不包含任何账号凭据、签名私钥或代理密码；测试用的 `*-secret` 均为本地测试夹具。
- 二进制发行时请按 GPLv3 第 6 条一并提供对应完整源码。
