# 纸间 paperspace 官网

网站展示、自定义主题、阅读排版、使用与应用接口指引，以及 v2.0.8 同源浏览器体验。

浏览器体验运行 WASM，普通访客无需编译或访问固件仓库。GitHub Pages 首次访问会注册同源隔离 service worker 并重载一次；不缓存页面、不收集数据。建议使用支持 SharedArrayBuffer 的现代桌面 Chromium 浏览器。模拟画面不代表真实墨水屏刷新、网络、功耗或硬件性能。

固件说明见 [v2.1.1 安装与验证](docs/firmware-v2.1.1.md)，维护者指定目标的方法见 [固件目标配置](OWNER-FIRMWARE-TARGET.md)。当前安装目标为 v2.1.1 正式渠道精简构建（云端测试候选），USB 工具自动获取并核验原始镜像，无需下载 ZIP 或手选固件包；资源与 ESP32-S3 对应重链接材料可以独立下载。只支持已登记的精确布局、全片空白新机和受信双槽底座；未知布局及未登记的旧双槽 bootloader 拒写。单槽迁移的软件验证已覆盖根文件、含子目录的兼容 WL/FAT12 以及全空存储；仍须先保存完整备份，中断后可能需借助外部工具按原布局恢复，网页无自动恢复。备份与恢复边界以刷机页实际说明为准。正式渠道不等于 GitHub Release 或真机验收；本站 v2.0.8 浏览器体验、原帧及轻应用指南仍展示旧版能力，不代表 2.1.1 精简版的功能。本构建尚未完成真机验证，写入读回不代表启动、显示或数据验收通过。

开源字体使用 [LXGW 霞鹜文楷 GB](https://github.com/lxgw/LxgwWenKaiGB) Mono Regular 1.530，保留 [OFL 1.1](assets/fonts/OFL.txt)。其他版权、许可及修改版 epdiy 对应源/重链接材料见 [许可与鸣谢](legal.html)。固件完整私有应用源码、私书和内部审阅资料不在本仓库中。

项目基于 MindReset 的 [Read Pico Demo Firmware](https://github.com/MindReset/read_pico_firmware) 二次开发，paperspace 独立维护，并非 MindReset 官方发布。上游 Apache-2.0 原文和版权保留于 [许可与鸣谢](legal.html#project-origin)；第三方组件适用各自许可证。
