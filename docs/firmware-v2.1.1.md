# v2.1.1 stable 精简固件与 USB 安装

本固件使用源码 `3abe593b3ad208229aaf734b879af2f5081c6cec` 的 stable 精简配置和 ESP-IDF v6.1 构建。stable 表示功能渠道；当前软件验证不代表 GitHub Release 或真实硬件验收。此构建经过路径净化与 ELF 规范化，校验值与同标签的其他构建可以不同。

官网 USB 工具读取固定目标并自动获取、校验镜像，不需要下载 ZIP、选择本地固件或手选分区。仅适用于已登记的 Read Pico / ESP32-S3 / 16 MiB / Zbit 硬件与布局；芯片识别不能单独证明板型。本精简版不包含独立 HTML 浏览器、PDF、应用中心、Lua 轻应用和开发者实验入口。网站 v2.0.8 浏览器体验及对应指南仍展示旧版能力。

## 安装路径与数据

- 已登记双槽：保留原启动应用及内部数据，写入非启动槽并读回验证后提交 OTA；无需强制保存整片备份。
- 全片空白新机：首次擦除前完整只读扫描 16 MiB；发现已有数据即停止，不因分区表空白就判断整机空白。
- 已登记单槽：只迁移通过兼容 WL/FAT12 检查的内部存储；写入前必须将完整备份保存到本机，关闭文件并读回核验摘要。同一个刷机按钮完成必要备份和迁移，取消或保存失败不会开始写入。

未知分区、未登记旧 bootloader、真实 Secure Boot/Flash 加密保护、不能可信读取的安全状态均拒绝写入。单槽迁移不是掉电原子事务；中断后可能需要外部工具与原匹配底座恢复，网页没有自动恢复能力。不要为安装修改 eFuse 或关闭设备安全设置。

## 文件与完整性

|文件|字节|SHA-256|
|---|---:|---|
|[应用](../firmware/v2.1.1/Read_Pico.bin)|3338288|`3bd0d10257bdad0020bc72ee7c4f37c0e3d26e2be41132a41f3c7ba4b34e7310`|
|[bootloader](../firmware/v2.1.1/bootloader/bootloader.bin)|21232|`de9684ab654050d83dbf651b5eeb2d9f42af1ac85a10277c6d1ba7a2f64b8b4e`|
|[分区表](../firmware/v2.1.1/partition_table/partition-table.bin)|3072|`cd4ff0257b302884afa9c8961a8d3ffa26851b03b8b97db3d602e04f0b88f5ae`|
|[初始 OTA 数据](../firmware/v2.1.1/ota_data_initial.bin)|8192|`7d2c7ac4888bfd75cd5f56e8d61f69595121183afc81556c876732fd3782c62f`|

固定地址和镜像关系见 [安装清单](../firmware/v2.1.1/manifest.json)；目标策略见 [配置说明](../OWNER-FIRMWARE-TARGET.md)。已登记旧 bootloader 只有精确 SHA-256 `2f3d2e3b17f259b5b2cedda68d214074a906860475d4b681bba97d20c2f0a316`，不据版本号推定其他底座兼容。

## 软件验证与复现

独立软件验收覆盖三种安装路径、26项安全状态、31项寄存器回执契约、24项寄存器回归，以及写前状态变化、错误读回、备份保存失败、取消、迟到结果和重复点击。包含原生 Chromium OPFS 写入、关闭和读回完整备份的软件检查。仓库提供 [寄存器回归](../tests/register-security-regression.mjs) 和 [浏览器流程回归](../tests/installer-flow-regression.mjs) 两个可复现入口；命令与依赖见 [维护说明](../scripts/engine-adaptation/README.md)。协议设备、端口选择及部分文件接口由模型替代；原生 OPFS 检查不等于操作系统文件选择器或外部磁盘持久性的保证。

固件、安装器、测试和模型必须绑定同一版本。当前引擎 SHA-256 为 `1bbb21dd0490df7417c8ec6abf152378fe03cd097b3b106e4be387bf62e06dd2`，刷机页面模块 SHA-256 为 `46b7aef556f7273f30a43f0cf68b3c9306cc4e215b508be81f7b2aaa4a847e13`。写入读回通过不代表真实启动、显示、硬件兼容或物理掉电恢复已经通过；上述真机项目尚未验证。

## 来源与许可

paperspace 基于 MindReset 的 Read Pico Demo Firmware 二次开发，独立维护，并非上游官方发布。来源、版权及许可见 [许可与鸣谢](../legal.html)。[对应重链接材料](../downloads/paperspace-v2.1.1-stable-esp32s3-relink-materials.zip)包含必要的已编译应用对象、修改版库源码、链接脚本和许可证，不含私有应用 C/C++ 源码。编译对象可被反汇编分析，接收者可按许可替换库后重链接、安装及为调试修改进行必要逆向。

材料 ZIP 为 9391512 字节，SHA-256 `99aae319373d20174184c10a514cfcae8dabbbfacb334681b73afdd01c01f2de`。ZIP 使用 LZMA 方法14，可用 Python 3 解包：`python3 -m zipfile -e paperspace-v2.1.1-stable-esp32s3-relink-materials.zip relink-materials`。设备安装由官网自动获取镜像；普通刷机无需先下载该材料包。
