# 星幕剧场 · 电视版 APK v1.0.2

约 1.1 MB，minSdk 21（Android 5.0+），arm64 / armeabi-v7a 通用，带 Leanback 电视横幅。同一个包也能装在安卓手机上。

**v1.0.2 专门修了老电视白屏**：在 Android 6.0 / Chromium 44 内核（小米电视 4C 同代）的真实模拟器上已验证通过——首页 24 部片单与 24 张封面、详情 63 集、翻页 24→48、遥控器返回键全部正常，零 JS 报错。

---

## 装到电视上（小米电视 4C 这类老机型看这里）

**U 盘安装最容易踩的 3 个坑**：

1. **先开权限**：电视「设置 → 账号与安全」，把 **「安装未知来源的应用」** 和 **「米联安全」** 都设为允许。
2. **别只用桌面上的「文件管理」**：它通常只列视频/图片，APK 不显示。正确入口是 **「高清播放器」→「设备」→「移动存储设备」**，进去才能看到 U 盘里的 APK；插上 U 盘后弹出的安装提示也可以直接用。
3. **U 盘格式与文件名**：老电视对 NTFS / exFAT 支持不稳，建议格式化成 **FAT32**；把 APK 文件名改成纯英文，例如 `XingMuTV.apk`（中文文件名有些电视不列出）。

**ADB 安装**（电视开了开发者调试）：

```
adb connect 电视IP:5555
adb install -r XingMuTV-v1.0.2.apk
```

装好后在电视「我的应用」里能看到「星幕剧场」横幅。若之前装过 v1.0.1，直接覆盖安装即可（同一签名）。

---

## 遥控器操作

| 按键 | 作用 |
| --- | --- |
| 方向键 | 移动焦点（左侧导航 ⇄ 分类 ⇄ 海报 ⇄ 选集格子） |
| 确定键 | 打开详情 / 播放 / 播放器里播放-暂停 |
| 返回键 | 关详情 → 回首页 → 再按一次退出 |
| 播放器：左右 | 快退 / 快进 10 秒 |
| 播放器：上下 | 快退 / 快进 60 秒 |

设置页有「检查更新」；应用启动即查、之后每 5 分钟轮询 GitHub Releases，发现新版可下载并调起系统安装器。

---

## 这次修了什么（v1.0.1 → v1.0.2）

老电视的系统 WebView 常年停在 Chromium 44~55，而 v1.0.1 是按现代浏览器编译的，所以一打开就是白屏。逐个修掉：

| 问题 | 修复 |
| --- | --- |
| `<script type="module">` 老内核完全忽略 | esbuild 打成单个普通 IIFE 脚本 |
| `?.`、`??`、箭头函数、`let/const`、解构、`async` 语法错误 | esbuild(ES2015) + Babel preset-env 转 ES5 |
| `Object.assign` / `entries` / `matchAll` / `at` / `includes` 等 API 缺失 | 新增 ES5 `polyfills.js`，最先加载 |
| BigInt 字面量 `0n`、动态 `import()` 在解析期就报错 | 构建期消除（TV 端播放走原生播放器，用不到） |
| CSS `var()`、`inset`、`aspect-ratio`、Grid、flex `gap` 不支持 | 变量静态展开、`inset` 展开、海报改等比 padding、Grid 加 flex 兜底 |
| Babel 的 for-of 辅助函数在老 DOM 集合上抛错 | 放宽「有 length 就按数组遍历」+ 给 DOM 集合补迭代器 |
| 返回键关不掉详情 | 桥接层改点遮罩 + 补合成事件的 `key` |

另外加了**可见错误层**：以后万一再出加载错误，屏幕和 logcat 会直接写出原因，不再是一片白屏。

---

## 已知限制

1. **只能播约 10 秒预览片。** 官网公开通道对每集只放出 10 秒预览 mp4；完整剧集需要移植红果 App 通道的签名接口与 CENC 解密管线，尚未完成。播放器界面会明确标注这一点。
2. **没有账号扫码登录**，APP 观看记录同步也还没接。
3. 未做下载/离线缓存、弹幕、画质切换（官网预览通道只有 360p）。

## 自己构建

Windows 下双击项目根目录的 `打包APK.bat`，或：

```
node scripts/build-android-assets.mjs   # Vite → IIFE + ES5 转译 → CSS 降级 → 注入 polyfill
node scripts/make-icons.mjs             # 生成应用图标与电视横幅
```

构建脚本会自动完成整套兼容处理，**不要直接把 `dist-react` 拷进 `assets`**。

技术栈：Java + WebView + 系统 MediaPlayer，无第三方依赖（AGP 8.4.2 / Gradle 8.7 / JDK 17 / SDK 34）。`src/android/parsers.js` 是官网解析器，`src/android/bridge.js` 是 `window.electronAPI` 适配层，`LocalServer.java` 在 127.0.0.1 起本地静态服务避免 `file://` 的 origin 限制。工程路径不能含中文，脚本会镜像到 `D:\AndroidBuild\xmbuild` 再交给 Gradle。
