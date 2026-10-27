# 纸间 paperspace 官网

网站展示、自定义主题、阅读排版、使用与应用接口指引，以及 v2.0.8 同源浏览器体验。

浏览器体验运行 WASM，普通访客无需编译或访问固件仓库。GitHub Pages 首次访问会注册同源隔离 service worker 并重载一次；不缓存页面、不收集数据。建议使用支持 SharedArrayBuffer 的现代桌面 Chromium 浏览器。模拟画面不代表真实墨水屏刷新、网络、功耗或硬件性能。

所有者指定固件的方法见 [固件目标配置](OWNER-FIRMWARE-TARGET.md)。当前公开测试版安装包及 ESP32-S3 对应材料仍在核验，设备安装入口保持禁用；资源包可以独立下载。USB 工具自动识别受支持的双槽更新、空白新机安装和精确已知单槽迁移，备份与恢复边界以页面实际说明为准。测试版不代表稳定版或真机验收通过。

开源字体使用 [LXGW 霞鹜文楷 GB](https://github.com/lxgw/LxgwWenKaiGB) Mono Regular 1.530，保留 [OFL 1.1](assets/fonts/OFL.txt)。其他版权、许可及修改版 epdiy 对应源/重链接材料见 [许可与鸣谢](legal.html)。固件完整私有应用源码、私书和内部审阅资料不在本仓库中。

项目基于 MindReset 的 [Read Pico Demo Firmware](https://github.com/MindReset/read_pico_firmware) 二次开发，paperspace 独立维护，并非 MindReset 官方发布。上游 Apache-2.0 原文和版权保留于 [许可与鸣谢](legal.html#project-origin)；第三方组件适用各自许可证。
