# 星幕剧场 · 安卓电视版（APK）

发行包：约 1.1 MB 的 APK（minSdk 21 / Android 5.0+，arm64 与 armeabi-v7a 通用）。一个包同时支持电视 Leanback 启动器和普通手机桌面；不强制横屏，手机竖屏下会自动收窄排版。可自行按下方步骤构建，或从本仓库 Releases 下载。

## 怎么装到电视上

**方式一：U 盘**
1. 把 `星幕剧场-TV-v0.1.0.apk` 拷到 U 盘
2. 电视插 U 盘 → 打开「文件管理 / 媒体管理器」找到这个文件 → 点安装
3. 第一次会提示「禁止安装未知来源应用」，去「设置 → 安全 → 允许安装未知来源」打开后重试

**方式二：ADB（电视开了开发者调试）**
```
adb connect 电视IP:5555
adb install -r 星幕剧场-TV-v0.1.0.apk
```
装好后在电视桌面「我的应用」里能看到「星幕剧场」横幅；在手机上就是普通应用图标。

## 遥控器操作

| 按键 | 作用 |
| --- | --- |
| 方向键 | 移动焦点（左侧导航 ⇄ 片单 ⇄ 分类 / 选集格子） |
| 确定键 | 打开剧集详情 / 播放 / 播放器里播放-暂停 |
| 返回键 | 关详情 → 回首页 → 再按一次退出应用 |
| 播放器：左右 | 快退 / 快进 10 秒 |
| 播放器：上下 | 快进 60 秒 / 快退 60 秒 |

## 这一版做了什么

- 全屏 WebView 承载「星幕剧场」TV 界面，遥控器焦点、选集、分页都在；手机上可直接触摸点击
- 原生网络层（Java HttpURLConnection）：首页片单、分类热播榜、搜索（含翻页）、剧集详情与分集全部走红果官网真实数据，绕开 WebView 的跨域限制
- 原生播放器（MediaPlayer + SurfaceView）：解析官网 `VideoObject` 直链，按原始比例播放，不拉伸不变形
- 观看记录记在本地（本机 60 条），首页/搜索/详情/播放全链路已在 1080p 安卓电视模拟器上跑通

## 已知限制（重要）

1. **只能播约 10 秒预览片。** 官网公开通道（网页端）对每集只放出 10 秒预览 mp4；完整剧集需要移植红果 App 通道的签名接口与 CENC 解密管线，目前尚未完成。播放器界面会明确标注这一限制。
2. **没有账号扫码登录。** 账号页会显示「电视版暂不支持红果账号扫码登录」，APP 观看记录同步也还没接。
3. 未做下载/离线缓存、弹幕、画质切换（官网预览通道只有 360p）。

## 怎么重新打包

Windows 下双击项目根目录的 `打包APK.bat`，或在命令行跑：

```
node scripts/build-android-assets.mjs   # 构建网页 + 桥接脚本 → android/app/src/main/assets
node scripts/make-icons.mjs             # 生成应用图标与电视横幅
```

技术栈约定（便于后续维护）：

- `android/` 安卓工程，Java，无第三方依赖（AGP 8.4.2 + Gradle 8.7，JDK 17，SDK 34）
- `src/android/parsers.js` 官网解析器（解析规则与上游一致，纯字符串/JSON 解析）
- `src/android/bridge.js` WebView 侧 `window.electronAPI` 适配层，编译成 `assets/bridge.js` 注入 index.html
- `LocalServer.java` 在 127.0.0.1 起本地静态服务，避免 `file://` 下 ES module / localStorage 被拦导致白屏
- 工程路径不能含中文，构建脚本会自动镜像到 `D:\AndroidBuild\xmbuild` 再交给 Gradle
