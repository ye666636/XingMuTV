# 第三方组件许可说明

本文件只列**本项目当前形态**（安卓电视 / 手机 APK）实际使用的第三方组件。各组件版权归其作者所有。

本项目源自 GPL-3.0 的上游桌面项目，但其桌面端组件（Electron、electron-updater、axios、FFmpeg / Librempeg、@libmedia/avplayer 等）**已从源码与发行包中全部移除**；相关历史许可信息保留在 `NOTICE` 与 `README.original.md` 中用于溯源。

---

## 运行时依赖（WebView 界面）

| 组件 | 版本 | 许可证 | 项目地址 |
|---|---|---|---|
| React | 18.3.1 | MIT | https://github.com/facebook/react |
| React DOM | 18.3.1 | MIT | https://github.com/facebook/react |
| anime4k-webgpu | 1.0.0 | MIT | https://github.com/Anime4KWebBoost/Anime4K-WebGPU |

## 构建期依赖（不随 APK 分发）

| 组件 | 许可证 |
|---|---|
| Vite | MIT |
| @vitejs/plugin-react | MIT |
| esbuild | MIT |

## 安卓平台组件

APK 使用系统自带的 Android WebView、MediaPlayer、HttpURLConnection 与 Android SDK / Gradle 构建工具，这些组件不随本 APK 打包分发，各自遵循其原始许可。

---

## Anime4K-WebGPU（MIT）

Package: anime4k-webgpu 1.0.0
Project: https://github.com/Anime4KWebBoost/Anime4K-WebGPU

Copyright (c) 2012-2023 Scott Chacon and others

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## 本软件自身

本项目基于上游项目二次开发，整体以 **GNU General Public License v3.0** 发布，
详见仓库根目录的 `LICENSE` 与 `NOTICE`。发行二进制时按 GPLv3 第 6 条一并提供对应完整源码。
